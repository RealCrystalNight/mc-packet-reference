#!/usr/bin/env node
// scripts/generate-pages.js
// Generates one standalone HTML page per packet under packets/<id>/index.html
// Each page has full sidebar nav, unique SEO meta, rich embeds, and detail view.
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const PACKETS_DIR = path.join(BASE, 'data', 'packets');
const OUT_DIR = path.join(BASE, 'packets');

const SITE = 'https://realcrystalnight.github.io/mc-packet-reference';

const GROUPS = [
  { label: 'Handshaking', state: 'HANDSHAKING', dir: 'SERVERBOUND' },
  { label: 'Login \u2192 Server', state: 'LOGIN', dir: 'SERVERBOUND' },
  { label: 'Login \u2192 Client', state: 'LOGIN', dir: 'CLIENTBOUND' },
  { label: 'Status \u2192 Server', state: 'STATUS', dir: 'SERVERBOUND' },
  { label: 'Status \u2192 Client', state: 'STATUS', dir: 'CLIENTBOUND' },
  { label: 'Play \u2192 Server', state: 'PLAY', dir: 'SERVERBOUND' },
  { label: 'Play \u2192 Client', state: 'PLAY', dir: 'CLIENTBOUND' }
];

function buildSidebarHtml(allPkts) {
  let html = '';
  GROUPS.forEach(function(g) {
    const pkts = allPkts.filter(function(p) { return p.state === g.state && p.dir === g.dir; });
    if (pkts.length === 0) return;
    html += '<div class="nav-section">';
    html += '<div class="nav-section-header"><svg class="chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg><span>' + g.label + '</span><span class="count">' + pkts.length + '</span></div>';
    html += '<div class="nav-items">';
    pkts.forEach(function(p) {
      var prefix = p.id.substring(0, 3);
      var dirClass = p.dir === 'SERVERBOUND' ? 'sb' : 'cb';
      var dirLabel = p.dir === 'SERVERBOUND' ? 'SB' : 'CB';
      html += '<a href="/mc-packet-reference/packets/' + p.id + '/" class="nav-item">';
      html += '<span class="nav-hex">' + prefix + '</span>';
      html += '<span class="nav-name">' + p.name + '</span>';
      html += '<span class="nav-dir ' + dirClass + '">' + dirLabel + '</span></a>';
    });
    html += '</div></div>';
  });
  return html;
}

function esc(s) { if (!s) return ''; return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function renderDetail(p) {
  var parts = [];
  if (p.fields && p.fields.length) {
    parts.push('<div class="detail-section"><h3>Fields</h3><table class="fields-table"><thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead><tbody>');
    p.fields.forEach(function(f) { parts.push('<tr><td class="f-name">' + f.name + '</td><td class="f-type">' + f.type + '</td><td class="f-desc">' + f.desc + '</td></tr>'); });
    parts.push('</tbody></table></div>');
  }
  if (p.subclasses && p.subclasses.length) {
    parts.push('<div class="detail-section"><h3>Subclasses</h3><div class="subclass-list">');
    p.subclasses.forEach(function(s) { parts.push('<div class="subclass-item"><span class="sub-name">' + s.name + '</span><span class="sub-desc">' + s.desc + '</span></div>'); });
    parts.push('</div></div>');
  }
  if (p.encoding && p.encoding.length) {
    parts.push('<div class="detail-section"><h3>Wire Encoding</h3><table class="encoding-table"><thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead><tbody>');
    p.encoding.forEach(function(e) { parts.push('<tr><td class="e-field">' + e[0] + '</td><td class="e-type">' + e[1] + '</td><td class="e-notes">' + (e[2] || '') + '</td></tr>'); });
    parts.push('</tbody></table></div>');
  }
  if (p.mcp && p.mcp.length) {
    parts.push('<div class="detail-section"><h3>MCP References</h3><div class="mcp-block">');
    p.mcp.forEach(function(m) { parts.push('<div class="mcp-row"><span class="mcp-label">MCP</span><code>' + m + '</code></div>'); });
    parts.push('</div></div>');
  }
  if (p.handler) {
    parts.push('<div class="detail-section"><h3>Handler Interface</h3><div class="mcp-block"><div class="mcp-row"><span class="mcp-label">HND</span><code>' + p.handler + '</code></div></div></div>');
  }
  if (p.notes) {
    parts.push('<div class="detail-section"><h3>Notes</h3><div class="notes-box">' + p.notes + '</div></div>');
  }
  if (p.implementation) {
    var impl = p.implementation;
    parts.push('<div class="impl-section"><h3><span class="impl-badge">implementation</span> Implementation Cases</h3>');
    if (impl.overview) parts.push('<p class="impl-pattern">' + impl.overview + '</p>');
    if (impl.modules && impl.modules.length) {
      impl.modules.forEach(function(m) {
        parts.push('<div class="impl-module-entry"><div class="impl-module-header"><span class="impl-module-name">' + m.name + '</span>');
        if (m.found_in && m.found_in.length) parts.push('<span class="impl-module-clients">(' + m.found_in.join(', ') + ')</span>');
        parts.push('</div>');
        if (m.purpose) parts.push('<p class="impl-pattern">' + m.purpose + '</p>');
        if (m.how_it_works) parts.push('<p class="impl-pattern" style="font-size:0.8rem;color:var(--text-muted)">' + m.how_it_works + '</p>');
        if (m.detailed_code) parts.push('<div class="impl-code-wrap collapsed"><div class="impl-code"><code>' + esc(m.detailed_code) + '</code></div><button class="code-expand-btn" onclick="var w=this.parentNode;w.classList.toggle(\'collapsed\');w.classList.toggle(\'expanded\');this.querySelector(\'.expand-label\').textContent=w.classList.contains(\'collapsed\')?\'Show more\':\'Show less\'"><svg class="expand-icon-collapsed" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg><svg class="expand-icon-expanded" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg><span class="expand-label">Show more</span></button></div>');
        if (m.vanilla_hook) parts.push('<div class="impl-meta"><span><strong>Vanilla hook:</strong> ' + m.vanilla_hook + '</span></div>');
        if (m.anti_cheat_notes) parts.push('<div class="impl-meta" style="color:var(--orange);margin-top:4px"><span>' + m.anti_cheat_notes + '</span></div>');
        parts.push('</div>');
      });
    }
    if (impl.general_hooks) parts.push('<div class="impl-meta" style="margin-top:8px;white-space:pre-wrap">' + impl.general_hooks + '</div>');
    if (impl.client_variations) parts.push('<div class="impl-clients">' + impl.client_variations + '</div>');
    parts.push('</div>');
  }
  return parts.join('\n');
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
    const modules = pkt.implementation && pkt.implementation.modules ? pkt.implementation.modules.map(function(m) { return m.name; }).join(', ') : '';

    const metaDesc = fullDesc.replace(/"/g, '&quot;');

    const dirClass = pkt.dir === 'SERVERBOUND' ? 'dir-sb' : 'dir-cb';
    const dirLabelFull = pkt.dir === 'SERVERBOUND' ? 'Serverbound (Client \u2192 Server)' : 'Clientbound (Server \u2192 Client)';
    const mcpPath = 'net/minecraft/network/' + (pkt.dir === 'SERVERBOUND' ? 'play/client' : pkt.state.toLowerCase() === 'play' ? 'play/server' : '') + '/' + pkt.id + '.java';

    var tagHtml = '';
    if (pkt.tags && pkt.tags.length) {
      tagHtml = '<div class="detail-tags">';
      pkt.tags.forEach(function(t) { tagHtml += '<span class="dtag">' + t + '</span>'; });
      tagHtml += '</div>';
    }

    var implEsc = (pkt.implementation && pkt.implementation.overview ? pkt.implementation.overview : '').replace(/"/g, '\\"').substring(0, 300);

    const html = '<!DOCTYPE html>\n<html lang="en" data-theme="dark">\n<head>\n'
      + '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
      + '<title>' + metaTitle + '</title>\n'
      + '<meta name="description" content="' + metaDesc + '">\n'
      + '<meta name="keywords" content="Minecraft, 1.8.9, ' + pkt.id + ', ' + pkt.state + ', ' + dirLabel + ', packet, protocol, ' + tags + '">\n'
      + '<meta name="robots" content="index, follow">\n'
      + '<link rel="canonical" href="' + SITE + '/packets/' + pkt.id + '/">\n'
      + '<meta property="og:title" content="' + metaTitle + '">\n'
      + '<meta property="og:description" content="' + metaDesc + '">\n'
      + '<meta property="og:type" content="article">\n'
      + '<meta property="og:url" content="' + SITE + '/packets/' + pkt.id + '/">\n'
      + '<meta property="og:site_name" content="MC 1.8.9 Packet Reference">\n'
      + '<meta name="twitter:card" content="summary_large_image">\n'
      + '<meta name="twitter:title" content="' + metaTitle + '">\n'
      + '<meta name="twitter:description" content="' + pkt.id + ' (' + pkt.hex + '): ' + pkt.desc.substring(0, 120) + '">\n'
      + '<meta name="twitter:label1" content="Direction"><meta name="twitter:data1" content="' + dirLabel + '">\n'
      + '<meta name="twitter:label2" content="State"><meta name="twitter:data2" content="' + pkt.state + '">\n'
      + '<meta name="twitter:label3" content="Modules"><meta name="twitter:data3" content="' + modules + '">\n'
      + '<link rel="icon" href="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><text y=\'.9em\' font-size=\'90\'>📦</text></svg>">\n'
      + '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
      + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">\n'
      + '<link rel="stylesheet" href="/mc-packet-reference/css/style.css">\n'
      + '<script type="application/ld+json">\n{"@context":"https://schema.org","@type":"TechArticle","headline":"' + metaTitle + '","description":"' + implEsc + '","about":{"@type":"SoftwareApplication","name":"Minecraft Java Edition","version":"1.8.9"},"proficiencyLevel":"Expert","articleSection":"' + pkt.state + ' Protocol \u2014 ' + dirLabel + '"}\n</script>\n'
      + '</head>\n<body>\n'
      + '<aside class="sidebar" id="sidebar">\n'
      + '  <div class="sidebar-header">\n'
      + '    <a href="/mc-packet-reference/" class="logo" style="text-decoration:none">\n'
      + '      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 7h10M7 12h10M7 17h6"/></svg>\n'
      + '      <span>MC <strong>1.8.9</strong></span>\n'
      + '    </a>\n'
      + '  </div>\n'
      + '  <div class="sidebar-search">\n'
      + '    <svg class="sidebar-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>\n'
      + '    <input type="text" placeholder="Search all packets..." onfocus="this.value=\'\';window.location.href=\'/mc-packet-reference/\'" role="button" readonly>\n'
      + '    <kbd class="search-kbd">/</kbd>\n'
      + '  </div>\n'
      + '  <nav class="sidebar-nav" id="sidebarNav">' + sidebarHtml + '</nav>\n'
      + '</aside>\n'
      + '<main class="main" id="main">\n'
      + '  <div class="content-detail" style="display:block;max-width:860px;margin:0 auto;padding:40px 48px 80px;width:100%">\n'
      + '    <div class="detail-header" id="detailHeader">\n'
      + '      <h2><span class="detail-hex">' + pkt.hex + '</span> ' + pkt.id + '</h2>\n'
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
      + '      <a href="/mc-packet-reference/" style="color:var(--accent);font-size:0.85rem">\u2190 Back to all packets</a>\n'
      + '    </div>\n'
      + '  </div>\n'
      + '</main>\n'
      + '</body>\n</html>';

    fs.writeFileSync(path.join(dir2, 'index.html'), html);
  }

  // Sitemap
  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + '  <url><loc>' + SITE + '/</loc><lastmod>2025-06-18</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n'
    + '  <url><loc>' + SITE + '/packets/</loc><lastmod>2025-06-18</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>\n'
    + allPkts.map(function(p) { return '  <url><loc>' + SITE + '/packets/' + p.id + '/</loc><lastmod>2025-06-18</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>'; }).join('\n') + '\n'
    + '</urlset>\n';

  fs.writeFileSync(path.join(BASE, 'sitemap.xml'), sitemap);
  console.log('Generated ' + allPkts.length + ' standalone packet pages + sitemap');
}

main();
