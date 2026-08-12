#!/usr/bin/env python3
"""generate-analysis.py — build GitHub-style module analysis pages.

Reads data/analysis/<slug>.json (prose + line annotations), cats the real
module source from the sources root at build time, and emits
analysis/<category>/<slug>.html with:

  - full working sidebar (packet reference + module index + all analyses)
  - analysis prose (overview + sections)
  - GitHub-style code viewer: line numbers, highlight.js java dark theme,
    inline annotation markers, copy button
  - line-by-line annotations below the box (every line covered)

Also regenerates analysis/index.html and analysis/<category>/index.html hubs.

Usage:
  python3 scripts/generate-analysis.py            # all analyses
  python3 scripts/generate-analysis.py gugustus-disabler   # one slug
  SOURCES_ROOT=/path python3 scripts/generate-analysis.py
"""
import json
import os
import re
import sys
import urllib.parse

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data", "analysis")
OUT = os.path.join(BASE, "analysis")
DEFAULT_SOURCES = os.path.normpath(os.path.join(BASE, "..", "references", "mc-client-sources", "sources"))
SOURCES_ROOT = os.environ.get("SOURCES_ROOT") or DEFAULT_SOURCES
SITE = "https://realcrystalnight.github.io/mc-packet-reference"
GH_BASE = "https://github.com/iroot3/mc-client-sources/blob/main/sources"


def esc(s):
    if s is None:
        return ""
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;"))


def gh_url(client, rel):
    return GH_BASE + "/" + urllib.parse.quote(client) + "/" + "/".join(urllib.parse.quote(p) for p in rel.split("/"))


def load_analyses(targets=None):
    idx = json.load(open(os.path.join(DATA, "index.json")))
    out = []
    for slug in idx["analyses"]:
        if targets and slug not in targets:
            continue
        data_file = os.path.join(DATA, slug + ".json")
        if not os.path.exists(data_file):
            print("skip %s: data file missing" % slug, file=sys.stderr)
            continue
        a = json.load(open(data_file))
        a["slug"] = slug
        a["source_path"] = os.path.join(SOURCES_ROOT, a["client"], a["source_rel"])
        with open(a["source_path"], encoding="utf-8", errors="replace") as f:
            a["code"] = f.read()
        a["lines"] = a["code"].count("\n") + (0 if a["code"].endswith("\n") else 1)
        a["gh_url"] = gh_url(a["client"], a["source_rel"])
        out.append(a)
    return out


def build_sidebar(analyses, active_slug, mode="page"):
    """mode='page' -> analysis/<cat>/<slug>.html (sibling links); mode='hub' -> analysis/index.html."""
    parts = ['<nav class="sidebar-nav" id="sidebarNav">']
    if mode == "page":
        site_root, modules_href, hub_href = "../../", "../../modules/", "../"
        cat_prefix = lambda cat: "../" + cat + "/"
    else:
        site_root, modules_href, hub_href = "../", "../modules/", "."
        cat_prefix = lambda cat: cat + "/"
    parts.append('<div class="nav-section"><div class="nav-section-header"><span>Site</span></div><div class="nav-items">'
                 '<a href="' + site_root + '" class="nav-item"><span class="nav-name">Packet Reference</span></a>'
                 '<a href="' + modules_href + '" class="nav-item"><span class="nav-name">Module Index</span></a>'
                 '<a href="' + hub_href + '" class="nav-item"><span class="nav-name">Analysis Hub</span></a>'
                 '</div></div>')
    cats = {}
    for a in analyses:
        cats.setdefault(a["category"], []).append(a)
    for cat in sorted(cats):
        items = cats[cat]
        parts.append('<div class="nav-section"><div class="nav-section-header" role="button" tabindex="0">'
                     '<svg class="chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>'
                     '<span>' + esc(cat.title()) + '</span><span class="count">' + str(len(items)) + '</span></div>'
                     '<div class="nav-items">')
        for a in items:
            active = ' active' if a["slug"] == active_slug else ''
            if a["slug"] == active_slug:
                rel = ""
            else:
                rel = ("" if mode == "page" and a["category"] == active_cat_of(active_slug, analyses) else cat_prefix(a["category"])) + a["slug"] + ".html"
            parts.append('<a href="' + rel + '" class="nav-item' + active + '">'
                         '<span class="nav-hex">ANA</span>'
                         '<span class="nav-name">' + esc(a["client"]) + ' ' + esc(a["module"]) + '</span></a>')
        parts.append('</div></div>')
    parts.append('</nav>')
    return "\n".join(parts)


def active_cat_of(slug, analyses):
    for a in analyses:
        if a["slug"] == slug:
            return a["category"]
    return None


def render_annotations_table(a):
    rows = []
    for ann in a["annotations"]:
        lines = a["code"].split("\n")
        snippet = " / ".join(lines[i - 1].strip() for i in range(ann["start"], ann["end"] + 1) if i - 1 < len(lines))
        if len(snippet) > 110:
            snippet = snippet[:110] + " ..."
        label = "L%d" % ann["start"] if ann["start"] == ann["end"] else "L%d-%d" % (ann["start"], ann["end"])
        rows.append('<div class="ann-entry">'
                    '<div class="ann-head"><button class="ann-line" data-line="%d">%s</button>'
                    '<code class="ann-snippet">%s</code></div>'
                    '<div class="ann-text">%s</div></div>'
                    % (ann["start"], label, esc(snippet), ann["text"]))
    return "\n".join(rows)


def render_viewer(a):
    """GitHub-style viewer: toolbar + line table + markers. Code is highlighted
    by highlight.js at load time; the generator splits pre-highlighted lines."""
    rows = []
    code = a["code"].rstrip("\n")
    lines = code.split("\n")
    ann_by_line = {}
    for ann in a["annotations"]:
        ann_by_line.setdefault(ann["start"], ann)
    for i, line in enumerate(lines, 1):
        ann = ann_by_line.get(i)
        marker = '<span class="cv-mark" data-line="%d" title="View annotation">+</span>' % i if ann else ""
        rows.append('<tr class="cv-row" data-line="%d">'
                    '<td class="cv-ln"><span class="cv-num">%d</span>%s</td>'
                    '<td class="cv-code"><pre><code>%s</code></pre></td></tr>'
                    % (i, i, marker, esc(line)))
    return ('<div class="code-viewer" id="codeViewer">'
            '<div class="cv-toolbar">'
            '<span class="cv-file">' + esc(a["source_rel"].split("/")[-1]) + '</span>'
            '<span class="cv-meta">' + str(a["lines"]) + ' lines \u00b7 Java</span>'
            '<button class="cv-copy" id="copyBtn">Copy</button>'
            '<a class="cv-link" href="' + a["gh_url"] + '" target="_blank" rel="noopener">Original \u2197</a>'
            '</div>'
            '<div class="cv-body"><table class="cv-table" id="cvTable">' + "\n".join(rows) + '</table></div>'
            '</div>')


def render_page(a, analyses):
    sidebar = build_sidebar(analyses, a["slug"], "page")
    meta_desc = (a["module"] + " module (" + a["client"] + ") full source analysis \u2014 " + a["overview"][:180])
    packets_html = ""
    if a.get("packets"):
        chips = "".join('<a class="related-chip" href="../../packets/%s/">%s</a>' % (p, p) for p in a["packets"])
        packets_html = '<div class="detail-section"><h3>Packets This Module Uses</h3><div class="related-list">' + chips + '</div></div>'
    sections_html = "".join('<h4>' + esc(s["h"]) + '</h4><p>' + s["p"] + '</p>' for s in a.get("sections", []))
    ann_json = json.dumps(a["annotations"])
    return """<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>%s %s \u2014 Full Source Analysis | Minecraft 1.8.9 Packet Reference</title>
<meta name="description" content="%s">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#0a0a0a">
<link rel="canonical" href="%s/analysis/%s/%s.html">
<meta property="og:title" content="%s %s \u2014 Full Source Analysis">
<meta property="og:type" content="article">
<meta property="og:url" content="%s/analysis/%s/%s.html">
<meta property="og:image" content="%s/assets/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../css/style.css">
<link rel="stylesheet" href="../assets/github-dark.min.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📦</text></svg>">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"TechArticle","headline":"%s %s \u2014 Full Source Analysis","description":"%s","inLanguage":"en","mainEntityOfPage":{"@type":"WebPage","@id":"%s/analysis/%s/%s.html"},"author":{"@type":"Organization","name":"MC Packet Reference"},"publisher":{"@type":"Organization","name":"MC Packet Reference"},"about":{"@type":"SoftwareApplication","name":"Minecraft Java Edition","version":"1.8.9"}}
</script>
<style>
/* analysis page specific styles */
.analysis-body h4 { font-size:0.82rem; font-weight:600; color:var(--text-primary); margin:18px 0 6px; text-transform:uppercase; letter-spacing:0.04em; }
.analysis-body p { font-size:0.88rem; color:var(--text-secondary); line-height:1.7; margin-bottom:10px; }
.code-viewer { border:1px solid var(--border); border-radius:var(--radius-sm); overflow:hidden; margin:16px 0; background:#0d1117; }
.cv-toolbar { display:flex; align-items:center; gap:12px; padding:8px 14px; background:#161b22; border-bottom:1px solid var(--border); font-size:0.78rem; }
.cv-file { font-family:var(--font-mono); color:var(--text-primary); font-weight:600; }
.cv-meta { color:var(--text-muted); }
.cv-copy { margin-left:auto; background:var(--bg-tertiary); border:1px solid var(--border); color:var(--text-secondary); font-size:0.7rem; padding:3px 10px; border-radius:4px; cursor:pointer; }
.cv-copy:hover { border-color:var(--accent); color:var(--accent); }
.cv-link { color:var(--accent); text-decoration:none; font-size:0.72rem; }
.cv-body { max-height:640px; overflow:auto; }
.cv-table { width:100%%; border-collapse:collapse; font-family:var(--font-mono); font-size:0.76rem; line-height:1.55; }
.cv-table .cv-ln { width:64px; text-align:right; padding:0 10px 0 0; color:#484f58; background:#0d1117; border-right:1px solid #21262d; user-select:none; white-space:nowrap; vertical-align:top; }
.cv-table .cv-num { display:inline-block; width:28px; text-align:right; }
.cv-mark { display:inline-block; width:16px; height:16px; line-height:14px; margin-left:6px; text-align:center; border-radius:3px; background:#21262d; color:#8b949e; font-size:0.7rem; font-weight:700; cursor:pointer; }
.cv-mark:hover, .cv-mark.open { background:var(--accent); color:#fff; }
.cv-table .cv-code { padding:0 14px; vertical-align:top; }
.cv-table .cv-code pre { margin:0; background:transparent; }
.cv-table .cv-code code { background:transparent; padding:0; font-size:inherit; color:var(--text-primary); }
.cv-table .cv-code .hljs { background:transparent; padding:0; }
tr.cv-ann { background:rgba(59,130,246,0.08); }
tr.cv-ann td { box-shadow: inset 3px 0 0 var(--accent); }
.cv-bubble { background:#161b22; border:1px solid var(--accent); border-radius:6px; padding:10px 14px; font-family:var(--font-sans); font-size:0.8rem; color:var(--text-secondary); line-height:1.6; margin:6px 0; }
.cv-bubble strong { color:var(--accent); font-family:var(--font-mono); font-size:0.72rem; }
.ann-entry { background:var(--bg-secondary); border:1px solid var(--border); border-left:3px solid var(--accent); border-radius:var(--radius-sm); padding:10px 14px; margin-bottom:10px; }
.ann-head { display:flex; align-items:baseline; gap:10px; margin-bottom:4px; flex-wrap:wrap; }
.ann-line { font-family:var(--font-mono); font-size:0.7rem; color:var(--accent); background:var(--accent-dim); border:none; border-radius:4px; padding:1px 8px; cursor:pointer; }
.ann-line:hover { background:var(--accent); color:#fff; }
.ann-snippet { font-size:0.72rem; color:var(--text-muted); }
.ann-text { font-size:0.82rem; color:var(--text-secondary); line-height:1.65; }
</style>
</head>
<body>
<aside class="sidebar" id="sidebar">
  <div class="sidebar-header">
    <a href="../../" class="logo" style="text-decoration:none">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 7h10M7 12h10M7 17h6"/></svg>
      <span>MC <strong>1.8.9</strong></span>
    </a>
  </div>
  %s
</aside>
<main class="main" id="main">
  <div class="content-detail" style="display:block;max-width:1040px;margin:0 auto;padding:40px 48px 80px;width:100%%">
    <div class="detail-header">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <span class="badge state">%s</span>
        <span class="badge dir-sb">%s module</span>
      </div>
      <h1>%s \u2014 Full Source Analysis</h1>
      <p class="detail-desc">%s</p>
      <div class="detail-meta">
        <span class="meta-mcp">%s</span>
        <span class="meta-sep">\u00b7</span>
        <span class="meta-mcp">%d lines</span>
        <span class="meta-sep">\u00b7</span>
        <a class="meta-mcp" style="color:var(--accent)" href="%s" target="_blank" rel="noopener">GitHub source \u2197</a>
      </div>
    </div>
    %s
    <div class="detail-section analysis-body">
      <h3>Analysis</h3>
      <h4>Overview</h4><p>%s</p>
      %s
    </div>
    <div class="detail-section">
      <h3>Full Source</h3>
      %s
    </div>
    <div class="detail-section">
      <h3>Line-by-Line Annotations</h3>
      <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:12px">Every line of the module, annotated. Click a line number to jump to it in the source viewer above.</p>
      %s
    </div>
    <div style="margin-top:32px;text-align:center">
      <a href="../" style="color:var(--accent);font-size:0.85rem">\u2190 Back to Analysis Hub</a>
    </div>
  </div>
</main>
<script src="../assets/highlight.min.js"></script>
<script>
(function() {
  var ANN = %s;
  // highlight + split into rows
  var table = document.getElementById('cvTable');
  var rows = table.querySelectorAll('tr.cv-row');
  var texts = [];
  rows.forEach(function(r) { texts.push(r.querySelector('code').textContent); });
  var src = texts.join('\\n');
  var hl = hljs.highlight(src, {language: 'java'}).value.split('\\n');
  rows.forEach(function(r, i) { r.querySelector('code').innerHTML = hl[i] || ''; });
  // annotation markers
  function annForLine(n) { for (var i = 0; i < ANN.length; i++) if (ANN[i].start === n) return ANN[i]; return null; }
  function clearBubbles() { document.querySelectorAll('.cv-bubble').forEach(function(b) { b.remove(); }); rows.forEach(function(r) { r.classList.remove('cv-ann'); }); document.querySelectorAll('.cv-mark.open').forEach(function(m) { m.classList.remove('open'); }); }
  function openAnn(n, scroll) {
    clearBubbles();
    var ann = annForLine(n); if (!ann) return;
    var row = table.querySelector('tr[data-line="%%d"'.replace('%%d', n) + ']');
    if (!row) return;
    row.classList.add('cv-ann');
    var mark = row.querySelector('.cv-mark'); if (mark) mark.classList.add('open');
    var bubble = document.createElement('div');
    bubble.className = 'cv-bubble';
    bubble.innerHTML = '<strong>' + (ann.start === ann.end ? 'L' + ann.start : 'L' + ann.start + '-' + ann.end) + '</strong> ' + ann.text;
    row.insertAdjacentElement('afterend', bubble);
    if (scroll) {
      row.scrollIntoView({block: 'center', behavior: 'smooth'});
      var body = document.querySelector('.cv-body');
      var top = body.getBoundingClientRect().top;
      window.scrollBy(0, top - 80 < 0 ? top - 80 : 0);
    }
  }
  table.addEventListener('click', function(e) {
    var mark = e.target.closest('.cv-mark');
    if (mark) { openAnn(parseInt(mark.dataset.line, 10), true); }
  });
  document.querySelectorAll('.ann-line').forEach(function(b) {
    b.addEventListener('click', function() {
      var n = parseInt(b.dataset.line, 10);
      openAnn(n, true);
      var viewer = document.getElementById('codeViewer');
      viewer.scrollIntoView({block: 'start', behavior: 'smooth'});
    });
  });
  document.getElementById('copyBtn').addEventListener('click', function() {
    var t = document.createElement('textarea');
    t.value = src; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); this.textContent = 'Copied!'; } catch (e) {}
    document.body.removeChild(t);
    var btn = this; setTimeout(function() { btn.textContent = 'Copy'; }, 1500);
  });
  // sidebar collapse toggles
  document.querySelectorAll('.nav-section-header').forEach(function(h) {
    h.addEventListener('click', function() { h.classList.toggle('collapsed'); h.nextElementSibling.classList.toggle('collapsed'); });
  });
})();
</script>
</body>
</html>""" % (
        esc(a["client"]), esc(a["module"]), esc(meta_desc),
        SITE, a["category"], a["slug"],
        esc(a["client"]), esc(a["module"]),
        SITE, a["category"], a["slug"],
        SITE,
        esc(a["client"]), esc(a["module"]), esc(meta_desc),
        SITE, a["category"], a["slug"],
        sidebar,
        esc(a["client"]), esc(a["module"]),
        esc(a["client"] + " " + a["module"]), esc(a["overview"]),
        esc(a["source_rel"]), a["lines"], a["gh_url"],
        packets_html,
        esc(a["overview"]), sections_html,
        render_viewer(a),
        render_annotations_table(a),
        ann_json,
    )


def render_hub(analyses):
    cards = []
    cats = {}
    for a in analyses:
        cats.setdefault(a["category"], []).append(a)
    for cat in sorted(cats):
        cards.append('<h2 class="category-header">' + esc(cat.title()) + '</h2><div class="analysis-grid">')
        for a in cats[cat]:
            cards.append('<div class="analysis-card">'
                         '<h3><a href="' + a["category"] + '/' + a["slug"] + '.html">' + esc(a["client"]) + ' \u2014 ' + esc(a["module"]) + '</a></h3>'
                         '<div class="meta"><span class="badge state">' + esc(a["client"]) + '</span><span class="badge dir-sb">' + esc(a["module"]) + '</span>'
                         '<span>' + str(a["lines"]) + ' lines</span></div>'
                         '<p class="desc">' + esc(a["overview"][:200]) + '</p>'
                         '<div class="packets">' + "".join('<span class="badge" style="background:var(--accent-dim);color:var(--accent)">' + p + '</span>' for p in (a.get("packets") or [])[:6]) + '</div>'
                         '<p class="src-link" style="margin-top:8px"><a href="' + a["gh_url"] + '" target="_blank" rel="noopener">GitHub source \u2197</a></p>'
                         '</div>')
        cards.append('</div>')
    return "\n".join(cards)


def main():
    targets = sys.argv[1:]
    analyses = load_analyses(targets or None)
    if not analyses:
        print("no analyses matched", file=sys.stderr)
        sys.exit(1)

    all_analyses = load_analyses()
    for a in analyses:
        # coverage check: every non-blank line annotated
        covered = set()
        for ann in a["annotations"]:
            for ln in range(ann["start"], ann["end"] + 1):
                covered.add(ln)
        code_lines = a["code"].split("\n")
        missing = [ln for ln in range(1, a["lines"] + 1)
                   if ln not in covered and code_lines[ln - 1].strip()
                   and code_lines[ln - 1].strip() not in ("{", "}")]
        if missing:
            print("WARN %s: lines without annotations: %s" % (a["slug"], missing[:20]))
        out_dir = os.path.join(OUT, a["category"])
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, a["slug"] + ".html"), "w", encoding="utf-8") as f:
            f.write(render_page(a, all_analyses))
        print("wrote analysis/%s/%s.html (%d lines, %d annotations)"
              % (a["category"], a["slug"], a["lines"], len(a["annotations"])))

    # hubs
    hub = """<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Module Analysis | Minecraft 1.8.9 Packet Reference</title>
<meta name="description" content="Full source code analyses of hacked client modules, every line annotated and explained: Scaffold, Disabler and more.">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#0a0a0a">
<link rel="canonical" href="%s/analysis/">
<meta property="og:title" content="Module Analysis | Minecraft 1.8.9 Packet Reference">
<meta property="og:type" content="website">
<meta property="og:url" content="%s/analysis/">
<meta property="og:image" content="%s/assets/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/style.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📦</text></svg>">
<style>
.analysis-grid { display:grid; gap:20px; margin:32px 0; }
.analysis-card { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius); padding:20px; transition:border-color 0.12s; }
.analysis-card:hover { border-color:var(--accent); }
.analysis-card h3 { font-size:1rem; font-weight:600; margin-bottom:6px; }
.analysis-card h3 a { color:var(--text-primary); text-decoration:none; }
.analysis-card h3 a:hover { color:var(--accent); }
.analysis-card .meta { font-size:0.78rem; color:var(--text-muted); margin-bottom:8px; display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.analysis-card .desc { font-size:0.85rem; color:var(--text-secondary); line-height:1.6; }
.analysis-card .packets { display:flex; flex-wrap:wrap; gap:4px; margin-top:10px; }
.analysis-card .badge { font-size:0.68rem; padding:1px 8px; border-radius:8px; font-family:var(--font-mono); }
.category-header { font-size:1.3rem; font-weight:700; margin:40px 0 16px; padding-bottom:8px; border-bottom:1px solid var(--border-subtle); }
.src-link { font-size:0.72rem; }
.src-link a { color:var(--accent); }
</style>
</head>
<body>
<aside class="sidebar" id="sidebar">
  <div class="sidebar-header">
    <a href="../" class="logo" style="text-decoration:none">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 7h10M7 12h10M7 17h6"/></svg>
      <span>MC <strong>1.8.9</strong></span>
    </a>
  </div>
  %s
</aside>
<main class="main">
  <div class="content-detail" style="display:block;max-width:900px;margin:0 auto;padding:40px 48px 80px;width:100%%">
    <div class="detail-header">
      <h1>Module Analysis</h1>
      <p class="detail-desc">Full source code walkthroughs of hacked client modules. Every line of every module is annotated and explained, with the complete original source rendered in a GitHub-style viewer.</p>
    </div>
    %s
    <div style="margin-top:32px;text-align:center">
      <a href="../" style="color:var(--accent);font-size:0.85rem">\u2190 Back to Packet Reference</a>
    </div>
  </div>
</main>
</body>
</html>"""
    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as f:
        f.write(hub % (SITE, SITE, SITE, build_sidebar(all_analyses, None, "hub"), render_hub(all_analyses)))
    print("wrote analysis/index.html")


if __name__ == "__main__":
    main()
