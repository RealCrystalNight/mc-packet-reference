#!/usr/bin/env node
// scripts/generate-source.js
// Builds the Minecraft 1.8.9 source browser from the sparse MavenMCP clone
// (scripts/fetch-mcp-src.sh → vendor/MavenMCP-1.8.9/src):
//
//   source/index.html                     package/class browser + search
//   source/<pkg>/<Class>/index.html       one SEO page per Java class
//   source/<pkg>/index.html               per-package class listing
//   source/src/main/java/<...>.java       raw source mirrors (downloadable)
//   source/src/main/resources/<...>       raw resource/asset mirrors
//   source/resources/index.html           resource tree listing
//   api/source.json                       machine index of every class
//   sitemap-source.xml                    sitemap for the whole section
//
// If vendor/graphify-out/graph.json exists (graphify extract), class pages
// gain a "Code Graph" section with crawlable dependency links.
//
// Usage: node scripts/generate-source.js
'use strict';

const fs = require('fs');
const path = require('path');
const { esc, hubNav, siteFooter, cvViewerScript } = require('./site-chrome');
const { loadClassGraph, neighboursOf } = require('./graph-lib');

const BASE = path.join(__dirname, '..');
let SITE;
try { const cfg = require('../config.json'); SITE = cfg.SITE || 'https://realcrystalnight.github.io/mc-packet-reference'; }
catch (e) { SITE = 'https://realcrystalnight.github.io/mc-packet-reference'; }

const MCP_ROOT = process.env.MCP_ROOT || path.join(BASE, 'vendor', 'MavenMCP-1.8.9');
const SRC_JAVA = path.join(MCP_ROOT, 'src', 'main', 'java');
const SRC_RES = path.join(MCP_ROOT, 'src', 'main', 'resources');
const GRAPH_JSON = process.env.GRAPH_JSON || path.join(BASE, 'vendor', 'graphify-out', 'graph.json');

const OUT = path.join(BASE, 'source');
const RAW = path.join(OUT, 'src');
const BLOB = 'https://github.com/Marcelektro/MavenMCP-1.8.9/blob/master/src/main/java';

function relPrefix(absDir) {
  const r = path.relative(absDir, BASE).split(path.sep).join('/');
  return r ? r + '/' : './';
}
function fsize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}
function today() { return new Date().toISOString().slice(0, 10); }
function walk(dir, base, out) {
  out = out || [];
  base = base || dir;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

// ---- Java source analysis -------------------------------------------------
function cleanJavadoc(raw) {
  let s = raw.replace(/\r/g, '').split('\n').map(function(l) { return l.replace(/^\s*\*\s?/, ''); }).join(' ');
  s = s.replace(/\{@\w+ ([^}]*)\}/g, '$1').replace(/@\w+(\s+[^\s].*)?/g, ' ').replace(/\s+/g, ' ').trim();
  const dot = s.indexOf('. ');
  if (dot > 20 && dot < 220) s = s.slice(0, dot + 1);
  return s.slice(0, 260);
}
function analyzeJava(code, fallbackName) {
  const lines = code.split('\n');
  const pkg = (code.match(/^[ \t]*package\s+([\w.]+)\s*;/m) || [null, ''])[1];
  const declRe = /^[ \t]*(?:public\s+|final\s+|abstract\s+|strictfp\s+)*(class|interface|enum|@interface)\s+(\w+)([^{]*)\{/m;
  const m = code.match(declRe);
  let kind = 'class', name = fallbackName, ext = '', impl = '', javadoc = '';
  if (m) {
    kind = m[1]; name = m[2];
    ext = ((m[3] || '').match(/extends\s+([\w.<>]+)/) || [null, ''])[1];
    impl = ((m[3] || '').match(/implements\s+([^{]+)/) || [null, ''])[1].replace(/\s+/g, ' ').trim();
    const jd = code.slice(0, m.index).match(/\/\*\*([\s\S]*?)\*\/\s*$/);
    if (jd) javadoc = cleanJavadoc(jd[1]);
  }
  const methods = [];
  const methRe = /^[ \t]*(?:public|protected)\s+(?:static\s+|final\s+|synchronized\s+|abstract\s+|native\s+|default\s+)*([\w$.<>\[\], ?]+?)\s+([\w$]+)\s*\(([^;{}]*)\)\s*(?:\{|throws)/gm;
  let mm;
  while ((mm = methRe.exec(code)) && methods.length < 200) {
    const args = (mm[3] || '').replace(/\s+/g, ' ').trim();
    methods.push((mm[1].trim() + ' ' + mm[2] + '(' + args + ')').replace(/\s+/g, ' '));
  }
  return { pkg: pkg, name: name, kind: kind, ext: ext, impl: impl, javadoc: javadoc, methods: methods, lines: lines.length, bytes: Buffer.byteLength(code, 'utf8') };
}
function roleOf(rel) {
  if (/(^|\/)client(\/|$)/.test(rel)) return 'client';
  if (/(^|\/)server(\/|$)/.test(rel)) return 'server';
  return 'common';
}

// ---- page assembly --------------------------------------------------------
function headBlock(opts) {
  const prefix = opts.prefix;
  return '<!DOCTYPE html>\n<html lang="en" data-theme="dark">\n<head>\n'
    + '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
    + '<title>' + esc(opts.title) + '</title>\n'
    + '<meta name="description" content="' + esc(opts.desc) + '">\n'
    + (opts.keywords ? '<meta name="keywords" content="' + esc(opts.keywords) + '">\n' : '')
    + '<meta name="author" content="MC Packet Reference">\n'
    + '<meta name="robots" content="' + (opts.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large') + '">\n'
    + '<meta name="referrer" content="strict-origin-when-cross-origin">\n'
    + '<meta name="theme-color" content="#0a0a0a">\n'
    + '<link rel="manifest" href="' + prefix + 'assets/site.webmanifest">\n'
    + '<link rel="icon" href="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><text y=\'.9em\' font-size=\'90\'>\u{1F4E6}</text></svg>">\n'
    + '<link rel="canonical" href="' + opts.canonical + '">\n'
    + '<meta property="og:title" content="' + esc(opts.title) + '">\n'
    + '<meta property="og:description" content="' + esc(opts.desc) + '">\n'
    + '<meta property="og:type" content="article">\n'
    + '<meta property="og:url" content="' + opts.canonical + '">\n'
    + '<meta property="og:site_name" content="MC 1.8.9 Packet Reference">\n'
    + '<meta property="og:image" content="' + SITE + '/assets/og-image.png">\n'
    + '<meta name="twitter:card" content="summary_large_image">\n'
    + '<meta name="twitter:title" content="' + esc(opts.title) + '">\n'
    + '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">\n'
    + '<link rel="stylesheet" href="' + prefix + 'css/style.css">\n'
    + '<link rel="stylesheet" href="' + prefix + 'assets/github-dark.min.css">\n'
    + (opts.jsonld || '')
    + '</head>\n<body>\n';
}
function sidebarBlock(prefix, extraNav) {
  return '<aside class="sidebar" id="sidebar">\n'
    + '  <div class="sidebar-header">\n'
    + '    <a href="' + prefix + '" class="logo" style="text-decoration:none">\n'
    + '      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 7h10M7 12h10M7 17h6"/></svg>\n'
    + '      <span>MC <strong>1.8.9</strong></span>\n'
    + '    </a>\n'
    + '  </div>\n'
    + '  <nav class="sidebar-nav" id="sidebarNav">' + hubNav(prefix) + (extraNav || '') + '</nav>\n'
    + '</aside>\n';
}
function mainOpen() {
  return '<main class="main" id="main">\n'
    + '<button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle sidebar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg></button>\n'
    + '  <div class="content-detail" style="display:block;max-width:960px;margin:0 auto;padding:40px 48px 80px;width:100%">\n';
}
function crumbs(items) {
  return '<nav class="crumbs" aria-label="Breadcrumb" style="font-size:0.78rem;color:var(--text-muted);margin-bottom:14px">'
    + items.map(function(it, i) {
        const sep = i ? '<span style="margin:0 6px">\u203a</span>' : '';
        return sep + (it.url && i < items.length - 1 ? '<a href="' + it.url + '" style="color:var(--accent)">' + esc(it.name) + '</a>' : '<span>' + esc(it.name) + '</span>');
      }).join('') + '</nav>\n';
}
function sourceViewer(code, fileLabel, lines, blob) {
  const rows = code.split('\n').map(function(line, i) {
    return '<tr class="cv-row"><td class="cv-ln"><span class="cv-num">' + (i + 1) + '</span></td>'
      + '<td class="cv-code"><pre><code>' + esc(line) + '</code></pre></td></tr>';
  }).join('\n');
  return '<div class="code-viewer"><div class="cv-toolbar">'
    + '<span class="cv-file">' + esc(fileLabel) + '</span>'
    + '<span class="cv-meta">' + lines + ' lines \u00b7 MCP 1.8.9 \u00b7 verbatim</span>'
    + '<button class="cv-copy">Copy</button>'
    + '<a class="cv-link" href="' + blob + '" target="_blank" rel="noopener">Original \u2197</a>'
    + '</div><div class="cv-body"><table class="cv-table">' + rows + '</table></div></div>';
}

function main() {
  if (!fs.existsSync(SRC_JAVA)) {
    console.error('MCP source not found at ' + SRC_JAVA + '\nRun scripts/fetch-mcp-src.sh first.');
    process.exit(1);
  }

  console.log('== generate-source.js ==');
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(RAW, { recursive: true });

  // 1. Mirror raw sources + resources so every file is directly served.
  fs.cpSync(SRC_JAVA, path.join(RAW, 'main', 'java'), { recursive: true });
  let resCount = 0;
  if (fs.existsSync(SRC_RES)) {
    fs.cpSync(SRC_RES, path.join(RAW, 'main', 'resources'), { recursive: true });
    resCount = walk(SRC_RES).length;
  }
  console.log('  mirrored raw src/main/java + ' + resCount + ' resource files');

  // 2. Graph (optional) — class-level neighbours for the SEO pages.
  const gg = loadClassGraph(GRAPH_JSON);
  if (gg) console.log('  graph: ' + gg.counts.files + ' classes, ' + gg.counts.communities + ' communities');
  else console.log('  graph: none (run graphify extract; dependency sections skipped)');

  // 3. Walk java sources, analyse, and build page data.
  const javaFiles = walk(SRC_JAVA);
  const classes = [];
  const pkgMembers = {};
  const codeCache = {};
  const mtimeMap = {};
  for (const rel of javaFiles) {
    const abs = path.join(SRC_JAVA, rel);
    const code = fs.readFileSync(abs, 'utf8');
    const fallback = path.basename(rel).replace(/\.java$/, '');
    const a = analyzeJava(code, fallback);
    if (!a.pkg) a.pkg = path.dirname(rel).replace(/\//g, '.');
    const slug = rel.replace(/\.java$/, '');
    a.rel = rel; a.slug = slug; a.role = roleOf(rel);
    a.url = 'source/' + slug + '/';
    classes.push(a);
    codeCache[rel] = code;
    mtimeMap[rel] = fs.statSync(abs).mtime.toISOString().slice(0, 10);
    (pkgMembers[a.pkg] = pkgMembers[a.pkg] || []).push(a);
  }
  classes.sort(function(a, b) { return a.pkg.localeCompare(b.pkg) || a.name.localeCompare(b.name); });
  const packages = Object.keys(pkgMembers).sort();
  const totalLines = classes.reduce(function(n, c) { return n + c.lines; }, 0);
  console.log('  analysed ' + classes.length + ' classes in ' + packages.length + ' packages (' + totalLines.toLocaleString('en-US') + ' lines)');

  // 4. One page per class + a package index page per package.
  const peersByPkg = {};
  packages.forEach(function(p) {
    peersByPkg[p] = pkgMembers[p].slice().sort(function(a, b) { return a.name.localeCompare(b.name); });
  });

  const seenClassDir = {};
  classes.forEach(function(c) {
    const outDir = path.join(OUT, c.slug);
    fs.mkdirSync(outDir, { recursive: true });
    const prefix = relPrefix(outDir);
    const pageUrl = SITE + '/source/' + c.slug + '/';
    const rawRel = 'src/main/java/' + c.rel;
    const desc = (c.pkg ? c.pkg + '.' + c.name : c.name) + ' \u2014 ' + c.kind + ' in the deobfuscated MCP 1.8.9 source'
      + (c.ext ? ', extends ' + c.ext : '') + '. ' + (c.javadoc || ('Full source, ' + c.lines + ' lines.'));
    const metaDesc = desc.length > 158 ? desc.slice(0, 155) : desc;

    // same-package peers (cap) + graph neighbours
    const peers = peersByPkg[c.pkg].filter(function(o) { return o.rel !== c.rel; }).slice(0, 60);
    const peerChips = peers.map(function(o) {
      return '<a class="related-chip" href="' + prefix + 'source/' + o.slug + '/">' + esc(o.name) + '</a>';
    }).join('');

    let graphHtml = '';
    if (gg) {
      const nb = neighboursOf(gg, c.rel).slice(0, 80);
      if (nb.length) {
        const chips = nb.map(function(n) {
          const rels = n.relations.join(',');
          return '<a class="related-chip" data-rel="' + esc(rels) + '" href="' + prefix + 'source/' + n.file.replace(/\.java$/, '') + '/">' + esc(n.label) + ' <span style="opacity:.6;font-size:.62rem">' + esc(rels) + '</span></a>';
        }).join('');
        graphHtml = '      <div class="detail-section"><h3>Code Graph \u2014 Dependencies (' + nb.length + ')</h3><div class="related-list">' + chips + '</div>'
          + '<p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">Edges (calls / imports / inherits / references) resolved by <a href="' + prefix + 'source/graph/" style="color:var(--accent)">graphify</a> from the AST. Every chip opens the class source.</p></div>\n';
      }
    }

    const methodChips = c.methods.length
      ? '<div class="mcp-block">' + c.methods.slice(0, 120).map(function(sig) { return '<div class="mcp-row"><code>' + esc(sig) + '</code></div>'; }).join('') + '</div>'
        + (c.methods.length > 120 ? '<p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">\u2026and ' + (c.methods.length - 120) + ' more (see full source).</p>' : '')
      : '<p style="font-size:0.82rem;color:var(--text-muted)">No public/protected methods detected (fields or constants only).</p>';

    const jsonld = '<script type="application/ld+json">\n' + JSON.stringify({
      '@context': 'https://schema.org', '@type': 'SoftwareSourceCode',
      name: (c.pkg ? c.pkg + '.' : '') + c.name,
      codeSampleType: 'full',
      programmingLanguage: 'Java',
      runtimePlatform: 'Minecraft Java Edition 1.8.9 (protocol 47)',
      codeRepository: 'https://github.com/Marcelektro/MavenMCP-1.8.9',
      url: pageUrl,
      description: metaDesc,
      about: { '@type': 'SoftwareApplication', name: 'Minecraft Java Edition', version: '1.8.9' }
    }) + '\n</script>\n'
      + '<script type="application/ld+json">\n' + JSON.stringify({
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
          { '@type': 'ListItem', position: 2, name: 'Source Browser', item: SITE + '/source/' },
          { '@type': 'ListItem', position: 3, name: c.pkg || 'default', item: SITE + '/source/' + path.dirname(c.slug) + '/' },
          { '@type': 'ListItem', position: 4, name: c.name, item: pageUrl }
        ]
      }) + '\n</script>\n';

    const peerNav = peers.length
      ? '<div class="nav-section"><div class="nav-section-header"><span>' + esc(c.pkg || 'default') + '</span><span class="count">' + pkgMembers[c.pkg].length + '</span></div><div class="nav-items">'
        + pkgMembers[c.pkg].slice(0, 80).map(function(o) {
            return '<a href="' + prefix + 'source/' + o.slug + '/" class="nav-item' + (o.rel === c.rel ? ' active' : '') + '"><span class="nav-name">' + esc(o.name) + '</span></a>';
          }).join('') + '</div></div>'
      : '';

    const html = headBlock({ prefix: prefix, title: c.name + ' \u2014 ' + (c.pkg ? c.pkg + ' ' : '') + '\u2014 Minecraft 1.8.9 Source', desc: metaDesc, canonical: pageUrl, jsonld: jsonld,
        keywords: 'Minecraft, 1.8.9, source, MCP, deobfuscated, ' + c.name + ', ' + c.pkg + ', Java, ' + c.kind + ', ' + c.role + (c.ext ? ', extends ' + c.ext : '') })
      + sidebarBlock(prefix, peerNav)
      + mainOpen()
      + '    <div class="detail-header">\n'
      + crumbs([{ name: 'Home', url: prefix }, { name: 'Source Browser', url: prefix + 'source/' }, { name: c.pkg || 'default', url: prefix + 'source/' + path.dirname(c.slug) + '/' }, { name: c.name }])
      + '      <h1>' + esc(c.name) + ' <span class="detail-hex">.java</span></h1>\n'
      + '      <p class="detail-desc">' + esc(c.javadoc || (c.name + ' is a ' + c.kind + ' in ' + (c.pkg || 'the default package') + ' in the deobfuscated MCP 1.8.9 source.')) + '</p>\n'
      + '      <div class="detail-meta"><span class="meta-mcp">' + esc(c.pkg) + '</span>'
      + '<span class="badge state">' + esc(c.kind) + '</span>'
      + '<span class="badge">' + c.lines.toLocaleString('en-US') + ' lines</span>'
      + '<span class="badge">' + esc(c.role) + '</span>'
      + (c.ext ? '<span class="badge">extends ' + esc(c.ext) + '</span>' : '')
      + '<span class="badge">' + fsize(c.bytes) + '</span></div>\n'
      + '    </div>\n'
      + '    <div class="detail-body">\n'
      + '      <div class="detail-section"><h3>File</h3><div class="related-list">'
      + '<a class="related-chip" href="' + prefix + 'source/' + rawRel + '" download>\u2b07 Download ' + esc(path.basename(c.rel)) + '</a>'
      + '<a class="related-chip" href="' + prefix + 'source/' + rawRel + '">View raw</a>'
      + '<a class="related-chip" href="' + BLOB + '/' + c.rel + '" target="_blank" rel="noopener">Original on GitHub \u2197</a>'
      + '</div></div>\n'
      + (c.impl ? '      <div class="detail-section"><h3>Implements</h3><div class="related-list"><span class="related-chip">' + esc(c.impl) + '</span></div></div>\n' : '')
      + '      <div class="detail-section"><h3>API Surface (' + c.methods.length + ')</h3>' + methodChips + '</div>\n'
      + (peerChips ? '      <div class="detail-section"><h3>Same Package (' + (pkgMembers[c.pkg].length - 1) + ')</h3><div class="related-list">' + peerChips + '</div></div>\n' : '')
      + graphHtml
      + '      <div class="detail-section"><h3>Full Source</h3>\n      ' + sourceViewer(codeCache[c.rel], c.name + '.java', c.lines, BLOB + '/' + c.rel) + '\n'
      + '      <p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">Deobfuscated MCP 1.8.9 source of <code>' + esc(c.name) + '</code> from <a href="https://github.com/Marcelektro/MavenMCP-1.8.9" target="_blank" rel="noopener" style="color:var(--accent)">Marcelektro/MavenMCP-1.8.9</a> (' + esc(c.rel) + '), stored verbatim.</p></div>\n'
      + '    </div>\n'
      + siteFooter(prefix)
      + '  </div>\n</main>\n'
      + '<script src="' + prefix + 'assets/highlight.min.js"></script>\n'
      + cvViewerScript() + '\n</body>\n</html>';
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
    seenClassDir[c.slug] = true;
  });
  console.log('  wrote ' + classes.length + ' class pages');

  // 5. Per-package index pages (source/<pkg>/index.html).
  packages.forEach(function(p) {
    const members = pkgMembers[p];
    const outDir = path.join(OUT, p.split('.').join('/'));
    // never clobber a class dir of the same path
    if (seenClassDir[p.split('.').join('/')]) return;
    fs.mkdirSync(outDir, { recursive: true });
    const prefix = relPrefix(outDir);
    const pageUrl = SITE + '/source/' + p.split('.').join('/') + '/';
    const title = p + ' \u2014 Minecraft 1.8.9 Source';
    const desc = p + ': ' + members.length + ' deobfuscated MCP 1.8.9 Java classes (' + members.map(function(m) { return m.name; }).slice(0, 14).join(', ') + ').';
    const rows = members.map(function(m) {
      return '<a class="section-packet-row" href="' + prefix + 'source/' + m.slug + '/">'
        + '<span class="row-hex">' + (m.kind === 'interface' ? 'if' : (m.kind === 'enum' ? 'en' : 'cl')) + '</span>'
        + '<span class="row-name">' + esc(m.name) + '</span>'
        + '<span class="row-desc">' + esc((m.javadoc || '').slice(0, 140)) + '</span>'
        + '<span class="row-modules">' + m.lines + ' ln</span></a>';
    }).join('\n');
    const pkgJsonLd = '<script type="application/ld+json">\n' + JSON.stringify({
      '@context': 'https://schema.org', '@type': 'CollectionPage', name: p + ' \u2014 Minecraft 1.8.9 Source', description: desc, url: pageUrl,
      isPartOf: { '@type': 'WebSite', name: 'MC 1.8.9 Packet Reference', url: SITE + '/' }
    }) + '\n</script>\n'
      + '<script type="application/ld+json">\n' + JSON.stringify({
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: 'Source Browser', item: SITE + '/source/' }, { '@type': 'ListItem', position: 3, name: p, item: pageUrl }]
      }) + '\n</script>\n';
    const html = headBlock({ prefix: prefix, title: title, desc: desc, canonical: pageUrl, jsonld: pkgJsonLd, keywords: 'Minecraft, 1.8.9, ' + p + ', source, MCP, Java' })
      + sidebarBlock(prefix, '')
      + mainOpen()
      + '    <div class="detail-header">\n'
      + crumbs([{ name: 'Home', url: prefix }, { name: 'Source Browser', url: prefix + 'source/' }, { name: p }])
      + '      <h1>' + esc(p) + '</h1>\n'
      + '      <p class="detail-desc">' + members.length + ' deobfuscated MCP 1.8.9 classes in this package.</p>\n'
      + '    </div>\n    <div class="detail-body">\n    <div class="section-packet-list">\n' + rows + '\n    </div>\n    </div>\n'
      + siteFooter(prefix)
      + '  </div>\n</main>\n'
      + '<script>(function(){var t=document.getElementById(\'sidebarToggle\');if(t)t.addEventListener(\'click\',function(){document.getElementById(\'sidebar\').classList.toggle(\'open\');});})();</script>\n'
      + '</body>\n</html>';
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
  });
  console.log('  wrote ' + packages.length + ' package pages');

  // 6. Resources index (one page, grouped directory tree).
  let resourcesHtml = '';
  if (resCount) {
    const files = walk(SRC_RES).sort();
    const byDir = {};
    files.forEach(function(f) {
      const d = path.dirname(f);
      (byDir[d] = byDir[d] || []).push(f);
    });
    const dirs = Object.keys(byDir).sort();
    resourcesHtml = '<h2 style="font-size:1.05rem;font-weight:600;margin:24px 0 10px">Resources (' + files.length + ' files)</h2>'
      + dirs.map(function(d) {
          const links = byDir[d].sort().map(function(f) {
            const n = path.basename(f);
            return '<a class="static-packet-link" href="../src/main/resources/' + encodeURI(f) + '">' + esc(n) + '</a>';
          }).join('');
          return '<div class="detail-section"><h3>' + esc(d) + ' <span style="color:var(--text-muted);font-size:0.78rem">(' + byDir[d].length + ')</span></h3><div class="static-packet-links">' + links + '</div></div>';
        }).join('\n');
  }

  // 7. Source browser index.
  const byArea = {};
  packages.forEach(function(p) {
    // group by net.minecraft.<x> (or the first two path segments)
    const parts = p.split('.');
    const area = parts.length > 2 ? parts.slice(0, 2).join('.') : p;
    (byArea[area] = byArea[area] || []).push(p);
  });
  const areas = Object.keys(byArea).sort();
  const indexPrefix = relPrefix(OUT);
  const areasHtml = areas.map(function(area) {
    const pkgList = byArea[area].map(function(p) {
      const members = pkgMembers[p].slice().sort(function(a, b) { return a.name.localeCompare(b.name); });
      const links = members.map(function(m) {
        return '<a class="static-packet-link src-class-link" data-name="' + esc((p + '.' + m.name).toLowerCase()) + '" href="' + indexPrefix + 'source/' + m.slug + '/">' + esc(m.name) + '</a>';
      }).join('');
      return '<div class="pkg-group" data-pkg="' + esc(p.toLowerCase()) + '"><h4 style="font-family:var(--font-mono);font-size:0.82rem;margin:14px 0 6px;color:var(--text-secondary)">' + esc(p) + ' <span style="color:var(--text-muted)">(' + members.length + ')</span></h4><div class="static-packet-links">' + links + '</div></div>';
    }).join('\n');
    return '<div class="detail-section src-area"><h3 id="' + esc(area.replace(/\./g, '-')) + '">' + esc(area) + '</h3>\n' + pkgList + '\n</div>';
  }).join('\n');

  const indexDesc = 'Browse the complete deobfuscated Minecraft 1.8.9 (protocol 47) source: ' + classes.length + ' MCP Java classes in ' + packages.length + ' packages and ' + resCount + ' resource assets, each with syntax-highlighted source and a code dependency graph.';
  const indexJsonLd = '<script type="application/ld+json">\n' + JSON.stringify({
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    name: 'Minecraft 1.8.9 Source Browser',
    description: indexDesc,
    url: SITE + '/source/',
    isPartOf: { '@type': 'WebSite', name: 'MC 1.8.9 Packet Reference', url: SITE + '/' },
    about: { '@type': 'SoftwareSourceCode', name: 'Minecraft Java Edition 1.8.9', codeRepository: 'https://github.com/Marcelektro/MavenMCP-1.8.9', programmingLanguage: 'Java' }
  }) + '\n</script>\n'
    + '<script type="application/ld+json">\n' + JSON.stringify({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: 'Source Browser', item: SITE + '/source/' }]
    }) + '\n</script>\n';

  const indexHtml = headBlock({ prefix: indexPrefix, title: 'Minecraft 1.8.9 Source Code \u2014 ' + classes.length + ' MCP 1.8.9 Classes', desc: indexDesc, canonical: SITE + '/source/', jsonld: indexJsonLd, keywords: 'Minecraft 1.8.9 source code, MCP 1.8.9, deobfuscated, net.minecraft, decompiled, Java, ' + classes.length + ' classes' })
    + sidebarBlock(indexPrefix, '')
    + mainOpen()
    + '    <div class="detail-header">\n'
    + crumbs([{ name: 'Home', url: indexPrefix }, { name: 'Source Browser' }])
    + '      <h1>Minecraft 1.8.9 Source</h1>\n'
    + '      <p class="detail-desc">' + esc(indexDesc) + '</p>\n'
    + '      <div class="detail-meta"><span class="badge state">' + classes.length + ' classes</span><span class="badge">' + packages.length + ' packages</span><span class="badge">' + totalLines.toLocaleString('en-US') + ' lines</span><span class="badge">' + resCount + ' resources</span></div>\n'
    + '    </div>\n    <div class="detail-body">\n'
    + '      <div class="detail-section"><h3>Find a class</h3>'
    + '        <input id="srcSearch" type="search" placeholder="Filter ' + classes.length + ' classes by name or package\u2026" autocomplete="off" style="width:100%;padding:10px 14px;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-size:0.9rem;font-family:var(--font-sans)">'
    + '        <p id="srcCount" style="font-size:0.75rem;color:var(--text-muted);margin-top:8px">' + classes.length + ' classes</p></div>\n'
    + '      <div class="detail-section"><h3>Jump to area</h3><div class="related-list">'
    + areas.map(function(a) { return '<a class="related-chip" href="#' + esc(a.replace(/\./g, '-')) + '">' + esc(a) + '</a>'; }).join('')
    + (gg ? '<a class="related-chip" href="' + indexPrefix + 'source/graph/">Code Graph \u2192</a>' : '')
    + '</div></div>\n'
    + areasHtml + '\n'
    + (resourcesHtml ? '      <div class="detail-section"><h3>Assets &amp; Resources</h3><p style="font-size:0.85rem;color:var(--text-secondary)">' + resCount + ' verbatim resource files (lang files, models, blockstates, shaders, textures). <a href="' + indexPrefix + 'source/resources/" style="color:var(--accent)">Browse all resources \u2192</a></p></div>\n' : '')
    + '    </div>\n'
    + siteFooter(indexPrefix)
    + '  </div>\n</main>\n'
    + '<script>(function(){var t=document.getElementById(\'sidebarToggle\');if(t)t.addEventListener(\'click\',function(){document.getElementById(\'sidebar\').classList.toggle(\'open\');});'
    + 'var i=document.getElementById(\'srcSearch\');if(i){var links=[].slice.call(document.querySelectorAll(\'.src-class-link\'));var groups=[].slice.call(document.querySelectorAll(\'.pkg-group\'));var areasEl=[].slice.call(document.querySelectorAll(\'.src-area\'));var c=document.getElementById(\'srcCount\');'
    + 'i.addEventListener(\'input\',function(){var q=i.value.trim().toLowerCase();var n=0;links.forEach(function(a){var m=!q||a.getAttribute(\'data-name\').indexOf(q)!==-1;a.style.display=m?\'\':\'none\';if(m)n++;});'
    + 'groups.forEach(function(g){g.style.display=[].slice.call(g.querySelectorAll(\'.src-class-link\')).some(function(a){return a.style.display!==\'none\';})?\'\':\'none\';});'
    + 'areasEl.forEach(function(s){s.style.display=[].slice.call(s.querySelectorAll(\'.src-class-link\')).some(function(a){return a.style.display!==\'none\';})?\'\':\'none\';});'
    + 'if(c)c.textContent=n+(n===1?\' class\':\' classes\');});} })();</script>\n'
    + '</body>\n</html>';
  fs.writeFileSync(path.join(OUT, 'index.html'), indexHtml);
  console.log('  wrote source/index.html');

  // 8. Resources index page.
  if (resCount) {
    const rdir = path.join(OUT, 'resources');
    fs.mkdirSync(rdir, { recursive: true });
    const rPrefix = relPrefix(rdir);
    const rTitle = 'Minecraft 1.8.9 Resources & Assets \u2014 MCP 1.8.9';
    const rDesc = resCount + ' verbatim Minecraft 1.8.9 resource files from MavenMCP: language files, blockstates, models, shaders, texts and textures.';
    const rJsonLd = '<script type="application/ld+json">\n' + JSON.stringify({
      '@context': 'https://schema.org', '@type': 'CollectionPage', name: rTitle, description: rDesc, url: SITE + '/source/resources/',
      isPartOf: { '@type': 'WebSite', name: 'MC 1.8.9 Packet Reference', url: SITE + '/' }
    }) + '\n</script>\n';
    const rHtml = headBlock({ prefix: rPrefix, title: rTitle, desc: rDesc, canonical: SITE + '/source/resources/', jsonld: rJsonLd, keywords: 'Minecraft 1.8.9 resources, assets, textures, shaders, lang, blockstates, models' })
      + sidebarBlock(rPrefix, '')
      + mainOpen()
      + '    <div class="detail-header">\n' + crumbs([{ name: 'Home', url: rPrefix }, { name: 'Source Browser', url: rPrefix + 'source/' }, { name: 'Resources' }])
      + '      <h1>Resources &amp; Assets</h1>\n      <p class="detail-desc">' + esc(rDesc) + '</p>\n    </div>\n    <div class="detail-body">\n'
      + resourcesHtml
      + '    </div>\n' + siteFooter(rPrefix)
      + '  </div>\n</main>\n'
      + '<script>(function(){var t=document.getElementById(\'sidebarToggle\');if(t)t.addEventListener(\'click\',function(){document.getElementById(\'sidebar\').classList.toggle(\'open\');});})();</script>\n</body>\n</html>';
    fs.writeFileSync(path.join(rdir, 'index.html'), rHtml);
    console.log('  wrote source/resources/index.html');
  }

  // 9. Machine index.
  const apiDir = path.join(BASE, 'api');
  fs.mkdirSync(apiDir, { recursive: true });
  const apiClasses = classes.map(function(c) {
    return { name: c.name, fqcn: (c.pkg ? c.pkg + '.' : '') + c.name, package: c.pkg, kind: c.kind, role: c.role, extends: c.ext || undefined, lines: c.lines, bytes: c.bytes, file: c.rel, raw: SITE + '/source/src/main/java/' + c.rel, url: SITE + '/' + c.url };
  });
  fs.writeFileSync(path.join(apiDir, 'source.json'), JSON.stringify({ site: SITE, version: '1.8.9', source: 'Marcelektro/MavenMCP-1.8.9', count: apiClasses.length, packages: packages.length, lines: totalLines, resources: resCount, classes: apiClasses }, null, 1));
  console.log('  wrote api/source.json');

  // 10. Sitemap for the section.
  const urls = [];
  urls.push({ loc: SITE + '/source/', lastmod: today(), p: '0.9', f: 'weekly' });
  if (resCount) urls.push({ loc: SITE + '/source/resources/', lastmod: today(), p: '0.5', f: 'monthly' });
  if (gg) {
    urls.push({ loc: SITE + '/source/graph/', lastmod: today(), p: '0.8', f: 'weekly' });
    urls.push({ loc: SITE + '/source/graph/graph.html', lastmod: today(), p: '0.6', f: 'weekly' });
    urls.push({ loc: SITE + '/source/graph/tree.html', lastmod: today(), p: '0.5', f: 'weekly' });
  }
  classes.forEach(function(c) { urls.push({ loc: SITE + '/' + c.url, lastmod: mtimeMap[c.rel], p: '0.6', f: 'monthly' }); });
  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map(function(u) { return '  <url><loc>' + u.loc + '</loc><lastmod>' + u.lastmod + '</lastmod><changefreq>' + u.f + '</changefreq><priority>' + u.p + '</priority></url>'; }).join('\n')
    + '\n</urlset>\n';
  fs.writeFileSync(path.join(BASE, 'sitemap-source.xml'), sitemap);
  console.log('  wrote sitemap-source.xml (' + urls.length + ' urls)');
  console.log('== done ==');
}

main();
