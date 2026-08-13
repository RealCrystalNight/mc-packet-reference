#!/usr/bin/env node
// scripts/generate-pages.js
// Generates one standalone HTML page per packet under packets/<id>/index.html
// Each page has full sidebar nav, unique SEO meta, rich embeds, and detail view.
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = path.join(__dirname, '..');
const PACKETS_DIR = path.join(BASE, 'data', 'packets');
const OUT_DIR = path.join(BASE, 'packets');

let SITE;
try { const cfg = require('../config.json'); SITE = cfg.SITE || 'https://realcrystalnight.github.io/mc-packet-reference'; } catch (e) { SITE = 'https://realcrystalnight.github.io/mc-packet-reference'; }

const GROUPS = [
  { label: 'Handshaking', state: 'HANDSHAKING', dir: 'SERVERBOUND' },
  { label: 'Login \u2192 Server', state: 'LOGIN', dir: 'SERVERBOUND' },
  { label: 'Login \u2192 Client', state: 'LOGIN', dir: 'CLIENTBOUND' },
  { label: 'Status \u2192 Server', state: 'STATUS', dir: 'SERVERBOUND' },
  { label: 'Status \u2192 Client', state: 'STATUS', dir: 'CLIENTBOUND' },
  { label: 'Play \u2192 Server', state: 'PLAY', dir: 'SERVERBOUND' },
  { label: 'Play \u2192 Client', state: 'PLAY', dir: 'CLIENTBOUND' }
];

// Protocol state + direction -> MCP package path (same mapping as fetch-vanilla-sources.js)
const STATE_DIR = {
  'HANDSHAKING|SERVERBOUND': 'handshake/client',
  'LOGIN|SERVERBOUND': 'login/client',
  'LOGIN|CLIENTBOUND': 'login/server',
  'STATUS|SERVERBOUND': 'status/client',
  'STATUS|CLIENTBOUND': 'status/server',
  'PLAY|SERVERBOUND': 'play/client',
  'PLAY|CLIENTBOUND': 'play/server'
};
function mcpPathFor(pkt) {
  const dir = STATE_DIR[pkt.state + '|' + pkt.dir];
  return dir ? 'net/minecraft/network/' + dir + '/' + pkt.id + '.java' : null;
}
const VANILLA_DIR = path.join(BASE, 'data', 'vanilla');
const MAVEN_BLOB = 'https://github.com/Marcelektro/MavenMCP-1.8.9/blob/master/src/main/java';

// Full vanilla MCP source of a packet class, fetched at build time from
// Marcelektro/MavenMCP-1.8.9 (scripts/fetch-vanilla-sources.js) — never the
// local disk copies.
function loadVanillaSource(pkt) {
  const rel = mcpPathFor(pkt);
  if (!rel) return null;
  const cached = path.join(VANILLA_DIR, pkt.id + '.java');
  if (fs.existsSync(cached)) {
    return { rel: rel, code: fs.readFileSync(cached, 'utf8'), blob: MAVEN_BLOB + '/' + rel };
  }
  return null;
}

function renderVanillaSource(pkt) {
  const v = loadVanillaSource(pkt);
  if (!v) return '';
  const code = v.code.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '');
  const lines = code.split('\n');
  const rows = lines.map(function(line, i) {
    return '<tr class="cv-row"><td class="cv-ln"><span class="cv-num">' + (i + 1) + '</span></td>'
      + '<td class="cv-code"><pre><code>' + esc(line) + '</code></pre></td></tr>';
  }).join('\n');
  return '<div class="detail-section"><h3>Vanilla Source</h3>\n'
    + '<div class="code-viewer"><div class="cv-toolbar">'
    + '<span class="cv-file">' + esc(pkt.id + '.java') + '</span>'
    + '<span class="cv-meta">' + lines.length + ' lines \u00b7 MCP 1.8.9</span>'
    + '<button class="cv-copy">Copy</button>'
    + '<a class="cv-link" href="' + v.blob + '" target="_blank" rel="noopener">Original \u2197</a>'
    + '</div><div class="cv-body"><table class="cv-table">' + rows + '</table></div></div>\n'
    + '<p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">Deobfuscated MCP 1.8.9 source of <code>' + esc(pkt.id) + '</code>, fetched directly from <a href="https://github.com/Marcelektro/MavenMCP-1.8.9" target="_blank" rel="noopener" style="color:var(--accent)">Marcelektro/MavenMCP-1.8.9</a> (' + esc(v.rel) + ') at build time and verified present.</p>'
    + '</div>';
}

function buildSidebarHtml(allPkts) {
  let html = '';
  GROUPS.forEach(function(g) {
    const pkts = allPkts.filter(function(p) { return p.state === g.state && p.dir === g.dir; });
    if (pkts.length === 0) return;
    html += '<div class="nav-section">';
    html += '<div class="nav-section-header" role="button" tabindex="0"><svg class="chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg><span>' + g.label + '</span><span class="count">' + pkts.length + '</span></div>';
    html += '<div class="nav-items">';
    pkts.forEach(function(p) {
      var prefix = p.id.substring(0, 3);
      var dirClass = p.dir === 'SERVERBOUND' ? 'sb' : 'cb';
      var dirLabel = p.dir === 'SERVERBOUND' ? 'SB' : 'CB';
      html += '<a href="../../packets/' + p.id + '/" class="nav-item">';
      html += '<span class="nav-hex">' + prefix + '</span>';
      html += '<span class="nav-name">' + p.name + '</span>';
      html += '<span class="nav-dir ' + dirClass + '">' + dirLabel + '</span></a>';
    });
    html += '</div></div>';
  });
  return html;
}

function esc(s) { if (!s) return ''; return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Lightweight prose renderer: paragraphs, ```java fences, inline `code`.
function renderProse(s) {
  if (!s) return '';
  var out = '';
  var fences = s.split(/```/);
  for (var i = 0; i < fences.length; i++) {
    if (i % 2 === 1) {
      // fenced code block (may carry a language tag on first line)
      var lines = fences[i].replace(/^\n/, '').split('\n');
      if (/^[a-zA-Z0-9_+-]*$/.test(lines[0].trim())) lines.shift();
      out += '<pre class="writeup-code"><code>' + esc(lines.join('\n')) + '</code></pre>';
      continue;
    }
    var paras = fences[i].split(/\n{2,}/);
    for (var j = 0; j < paras.length; j++) {
      var para = paras[j].trim();
      if (!para) continue;
      para = esc(para).replace(/`([^`]+)`/g, '<code>$1</code>');
      if (/^[-*] /.test(para)) {
        // simple bullet list — split into <li>
        var items = para.split(/\n/).filter(function(l) { return /^[-*] /.test(l.trim()); });
        out += '<ul class="writeup-list">' + items.map(function(it) {
          return '<li>' + it.replace(/^[-*] /, '').trim() + '</li>';
        }).join('') + '</ul>';
      } else {
        out += '<p>' + para + '</p>';
      }
    }
  }
  return out;
}

function renderWriteup(w) {
  if (!w || !w.length) return '';
  var parts = ['<div class="detail-section"><h3>Deep Dive</h3><div class="writeup-block">'];
  w.forEach(function(sec) {
    if (sec.h) parts.push('<h4>' + esc(sec.h) + '</h4>');
    if (sec.p) parts.push(renderProse(sec.p));
  });
  parts.push('</div></div>');
  return parts.join('\n');
}

function renderCallout(title, cls, body) {
  if (!body) return '';
  return '<div class="detail-section"><h3>' + esc(title) + '</h3><div class="callout ' + cls + '">'
    + renderProse(body) + '</div></div>';
}

function renderRelated(ids) {
  if (!ids || !ids.length) return '';
  var parts = ['<div class="detail-section"><h3>Related Packets</h3><div class="related-list">'];
  ids.forEach(function(id) {
    parts.push('<a class="related-chip" href="../' + id + '/">' + esc(id) + '</a>');
  });
  parts.push('</div></div>');
  return parts.join('\n');
}

function renderDetail(p) {
  var parts = [];
  if (p.fields && p.fields.length) {
    parts.push('<div class="detail-section"><h3>Fields</h3><table class="fields-table"><thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead><tbody>');
    p.fields.forEach(function(f) { parts.push('<tr><td class="f-name">' + esc(f.name) + '</td><td class="f-type">' + esc(f.type) + '</td><td class="f-desc">' + esc(f.desc) + '</td></tr>'); });
    parts.push('</tbody></table></div>');
  }
  if (p.subclasses && p.subclasses.length) {
    parts.push('<div class="detail-section"><h3>Subclasses</h3><div class="subclass-list">');
    p.subclasses.forEach(function(s) { parts.push('<div class="subclass-item"><span class="sub-name">' + esc(s.name) + '</span><span class="sub-desc">' + esc(s.desc) + '</span></div>'); });
    parts.push('</div></div>');
  }
  if (p.encoding && p.encoding.length) {
    parts.push('<div class="detail-section"><h3>Wire Encoding</h3><table class="encoding-table"><thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead><tbody>');
    p.encoding.forEach(function(e) { parts.push('<tr><td class="e-field">' + esc(e[0]) + '</td><td class="e-type">' + esc(e[1]) + '</td><td class="e-notes">' + esc(e[2] || '') + '</td></tr>'); });
    parts.push('</tbody></table></div>');
  }
  if (p.mcp && p.mcp.length) {
    parts.push('<div class="detail-section"><h3>MCP References</h3><div class="mcp-block">');
    p.mcp.forEach(function(m) { parts.push('<div class="mcp-row"><span class="mcp-label">MCP</span><code>' + esc(m) + '</code></div>'); });
    parts.push('</div></div>');
  }
  if (p.handler) {
    parts.push('<div class="detail-section"><h3>Handler Interface</h3><div class="mcp-block"><div class="mcp-row"><span class="mcp-label">HND</span><code>' + p.handler + '</code></div></div></div>');
  }
  if (p.notes) {
    parts.push('<div class="detail-section"><h3>Notes</h3><div class="notes-box">' + p.notes + '</div></div>');
  }
  // Full vanilla MCP source of the packet class, above the Deep Dive analysis
  parts.push(renderVanillaSource(p));
  if (p.implementation) {
    var impl = p.implementation;
    if (impl.writeup && impl.writeup.length) parts.push(renderWriteup(impl.writeup));
    if (impl.server_handling) parts.push(renderCallout('Server-Side Handling', 'callout-server', impl.server_handling));
    if (impl.protocol_notes) parts.push(renderCallout('Protocol Analysis', 'callout-proto', impl.protocol_notes));
    if (impl.anticheat_landscape) parts.push(renderCallout('Anti-Cheat Landscape', 'callout-ac', impl.anticheat_landscape));
    parts.push('<div class="impl-section"><h3><span class="impl-badge">implementation</span> Implementation Cases</h3>');
    if (impl.overview) parts.push('<p class="impl-pattern">' + impl.overview + '</p>');
    if (impl.modules && impl.modules.length) {
      impl.modules.forEach(function(m) {
        parts.push('<div class="impl-module-entry"><div class="impl-module-header"><span class="impl-module-name">' + m.name + '</span>');
        if (m.found_in && m.found_in.length) parts.push('<span class="impl-module-clients">(' + m.found_in.join(', ') + ')</span>');
        parts.push('</div>');
        if (m.purpose) parts.push('<p class="impl-pattern">' + m.purpose + '</p>');
        if (m.how_it_works) parts.push('<p class="impl-pattern" style="font-size:0.8rem;color:var(--text-muted)">' + m.how_it_works + '</p>');
        if (m.code_source) parts.push('<p class="impl-meta" style="font-size:0.75rem"><span><strong>Source:</strong> ' + esc(m.code_source) + '</span></p>');
        if (m.detailed_code) parts.push('<div class="impl-code-wrap collapsed"><div class="impl-code"><code>' + esc(m.detailed_code) + '</code></div><button class="code-expand-btn" onclick="var w=this.parentNode;w.classList.toggle(\'collapsed\');w.classList.toggle(\'expanded\');this.querySelector(\'.expand-label\').textContent=w.classList.contains(\'collapsed\')?\'Show more\':\'Show less\'"><svg class="expand-icon-collapsed" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg><svg class="expand-icon-expanded" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg><span class="expand-label">Show more</span></button></div>');
        if (m.vanilla_hook) parts.push('<div class="impl-meta"><span><strong>Vanilla hook:</strong> ' + m.vanilla_hook + '</span></div>');
        if (m.anti_cheat_notes) parts.push('<div class="impl-meta" style="color:var(--orange);margin-top:4px"><span>' + m.anti_cheat_notes + '</span></div>');
        if (m.variations) parts.push('<div class="impl-meta" style="margin-top:4px"><span><strong>Variations:</strong> ' + m.variations + '</span></div>');
        parts.push('</div>');
      });
    }
    if (impl.general_hooks) parts.push('<div class="impl-meta" style="margin-top:8px;white-space:pre-wrap">' + impl.general_hooks + '</div>');
    if (impl.client_variations) parts.push('<div class="impl-clients">' + impl.client_variations + '</div>');
    parts.push('</div>');
    if (impl.anticheat) {
      var ac = impl.anticheat;
      parts.push('<div class="impl-section ac-section"><h3><span class="impl-badge ac">anticheat</span> Anti-Cheat Checks</h3>');
      if (ac.overview) parts.push('<p class="impl-pattern">' + ac.overview + '</p>');
      if (ac.checks && ac.checks.length) {
        ac.checks.forEach(function(c) {
          parts.push('<div class="impl-module-entry"><div class="impl-module-header"><span class="impl-module-name">' + c.name + '</span>');
          if (c.found_in && c.found_in.length) parts.push('<span class="impl-module-clients">(' + c.found_in.join(', ') + ')</span>');
          parts.push('</div>');
          if (c.purpose) parts.push('<p class="impl-pattern">' + c.purpose + '</p>');
          if (c.how_it_works) parts.push('<p class="impl-pattern" style="font-size:0.8rem;color:var(--text-muted)">' + c.how_it_works + '</p>');
          if (c.detects) parts.push('<p class="impl-meta" style="margin:4px 0"><span><strong>Detects:</strong> ' + c.detects + '</span></p>');
          if (c.code_source) parts.push('<p class="impl-meta" style="font-size:0.75rem"><span><strong>Source:</strong> ' + esc(c.code_source) + '</span></p>');
          if (c.detailed_code) parts.push('<div class="impl-code-wrap collapsed"><div class="impl-code"><code>' + esc(c.detailed_code) + '</code></div><button class="code-expand-btn" onclick="var w=this.parentNode;w.classList.toggle(\'collapsed\');w.classList.toggle(\'expanded\');this.querySelector(\'.expand-label\').textContent=w.classList.contains(\'collapsed\')?\'Show more\':\'Show less\'"><svg class="expand-icon-collapsed" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg><svg class="expand-icon-expanded" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg><span class="expand-label">Show more</span></button></div>');
          if (c.variations) parts.push('<div class="impl-meta" style="margin-top:4px"><span><strong>Variations:</strong> ' + c.variations + '</span></div>');
          parts.push('</div>');
        });
      }
      parts.push('</div>');
    }
    if (impl.related && impl.related.length) parts.push(renderRelated(impl.related));
  }
  return parts.join('\n');
}

function mtime(p) {
  try { return fs.statSync(p).mtime.toISOString().slice(0, 10); }
  catch (e) { return new Date().toISOString().slice(0, 10); }
}

function analysisSitemap() {
  // Analysis pages (if any) — hub + each module analysis
  const idxPath = path.join(BASE, 'data', 'analysis', 'index.json');
  if (!fs.existsSync(idxPath)) return '';
  let out = '  <url><loc>' + SITE + '/analysis/</loc><lastmod>' + mtime(path.join(BASE, 'analysis', 'index.html')) + '</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>\n';
  try {
    const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    (idx.analyses || []).forEach(function(slug) {
      const data = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'analysis', slug + '.json'), 'utf8'));
      out += '  <url><loc>' + SITE + '/analysis/' + data.category + '/' + slug + '.html</loc><lastmod>' + mtime(path.join(BASE, 'analysis', data.category, slug + '.html')) + '</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n';
    });
  } catch (e) { /* keep hub entry only */ }
  return out;
}

function main() {
  const files = fs.readdirSync(PACKETS_DIR).filter(f => f.endsWith('.json'));
  const allPkts = files.map(function(f) { return JSON.parse(fs.readFileSync(path.join(PACKETS_DIR, f), 'utf8')); });

  // Build sidebar once
  const sidebarHtml = buildSidebarHtml(allPkts);

  for (let i = 0; i < files.length; i++) {
    const pkt = allPkts[i];
    const dir2 = path.join(OUT_DIR, pkt.id);
    fs.mkdirSync(dir2, { recursive: true });

    const metaTitle = pkt.id + ' \u2014 Minecraft 1.8.9 Packet Reference';
    const dirLabel = pkt.dir === 'SERVERBOUND' ? 'Serverbound' : 'Clientbound';
    const fullDesc = (pkt.id + ' (' + pkt.hex + ') \u2014 ' + dirLabel + ' \u2014 Protocol State: ' + pkt.state + '. ' + pkt.desc + (pkt.fields && pkt.fields.length ? ' Fields: ' + pkt.fields.map(function(f) { return f.name; }).join(', ') + '.' : '')).substring(0, 400);
    const tags = (pkt.tags || []).join(', ');
    const moduleList = pkt.implementation && pkt.implementation.modules ? pkt.implementation.modules : [];
    const modules = moduleList.map(function(m) { return m.name; }).join(', ');
    const moduleCount = moduleList.length;

    // Description: protocol facts + module names for richer search snippets.
    const metaDesc = (fullDesc + (modules ? ' Modules: ' + modules + '.' : '')).replace(/"/g, '&quot;').substring(0, 320);

    const dirClass = pkt.dir === 'SERVERBOUND' ? 'dir-sb' : 'dir-cb';
    const dirLabelFull = pkt.dir === 'SERVERBOUND' ? 'Serverbound (Client \u2192 Server)' : 'Clientbound (Server \u2192 Client)';
    const mcpPath = mcpPathFor(pkt) || '';

    var tagHtml = '';
    if (pkt.tags && pkt.tags.length) {
      tagHtml = '<div class="detail-tags">';
      pkt.tags.forEach(function(t) { tagHtml += '<span class="dtag">' + t + '</span>'; });
      tagHtml += '</div>';
    }

    var implEsc = (pkt.implementation && pkt.implementation.overview ? pkt.implementation.overview : '').replace(/"/g, '\\"').substring(0, 300);

    const pageUrl = SITE + '/packets/' + pkt.id + '/';
    const ogImage = SITE + '/assets/og-image.png';
    const pktJsonPath = path.join(PACKETS_DIR, pkt.id + '.json');
    const pubDate = (function() {
      try {
        const d = execSync('git log --diff-filter=A --format=%cI -1 -- data/packets/' + pkt.id + '.json', { cwd: BASE, encoding: 'utf8' }).trim();
        return d ? d.slice(0, 10) : mtime(pktJsonPath);
      } catch (e) { return mtime(pktJsonPath); }
    })();
    const modDate = mtime(pktJsonPath);

    const html = '<!DOCTYPE html>\n<html lang="en" data-theme="dark">\n<head>\n'
      + '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
      + '<title>' + metaTitle + '</title>\n'
      + '<meta name="description" content="' + metaDesc + '">\n'
      + '<meta name="keywords" content="Minecraft, 1.8.9, ' + pkt.id + ', ' + pkt.state + ', ' + dirLabel + ', packet, protocol, ' + tags + (modules ? ', ' + modules : '') + '">\n'
      + '<meta name="author" content="MC Packet Reference">\n'
      + '<meta name="robots" content="index, follow">\n'
      + '<meta name="theme-color" content="#0a0a0a">\n'
      + '<link rel="manifest" href="../../assets/site.webmanifest">\n'
      + '<link rel="apple-touch-icon" href="../../assets/icon-192.png">\n'
      + '<link rel="canonical" href="' + pageUrl + '">\n'
      + '<meta property="og:title" content="' + metaTitle + '">\n'
      + '<meta property="og:description" content="' + metaDesc + '">\n'
      + '<meta property="og:type" content="article">\n'
      + '<meta property="og:url" content="' + pageUrl + '">\n'
      + '<meta property="og:site_name" content="MC 1.8.9 Packet Reference">\n'
      + '<meta property="og:image" content="' + ogImage + '">\n'
      + '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">\n'
      + '<meta property="og:image:alt" content="Minecraft 1.8.9 Packet Reference — network protocol documentation">\n'
      + '<meta property="article:published_time" content="' + pubDate + '">\n'
      + '<meta property="article:modified_time" content="' + modDate + '">\n'
      + '<meta name="twitter:card" content="summary_large_image">\n'
      + '<meta name="twitter:title" content="' + metaTitle + '">\n'
      + '<meta name="twitter:description" content="' + pkt.id + ' (' + pkt.hex + '): ' + pkt.desc.substring(0, 120) + '">\n'
      + '<meta name="twitter:image" content="' + ogImage + '">\n'
      + '<meta name="twitter:label1" content="Direction"><meta name="twitter:data1" content="' + dirLabel + '">\n'
      + '<meta name="twitter:label2" content="State"><meta name="twitter:data2" content="' + pkt.state + '">\n'
      + '<meta name="twitter:label3" content="Modules"><meta name="twitter:data3" content="' + modules + '">\n'
      + '<link rel="icon" href="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><text y=\'.9em\' font-size=\'90\'>📦</text></svg>">\n'
      + '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
      + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=optional" rel="stylesheet">\n'
      + '<link rel="stylesheet" href="../../css/style.css">\n'
      + '<link rel="stylesheet" href="../../assets/github-dark.min.css">\n'
      + '<script type="application/ld+json">\n{"@context":"https://schema.org","@type":"TechArticle","headline":"' + metaTitle + '","description":"' + metaDesc.replace(/&quot;/g, '\\"') + '","datePublished":"' + pubDate + '","dateModified":"' + modDate + '","inLanguage":"en","mainEntityOfPage":{"@type":"WebPage","@id":"' + pageUrl + '"},"author":{"@type":"Organization","name":"MC Packet Reference","url":"' + SITE + '"},"publisher":{"@type":"Organization","name":"MC Packet Reference","url":"' + SITE + '"},"about":{"@type":"SoftwareApplication","name":"Minecraft Java Edition","version":"1.8.9"},"proficiencyLevel":"Expert","articleSection":"' + pkt.state + ' Protocol \u2014 ' + dirLabel + '"}\n</script>\n'
      + '<script type="application/ld+json">\n{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"' + SITE + '/"},{"@type":"ListItem","position":2,"name":"' + pkt.state + ' Protocol","item":"' + SITE + '/packets/"},{"@type":"ListItem","position":3,"name":"' + pkt.id + '","item":"' + pageUrl + '"}]}\n</script>\n'
      + '</head>\n<body>\n'
      + '<aside class="sidebar" id="sidebar">\n'
      + '  <div class="sidebar-header">\n'
      + '    <a href="../../" class="logo" style="text-decoration:none">\n'
      + '      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 7h10M7 12h10M7 17h6"/></svg>\n'
      + '      <span>MC <strong>1.8.9</strong></span>\n'
      + '    </a>\n'
      + '  </div>\n'
      + '  <div class="sidebar-search">\n'
      + '    <svg class="sidebar-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>\n'
      + '    <input type="text" placeholder="Search all packets..." onclick="window.location.href=\'../../\'" role="button" readonly aria-label="Search all packets (opens main page)">\n'
      + '    <kbd class="search-kbd">/</kbd>\n'
      + '  </div>\n'
      + '  <nav class="sidebar-nav" id="sidebarNav">' + sidebarHtml + '</nav>\n'
      + '</aside>\n'
      + '<main class="main" id="main">\n'
      + '<button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle sidebar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg></button>\n'
      + '  <div class="content-detail" style="display:block;max-width:860px;margin:0 auto;padding:40px 48px 80px;width:100%">\n'
      + '    <div class="detail-header" id="detailHeader">\n'
      + '      <h1><span class="detail-hex">' + pkt.hex + '</span> ' + pkt.id + '</h1>\n'
      + '      <p class="detail-desc">' + pkt.desc + '</p>\n'
      + '      <div class="detail-meta">\n'
      + '        <span class="badge ' + dirClass + '">' + dirLabelFull + '</span>\n'
      + '        <span class="meta-sep">\u00b7</span>\n'
      + '        <span class="badge state">' + pkt.state + '</span>\n'
      + '        <span class="meta-sep">\u00b7</span>\n'
      + '        <span class="meta-mcp">' + mcpPath + '</span>\n'
      + '      </div>\n'
      + '      ' + tagHtml + '\n'
      + '    </div>\n'
      + '    <div class="detail-body" id="detailBody">\n'
      + renderDetail(pkt) + '\n'
      + '    </div>\n'
      + '    <div style="margin-top:32px;text-align:center">\n'
      + '      <a href="../../" style="color:var(--accent);font-size:0.85rem">\u2190 Back to all packets</a>\n'
      + '    </div>\n'
      + '  </div>\n'
      + '</main>\n'
      + '<script src="../../assets/highlight.min.js"></script>\n'
      + '<script>\n(function() {\n  var toggle = document.getElementById(\'sidebarToggle\');\n  if (toggle) toggle.addEventListener(\'click\', function() {\n    document.getElementById(\'sidebar\').classList.toggle(\'open\');\n  });\n  document.querySelectorAll(\'#sidebar a\').forEach(function(a) {\n    a.addEventListener(\'click\', function() { document.getElementById(\'sidebar\').classList.remove(\'open\'); });\n  });\n  // highlight vanilla-source code boxes\n  document.querySelectorAll(\'.cv-table\').forEach(function(table) {\n    var rows = table.querySelectorAll(\'tr.cv-row\');\n    if (!rows.length) return;\n    var texts = [];\n    rows.forEach(function(r) { texts.push(r.querySelector(\'code\').textContent); });\n    var src = texts.join(\'\\n\');\n    var hl = hljs.highlight(src, {language: \'java\'}).value.split(\'\\n\');\n    rows.forEach(function(r, i) { r.querySelector(\'code\').innerHTML = hl[i] || \'\'; });\n    table.dataset.src = src;\n  });\n  document.querySelectorAll(\'.cv-copy\').forEach(function(btn) {\n    btn.addEventListener(\'click\', function() {\n      var t = document.createElement(\'textarea\');\n      t.value = btn.closest(\'.code-viewer\').querySelector(\'.cv-table\').dataset.src || \'\';\n      document.body.appendChild(t); t.select();\n      try { document.execCommand(\'copy\'); btn.textContent = \'Copied!\'; } catch (e) {}\n      document.body.removeChild(t);\n      var b = btn; setTimeout(function() { b.textContent = \'Copy\'; }, 1500);\n    });\n  });\n})();\n</script>\n'
      + '</body>\n</html>';

    fs.writeFileSync(path.join(dir2, 'index.html'), html);
  }

  // Sitemap — use real file mtimes, priority by module density
  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + '  <url><loc>' + SITE + '/</loc><lastmod>' + mtime(path.join(BASE, 'index.html')) + '</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n'
    + '  <url><loc>' + SITE + '/packets/</loc><lastmod>' + mtime(path.join(BASE, 'packets', 'index.html')) + '</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>\n'
    + '  <url><loc>' + SITE + '/modules/</loc><lastmod>' + mtime(path.join(BASE, 'modules', 'index.html')) + '</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>\n'
    + allPkts.map(function(p) {
      const mc = (p.implementation && p.implementation.modules) ? p.implementation.modules.length : 0;
      const prio = mc >= 4 ? '0.9' : (mc >= 1 ? '0.8' : '0.6');
      const freq = mc >= 4 ? 'weekly' : 'monthly';
      return '  <url><loc>' + SITE + '/packets/' + p.id + '/</loc><lastmod>' + mtime(path.join(PACKETS_DIR, p.id + '.json')) + '</lastmod><changefreq>' + freq + '</changefreq><priority>' + prio + '</priority></url>';
    }).join('\n') + '\n'
    + analysisSitemap()
    + '</urlset>\n';

  fs.writeFileSync(path.join(BASE, 'sitemap.xml'), sitemap);

  // ============================================================
  // Modules index — every module name across all packets
  // ============================================================
  const modMap = {};
  allPkts.forEach(function(p) {
    if (!p.implementation || !p.implementation.modules) return;
    p.implementation.modules.forEach(function(m) {
      (modMap[m.name] = modMap[m.name] || []).push({
        id: p.id, name: p.name, clients: m.found_in || []
      });
    });
  });
  const modNames = Object.keys(modMap).sort();
  const modDir = path.join(BASE, 'modules');
  fs.mkdirSync(modDir, { recursive: true });
  const modCards = modNames.map(function(mn) {
    const hits = modMap[mn];
    const clientSet = {};
    hits.forEach(function(h) { h.clients.forEach(function(c) { clientSet[c] = true; }); });
    const clientNames = Object.keys(clientSet).sort();
    return '<div class="mod-card">'
      + '<div class="mod-card-head"><span class="mod-card-name">' + esc(mn) + '</span>'
      + '<span class="mod-card-count">' + hits.length + (hits.length === 1 ? ' packet' : ' packets') + '</span></div>'
      + '<div class="mod-card-pkts">' + hits.map(function(h) {
          return '<a class="related-chip" href="../packets/' + h.id + '/">' + esc(h.id) + '</a>';
        }).join('') + '</div>'
      + (clientNames.length ? '<div class="mod-card-clients">' + clientNames.join(', ') + '</div>' : '')
      + '</div>';
  }).join('\n');
  const modHtml = '<!DOCTYPE html>\n<html lang="en" data-theme="dark">\n<head>\n'
    + '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
    + '<title>Module Index \u2014 Minecraft 1.8.9 Packet Reference</title>\n'
    + '<meta name="description" content="Index of every cheat module implementation across the 10 reference clients, mapped to the Minecraft 1.8.9 packets they use: KillAura, Scaffold, Velocity, Disabler, Fly, Speed and more.">\n'
    + '<meta name="robots" content="index, follow">\n'
    + '<meta name="theme-color" content="#0a0a0a">\n'
    + '<link rel="manifest" href="../assets/site.webmanifest">\n'
    + '<link rel="canonical" href="' + SITE + '/modules/">\n'
    + '<meta property="og:title" content="Module Index \u2014 Minecraft 1.8.9 Packet Reference">\n'
    + '<meta property="og:type" content="website">\n'
    + '<meta property="og:url" content="' + SITE + '/modules/">\n'
    + '<meta property="og:image" content="' + SITE + '/assets/og-image.png">\n'
    + '<meta name="twitter:card" content="summary_large_image">\n'
    + '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=optional" rel="stylesheet">\n'
    + '<link rel="stylesheet" href="../css/style.css">\n'
    + '</head>\n<body>\n'
    + '<aside class="sidebar" id="sidebar">\n'
    + '  <div class="sidebar-header">\n'
    + '    <a href="../" class="logo" style="text-decoration:none">\n'
    + '      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 7h10M7 12h10M7 17h6"/></svg>\n'
    + '      <span>MC <strong>1.8.9</strong></span>\n'
    + '    </a>\n'
    + '  </div>\n'
    + '  <nav class="sidebar-nav">\n'
    + '    <div class="nav-section"><div class="nav-section-header"><span>Module Index</span><span class="count">' + modNames.length + '</span></div></div>\n'
    + '    <div class="nav-section"><div class="nav-section-header"><span>All Packets</span></div><div class="nav-items"><a href="../" class="nav-item"><span class="nav-name">Back to packet reference</span></a></div></div>\n'
    + '  </nav>\n'
    + '</aside>\n'
    + '<main class="main" id="main">\n'
    + '<button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle sidebar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg></button>\n'
    + '  <div class="content-detail" style="display:block;max-width:960px;margin:0 auto;padding:40px 48px 80px;width:100%">\n'
    + '    <div class="detail-header">\n'
    + '      <h1>Module Index</h1>\n'
    + '      <p class="detail-desc">Every module implementation found in the 10 reference clients (Memeware 7.3, Nekoware v1 private, Rise 5.99, Rise 6.2.4, Rise 6.1.30, Sigma 4.11, Spicy, Tenacity 6.0, November Recode 2.0, LiquidSense Dev), mapped to the Minecraft 1.8.9 packets they send or intercept.</p>\n'
    + '    </div>\n'
    + '    <div class="mod-grid">\n' + modCards + '\n'
    + '    </div>\n'
    + '    <div style="margin-top:32px;text-align:center">\n'
    + '      <a href="../" style="color:var(--accent);font-size:0.85rem">\u2190 Back to all packets</a>\n'
    + '    </div>\n'
    + '  </div>\n'
    + '</main>\n'
    + '<script>(function(){var t=document.getElementById(\'sidebarToggle\');if(t)t.addEventListener(\'click\',function(){document.getElementById(\'sidebar\').classList.toggle(\'open\');});document.querySelectorAll(\'#sidebar a\').forEach(function(a){a.addEventListener(\'click\',function(){document.getElementById(\'sidebar\').classList.remove(\'open\');});});})();</script>\n'
    + '</body>\n</html>';
  fs.writeFileSync(path.join(modDir, 'index.html'), modHtml);

  // ============================================================
  // packets/index.html — static packet listing (kept in sync)
  // ============================================================
  const listSections = GROUPS.map(function(g) {
    const pkts = allPkts.filter(function(p) { return p.state === g.state && p.dir === g.dir; });
    if (!pkts.length) return '';
    return '<div class="overview-section"><h2>' + g.label + ' <span style="font-size:0.7rem;color:var(--text-muted);font-weight:400;margin-left:6px">' + pkts.length + ' packets</span></h2>'
      + '<div class="section-packet-list">'
      + pkts.map(function(p) {
          return '<a href="../packets/' + p.id + '/" class="section-packet-row">'
            + '<span class="row-hex">' + p.id.substring(0, 3) + '</span>'
            + '<span class="row-name">' + p.name + '</span>'
            + '<span class="row-desc">' + esc(p.desc) + '</span></a>';
        }).join('')
      + '</div></div>';
  }).join('');
  const packetsIndex = '<!DOCTYPE html>\n<html lang="en" data-theme="dark">\n<head>\n'
    + '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
    + '<title>All Packets \u2014 Minecraft 1.8.9 Packet Reference</title>\n'
    + '<meta name="description" content="Browse all 105 Minecraft 1.8.9 network packets organized by protocol state and direction: handshaking, login, status, and play. Fields, wire encoding, and implementation cases.">\n'
    + '<meta name="robots" content="index, follow">\n'
    + '<meta name="theme-color" content="#0a0a0a">\n'
    + '<link rel="manifest" href="../assets/site.webmanifest">\n'
    + '<link rel="canonical" href="' + SITE + '/packets/">\n'
    + '<meta property="og:title" content="All Packets \u2014 Minecraft 1.8.9 Packet Reference">\n'
    + '<meta property="og:type" content="website">\n'
    + '<meta property="og:url" content="' + SITE + '/packets/">\n'
    + '<meta property="og:image" content="' + SITE + '/assets/og-image.png">\n'
    + '<meta name="twitter:card" content="summary_large_image">\n'
    + '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=optional" rel="stylesheet">\n'
    + '<link rel="stylesheet" href="../css/style.css">\n'
    + '</head>\n<body>\n'
    + '<aside class="sidebar" id="sidebar">\n'
    + '  <div class="sidebar-header">\n'
    + '    <a href="../" class="logo" style="text-decoration:none">\n'
    + '      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 7h10M7 12h10M7 17h6"/></svg>\n'
    + '      <span>MC <strong>1.8.9</strong></span>\n'
    + '    </a>\n'
    + '  </div>\n'
    + '  <nav class="sidebar-nav">' + sidebarHtml + '</nav>\n'
    + '</aside>\n'
    + '<main class="main" id="main">\n'
    + '<button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle sidebar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg></button>\n'
    + '  <div class="content-detail" style="display:block;max-width:900px;margin:0 auto;padding:40px 48px 80px;width:100%">\n'
    + '    <div class="detail-header">\n'
    + '      <h1>All Packets</h1>\n'
    + '      <p class="detail-desc">Every Minecraft 1.8.9 network packet, organized by protocol state and direction. Click through for fields, wire encoding, server-side handling, and real client implementation cases.</p>\n'
    + '    </div>\n'
    + '    ' + listSections + '\n'
    + '    <div style="margin-top:32px;text-align:center">\n'
    + '      <a href="../" style="color:var(--accent);font-size:0.85rem">\u2190 Back to home</a>\n'
    + '    </div>\n'
    + '  </div>\n'
    + '</main>\n'
    + '<script>(function(){var t=document.getElementById(\'sidebarToggle\');if(t)t.addEventListener(\'click\',function(){document.getElementById(\'sidebar\').classList.toggle(\'open\');});document.querySelectorAll(\'#sidebar a\').forEach(function(a){a.addEventListener(\'click\',function(){document.getElementById(\'sidebar\').classList.remove(\'open\');});});})();</script>\n'
    + '</body>\n</html>';
  fs.writeFileSync(path.join(path.join(BASE, 'packets'), 'index.html'), packetsIndex);

  // ============================================================
  // Inject static packet links into the home page (crawlability:
  // works for crawlers that do not execute JavaScript)
  // ============================================================
  const homePath = path.join(BASE, 'index.html');
  let home = fs.readFileSync(homePath, 'utf8');
  const staticLinks = GROUPS.map(function(g) {
    const pkts = allPkts.filter(function(p) { return p.state === g.state && p.dir === g.dir; });
    if (!pkts.length) return '';
    return '<div class="overview-section"><h3 style="font-size:0.85rem;font-weight:600;margin:14px 0 8px;color:var(--text-primary)">' + g.label + '</h3>'
      + '<div class="static-packet-links">'
      + pkts.map(function(p) { return '<a class="static-packet-link" href="packets/' + p.id + '/">' + p.id + '</a>'; }).join('')
      + '</div></div>';
  }).join('');
  const block = '<div class="detail-section" id="staticPacketIndex">' + staticLinks + '</div>';
  if (home.indexOf('<!-- PACKET_LINKS -->') !== -1) {
    home = home.replace('<!-- PACKET_LINKS -->', block);
  }
  // inline the site CSS into the home page (kills the render-blocking css/style.css request)
  const css = fs.readFileSync(path.join(BASE, 'css', 'style.css'), 'utf8');
  if (home.indexOf('<!-- STYLE_CSS_INLINE -->') !== -1) {
    home = home.replace('<!-- STYLE_CSS_INLINE -->', '<style>\n' + css + '\n</style>');
  } else {
    // idempotent rebuilds: refresh the already-inlined style block
    home = home.replace(/<style>\n[\s\S]*?\n<\/style>/, '<style>\n' + css + '\n</style>');
  }
  fs.writeFileSync(homePath, home);

  console.log('Generated ' + allPkts.length + ' standalone packet pages + module index (' + modNames.length + ' modules) + packet listing + static home links + sitemap');
}

main();
