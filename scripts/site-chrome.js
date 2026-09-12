'use strict';
// scripts/site-chrome.js
// Shared page chrome (nav, footer, escape, source-viewer script) used by both
// generate-pages.js and generate-source.js so every section stays consistent.

function esc(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Hub links so Packets / Vanilla Internals / Source / Modules / Analyses all link to each other.
function hubNav(prefix) {
  return '<div class="nav-section"><div class="nav-section-header"><span>Reference</span></div><div class="nav-items">'
    + '<a href="' + prefix + '" class="nav-item"><span class="nav-name">Home</span></a>'
    + '<a href="' + prefix + 'start/" class="nav-item"><span class="nav-name">Start Here</span></a>'
    + '<a href="' + prefix + 'packets/" class="nav-item"><span class="nav-name">All Packets</span></a>'
    + '<a href="' + prefix + 'classes/" class="nav-item"><span class="nav-name">Vanilla Internals</span></a>'
    + '<a href="' + prefix + 'source/" class="nav-item"><span class="nav-name">Source Browser</span></a>'
    + '<a href="' + prefix + 'source/graph/" class="nav-item"><span class="nav-name">Code Graph</span></a>'
    + '<a href="' + prefix + 'modules/" class="nav-item"><span class="nav-name">Cheat Modules</span></a>'
    + '<a href="' + prefix + 'analysis/" class="nav-item"><span class="nav-name">Module Analyses</span></a>'
    + '</div></div>';
}

// Unified footer for every generated page: hub links + machine API + brand.
function siteFooter(prefix) {
  return '<div class="overview-footer" style="margin-top:32px;text-align:center;font-size:0.78rem;color:var(--text-muted)">'
    + '<a href="' + prefix + '" style="color:var(--accent)">Home</a>'
    + ' \u00b7 <a href="' + prefix + 'start/" style="color:var(--accent)">Start Here</a>'
    + ' \u00b7 <a href="' + prefix + 'packets/" style="color:var(--accent)">Packets</a>'
    + ' \u00b7 <a href="' + prefix + 'classes/" style="color:var(--accent)">Vanilla Internals</a>'
    + ' \u00b7 <a href="' + prefix + 'source/" style="color:var(--accent)">Source Browser</a>'
    + ' \u00b7 <a href="' + prefix + 'source/graph/" style="color:var(--accent)">Code Graph</a>'
    + ' \u00b7 <a href="' + prefix + 'modules/" style="color:var(--accent)">Cheat Modules</a>'
    + ' \u00b7 <a href="' + prefix + 'analysis/" style="color:var(--accent)">Analyses</a>'
    + '<br>LLMs: <a href="' + prefix + 'llms.txt" style="color:var(--accent)">llms.txt</a>'
    + ' \u00b7 <a href="' + prefix + 'api/" style="color:var(--accent)">JSON API</a>'
    + '<br><span>Minecraft 1.8.9 Packet Reference \u2014 unofficial, not affiliated with Mojang or Microsoft.</span>'
    + '</div>';
}

// Syntax-highlight + copy behaviour for .cv-table source viewers (needs
// assets/highlight.min.js loaded before this runs).
function cvViewerScript() {
  return '<script>\n(function() {\n  var toggle = document.getElementById(\'sidebarToggle\');\n'
    + '  if (toggle) toggle.addEventListener(\'click\', function() {\n'
    + '    document.getElementById(\'sidebar\').classList.toggle(\'open\');\n'
    + '  });\n'
    + '  function tableSrc(table) {\n'
    + '    if (table.dataset.src) return table.dataset.src;\n'
    + '    var texts = [];\n'
    + '    table.querySelectorAll(\'tr.cv-row\').forEach(function(r) { texts.push(r.querySelector(\'code\').textContent); });\n'
    + '    table.dataset.src = texts.join(\'\\n\');\n'
    + '    return table.dataset.src;\n'
    + '  }\n'
    + '  function highlightTable(table) {\n'
    + '    if (table.dataset.hl || !table.querySelector(\'tr.cv-row\')) return;\n'
    + '    table.dataset.hl = \'1\';\n'
    + '    var rows = table.querySelectorAll(\'tr.cv-row\');\n'
    + '    var hl = hljs.highlight(tableSrc(table), {language: \'java\'}).value.split(\'\\n\');\n'
    + '    rows.forEach(function(r, i) { r.querySelector(\'code\').innerHTML = hl[i] || \'\'; });\n'
    + '  }\n'
    + '  var cvTables = document.querySelectorAll(\'.cv-table\');\n'
    + '  cvTables.forEach(tableSrc);\n'
    + '  if (\'IntersectionObserver\' in window) {\n'
    + '    var cvIO = new IntersectionObserver(function(es) {\n'
    + '      es.forEach(function(en) { if (en.isIntersecting) { highlightTable(en.target); cvIO.unobserve(en.target); } });\n'
    + '    }, {rootMargin: \'400px\'});\n'
    + '    cvTables.forEach(function(tbl) { cvIO.observe(tbl); });\n'
    + '  } else { cvTables.forEach(highlightTable); }\n'
    + '  document.querySelectorAll(\'.cv-copy\').forEach(function(btn) {\n'
    + '    btn.addEventListener(\'click\', function() {\n'
    + '      var t = document.createElement(\'textarea\');\n'
    + '      t.value = btn.closest(\'.code-viewer\').querySelector(\'.cv-table\').dataset.src || \'\';\n'
    + '      document.body.appendChild(t); t.select();\n'
    + '      try { document.execCommand(\'copy\'); btn.textContent = \'Copied!\'; } catch (e) {}\n'
    + '      document.body.removeChild(t);\n'
    + '      var b = btn; setTimeout(function() { b.textContent = \'Copy\'; }, 1500);\n'
    + '    });\n'
    + '  });\n'
    + '})();\n</script>';
}

module.exports = { esc: esc, hubNav: hubNav, siteFooter: siteFooter, cvViewerScript: cvViewerScript };
