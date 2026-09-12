#!/usr/bin/env node
// scripts/generate-graph.js
// Turns the graphify output (vendor/graphify-out/) into the public Code Graph
// section:
//
//   source/graph/index.html        SEO hub: stats, god nodes, communities
//   source/graph/classes.html      interactive class-level graph (if renderable)
//   source/graph/graph.html        graphify community-level interactive graph
//   source/graph/tree.html         graphify D3 collapsible tree
//   source/graph/GRAPH_REPORT.md   raw graphify report (LLM/machine readable)
//   source/graph/class-graph.json  slim class-level graph for clients
//   api/graph.json                 machine graph (nodes + links + communities)
//
// Requires the class pages to already exist (run generate-source.js first —
// it wipes source/). Exits 0 with a note when no graph is present.
//
// Usage: node scripts/generate-graph.js [graph.json]
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { esc, hubNav, siteFooter } = require('./site-chrome');
const { loadClassGraph, communityLabel } = require('./graph-lib');

const BASE = path.join(__dirname, '..');
let SITE;
try { const cfg = require('../config.json'); SITE = cfg.SITE || 'https://realcrystalnight.github.io/mc-packet-reference'; }
catch (e) { SITE = 'https://realcrystalnight.github.io/mc-packet-reference'; }

const GRAPH_JSON = process.argv[2] || process.env.GRAPH_JSON || path.join(BASE, 'vendor', 'graphify-out', 'graph.json');
const GRAPH_DIR = path.dirname(GRAPH_JSON);
const OUT = path.join(BASE, 'source', 'graph');
const REPORT = path.join(GRAPH_DIR, 'GRAPH_REPORT.md');

// Classes that anchor the packet/protocol story — linked at the top of the hub.
const CORE = [
  ['NetworkManager', 'net/minecraft/network/NetworkManager.java'],
  ['PacketBuffer', 'net/minecraft/network/PacketBuffer.java'],
  ['EnumConnectionState', 'net/minecraft/network/EnumConnectionState.java'],
  ['NetHandlerPlayServer', 'net/minecraft/network/NetHandlerPlayServer.java'],
  ['NetHandlerPlayClient', 'net/minecraft/client/network/NetHandlerPlayClient.java'],
  ['NetHandlerLoginServer', 'net/minecraft/server/network/NetHandlerLoginServer.java'],
  ['NetHandlerStatusServer', 'net/minecraft/server/network/NetHandlerStatusServer.java'],
  ['EntityPlayerMP', 'net/minecraft/entity/player/EntityPlayerMP.java'],
  ['EntityPlayerSP', 'net/minecraft/client/entity/EntityPlayerSP.java'],
  ['EntityTrackerEntry', 'net/minecraft/entity/EntityTrackerEntry.java'],
  ['ServerConfigurationManager', 'net/minecraft/server/management/ServerConfigurationManager.java'],
  ['PlayerManager', 'net/minecraft/server/management/PlayerManager.java'],
  ['WorldServer', 'net/minecraft/world/WorldServer.java'],
  ['Minecraft', 'net/minecraft/client/Minecraft.java']
];

function relPrefix(absDir) {
  const r = path.relative(absDir, BASE).split(path.sep).join('/');
  return r ? r + '/' : './';
}

// graphify writes internal paths into <title> (e.g. graphify-out/.classcheck/
// graph.html). Give the copied interactive pages clean, indexable titles.
function brandHtml(file, title, desc) {
  if (!fs.existsSync(file)) return;
  let h = fs.readFileSync(file, 'utf8');
  const meta = '<title>' + esc(title) + '</title>\n<meta name="description" content="' + esc(desc) + '">\n<meta name="robots" content="index, follow">';
  if (/<title>[\s\S]*?<\/title>/i.test(h)) h = h.replace(/<title>[\s\S]*?<\/title>/i, meta);
  else h = h.replace(/<head([^>]*)>/i, '<head$1>' + meta);
  fs.writeFileSync(file, h);
}

function main() {
  console.log('== generate-graph.js ==');
  const gg = loadClassGraph(GRAPH_JSON);
  if (!gg) {
    console.log('  no graph at ' + GRAPH_JSON + ' — skipping (run graphify extract).');
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const prefix = relPrefix(OUT);
  const slugOf = function(file) { return file.replace(/\.java$/, ''); };
  const urlOf = function(file) { return prefix + 'source/' + slugOf(file) + '/'; };

  // 1. Copy graphify's own artifacts.
  const copies = [['graph.html', 'graph.html'], ['GRAPH_TREE.html', 'tree.html'], ['GRAPH_REPORT.md', 'GRAPH_REPORT.md']];
  copies.forEach(function(c) {
    const src = path.join(GRAPH_DIR, c[0]);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, c[1]));
  });
  brandHtml(path.join(OUT, 'graph.html'), 'Minecraft 1.8.9 Code Graph \u2014 ' + gg.counts.communities + ' Communities (Interactive)', 'Interactive community-level dependency graph of the Minecraft 1.8.9 codebase, clustered with graphify.');
  brandHtml(path.join(OUT, 'tree.html'), 'Minecraft 1.8.9 Source Tree \u2014 ' + gg.counts.rawNodes.toLocaleString('en-US') + ' Symbols (Interactive)', 'Collapsible D3 tree of every symbol in the deobfuscated Minecraft 1.8.9 source.');

  // 2. Slim class-level graph JSON (clients) + machine API.
  const nodesOut = gg.allFiles.map(function(f) {
    const b = gg.byFile[f];
    const parts = f.split('/');
    return { id: f, label: b.label, package: parts.slice(0, -1).join('.'), file: f, community: b.community, degree: b.degree, url: SITE + '/source/' + slugOf(f) + '/' };
  });
  const linksOut = gg.edges.map(function(e) { return { source: e.source, target: e.target, relation: e.relation, weight: e.weight }; });
  const communitiesOut = Object.keys(gg.communities).map(function(id) {
    const members = gg.communities[id];
    return { id: Number(id), label: communityLabel(members), size: members.length, classes: members.map(slugOf) };
  }).sort(function(a, b) { return b.size - a.size; });
  const slim = { site: SITE, label: 'Minecraft 1.8.9 class graph', generator: 'graphify (Graphify-Labs/graphify)', source: 'Marcelektro/MavenMCP-1.8.9', counts: { classes: nodesOut.length, edges: linksOut.length, communities: communitiesOut.length }, nodes: nodesOut, links: linksOut, communities: communitiesOut };
  fs.writeFileSync(path.join(OUT, 'class-graph.json'), JSON.stringify(slim));
  fs.writeFileSync(path.join(BASE, 'api', 'graph.json'), JSON.stringify(slim));
  console.log('  wrote source/graph/class-graph.json + api/graph.json (' + nodesOut.length + ' nodes, ' + linksOut.length + ' edges)');

  // 3. Try to render an interactive node-level graph from the slim graph.
  let classesHtml = false;
  try {
    const tmp = path.join(BASE, 'vendor', 'graphify-out', '.classcheck');
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    const synth = {
      directed: false, multigraph: false, graph: {},
      nodes: nodesOut.map(function(n) { return { id: n.id, label: n.label, community: n.community, file_type: 'code', source_file: n.file, source_location: 'L1', norm_label: n.label.toLowerCase() }; }),
      links: linksOut.map(function(e) { return { source: e.source, target: e.target, relation: e.relation, confidence: 'EXTRACTED', confidence_score: 1, weight: e.weight }; })
    };
    fs.writeFileSync(path.join(tmp, 'graph.json'), JSON.stringify(synth));
    execFileSync('graphify', ['export', 'html', '--graph', path.join(tmp, 'graph.json'), '--node-limit', '2000'], { stdio: 'ignore', timeout: 120000 });
    const produced = path.join(tmp, 'graph.html');
    if (fs.existsSync(produced) && fs.statSync(produced).size < 8 * 1024 * 1024) {
      fs.copyFileSync(produced, path.join(OUT, 'classes.html'));
      brandHtml(path.join(OUT, 'classes.html'), 'Minecraft 1.8.9 Class Dependency Graph (Interactive)', 'Interactive class-level graph of all ' + gg.counts.files + ' Minecraft 1.8.9 classes and their calls/imports/inheritance edges.');
      classesHtml = true;
      console.log('  rendered interactive class graph (classes.html)');
    }
  } catch (e) { console.log('  class-level render skipped: ' + e.message.split('\n')[0]); }

  // 4. Static, crawlable hub.
  const totalDeg = gg.allFiles.reduce(function(n, f) { return n + gg.byFile[f].degree; }, 0);
  const god = gg.godNodes.slice(0, 60);
  const godChips = god.map(function(f) {
    return '<a class="related-chip" href="' + urlOf(f) + '">' + esc(gg.byFile[f].label) + ' <span style="opacity:.6;font-size:.62rem">' + gg.byFile[f].degree + '</span></a>';
  }).join('');

  const coreChips = CORE.map(function(c) {
    const has = gg.byFile[c[1]];
    return has
      ? '<a class="related-chip" href="' + urlOf(c[1]) + '">' + esc(c[0]) + '</a>'
      : '<a class="related-chip" href="' + prefix + 'source/' + slugOf(c[1]) + '/">' + esc(c[0]) + '</a>';
  }).join('');

  const comms = communitiesOut.filter(function(c) { return c.size >= 4; }).slice(0, 40);
  const commHtml = comms.map(function(c) {
    const chips = c.classes.slice(0, 60).map(function(slug) {
      return '<a class="related-chip" href="' + prefix + 'source/' + slug + '/">' + esc(slug.split('/').pop()) + '</a>';
    }).join('');
    return '<div class="detail-section"><h3>' + esc(c.label || ('Community ' + c.id)) + ' <span style="color:var(--text-muted);font-size:0.78rem">(' + c.size + ' classes)</span></h3>'
      + '<div class="related-list">' + chips + (c.size > 60 ? '<span class="related-chip" style="opacity:.6">\u2026and ' + (c.size - 60) + ' more</span>' : '') + '</div></div>';
  }).join('\n');

  const relRows = Object.keys(gg.relationCounts).sort(function(a, b) { return gg.relationCounts[b] - gg.relationCounts[a]; })
    .map(function(r) { return '<tr><td class="f-name">' + esc(r) + '</td><td class="f-desc">' + gg.relationCounts[r].toLocaleString('en-US') + ' symbol edges</td></tr>'; }).join('');

  const title = 'Minecraft 1.8.9 Code Graph \u2014 ' + gg.counts.files + ' Classes, ' + gg.counts.rawEdges.toLocaleString('en-US') + ' Edges';
  const desc = 'Interactive and crawlable knowledge graph of the Minecraft 1.8.9 codebase: ' + gg.counts.rawNodes.toLocaleString('en-US') + ' symbols, ' + gg.counts.rawEdges.toLocaleString('en-US') + ' edges resolved by graphify, collapsed to ' + gg.counts.files + ' classes and ' + gg.counts.communities + ' communities. Every node links to its source.';
  const pageUrl = SITE + '/source/graph/';
  const jsonld = '<script type="application/ld+json">\n' + JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Dataset',
    name: 'Minecraft 1.8.9 Code Graph',
    description: desc,
    url: pageUrl,
    creator: { '@type': 'Organization', name: 'MC Packet Reference', url: SITE + '/' },
    isBasedOn: 'https://github.com/Marcelektro/MavenMCP-1.8.9',
    distribution: [{ '@type': 'DataDownload', contentUrl: SITE + '/source/graph/class-graph.json', encodingFormat: 'application/json' }]
  }) + '\n</script>\n'
    + '<script type="application/ld+json">\n' + JSON.stringify({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: 'Source Browser', item: SITE + '/source/' }, { '@type': 'ListItem', position: 3, name: 'Code Graph', item: pageUrl }]
    }) + '\n</script>\n';

  const views = [
    classesHtml ? ['Classes (interactive)', 'classes.html', gg.counts.files + ' class nodes'] : null,
    ['Communities (interactive)', 'graph.html', gg.counts.communities + ' community nodes'],
    ['Symbol tree (interactive)', 'tree.html', gg.counts.rawNodes.toLocaleString('en-US') + ' symbols'],
    ['graphify report (markdown)', 'GRAPH_REPORT.md', 'full report'],
    ['class-graph.json', 'class-graph.json', 'machine-readable']
  ].filter(Boolean).map(function(v) {
    return '<a class="related-chip" href="' + v[1] + '">' + esc(v[0]) + ' <span style="opacity:.6;font-size:.62rem">' + esc(v[2]) + '</span></a>';
  }).join('');

  const html = '<!DOCTYPE html>\n<html lang="en" data-theme="dark">\n<head>\n'
    + '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
    + '<title>' + esc(title) + '</title>\n'
    + '<meta name="description" content="' + esc(desc.slice(0, 158)) + '">\n'
    + '<meta name="keywords" content="Minecraft 1.8.9 code graph, dependency graph, MCP 1.8.9, knowledge graph, net.minecraft, class dependencies, graphify, codebase map">\n'
    + '<meta name="author" content="MC Packet Reference">\n'
    + '<meta name="robots" content="index, follow, max-image-preview:large">\n'
    + '<meta name="theme-color" content="#0a0a0a">\n'
    + '<link rel="manifest" href="' + prefix + 'assets/site.webmanifest">\n'
    + '<link rel="icon" href="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><text y=\'.9em\' font-size=\'90\'>\u{1F4E6}</text></svg>">\n'
    + '<link rel="canonical" href="' + pageUrl + '">\n'
    + '<meta property="og:title" content="' + esc(title) + '">\n<meta property="og:description" content="' + esc(desc.slice(0, 158)) + '">\n'
    + '<meta property="og:type" content="article">\n<meta property="og:url" content="' + pageUrl + '">\n'
    + '<meta property="og:image" content="' + SITE + '/assets/og-image.png">\n'
    + '<meta name="twitter:card" content="summary_large_image">\n'
    + '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">\n'
    + '<link rel="stylesheet" href="' + prefix + 'css/style.css">\n'
    + jsonld
    + '</head>\n<body>\n'
    + '<aside class="sidebar" id="sidebar">\n  <div class="sidebar-header">\n    <a href="' + prefix + '" class="logo" style="text-decoration:none">\n'
    + '      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 7h10M7 12h10M7 17h6"/></svg>\n      <span>MC <strong>1.8.9</strong></span>\n    </a>\n  </div>\n'
    + '  <nav class="sidebar-nav" id="sidebarNav">' + hubNav(prefix) + '</nav>\n</aside>\n'
    + '<main class="main" id="main">\n'
    + '<button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle sidebar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg></button>\n'
    + '  <div class="content-detail" style="display:block;max-width:960px;margin:0 auto;padding:40px 48px 80px;width:100%">\n'
    + '    <div class="detail-header">\n'
    + '<nav class="crumbs" aria-label="Breadcrumb" style="font-size:0.78rem;color:var(--text-muted);margin-bottom:14px"><a href="' + prefix + '" style="color:var(--accent)">Home</a><span style="margin:0 6px">\u203a</span><a href="' + prefix + 'source/" style="color:var(--accent)">Source Browser</a><span style="margin:0 6px">\u203a</span><span>Code Graph</span></nav>\n'
    + '      <h1>Minecraft 1.8.9 Code Graph</h1>\n'
    + '      <p class="detail-desc">' + esc(desc) + '</p>\n'
    + '      <div class="detail-meta"><span class="badge state">' + gg.counts.rawNodes.toLocaleString('en-US') + ' symbols</span><span class="badge">' + gg.counts.rawEdges.toLocaleString('en-US') + ' edges</span><span class="badge">' + gg.counts.files + ' classes</span><span class="badge">' + gg.counts.communities + ' communities</span></div>\n'
    + '    </div>\n    <div class="detail-body">\n'
    + '      <div class="detail-section"><h3>Interactive views</h3><div class="related-list">' + views + '</div>'
    + '      <p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">Built with <a href="https://github.com/Graphify-Labs/graphify" target="_blank" rel="noopener" style="color:var(--accent)">graphify</a> (tree-sitter AST, local, no LLM). Every graph node links back to its class source page.</p></div>\n'
    + '      <div class="detail-section"><h3>Protocol core</h3><div class="related-list">' + coreChips + '</div><p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">Start here for the packet send/handle path; each opens the verbatim class source.</p></div>\n'
    + '      <div class="detail-section"><h3>God nodes \u2014 most connected classes</h3><div class="related-list">' + godChips + '</div><p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">Ranked by distinct class dependencies (degree). Numbers are connection counts.</p></div>\n'
    + '      <div class="detail-section"><h3>Edge kinds</h3><table class="fields-table"><thead><tr><th>Relation</th><th>Count</th></tr></thead><tbody>' + relRows + '</tbody></table></div>\n'
    + '      <div class="detail-section"><h3>Communities (' + communitiesOut.length + ')</h3><p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:4px">Subsystems detected by Leiden clustering; labelled by dominant package. Top ' + comms.length + ' shown, linked to source.</p></div>\n'
    + commHtml + '\n'
    + '    </div>\n'
    + siteFooter(prefix)
    + '  </div>\n</main>\n'
    + '<script>(function(){var t=document.getElementById(\'sidebarToggle\');if(t)t.addEventListener(\'click\',function(){document.getElementById(\'sidebar\').classList.toggle(\'open\');});})();</script>\n'
    + '</body>\n</html>';
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  console.log('  wrote source/graph/index.html');
  console.log('== done ==');
}

main();
