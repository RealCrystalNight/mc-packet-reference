#!/usr/bin/env python3
"""generate-analysis.py — build GitHub-style module analysis pages.

Reads data/analysis/<slug>.json:

  {
    "module": "Disabler", "client": "Rise 6.0", "category": "disabler",
    "source_rel": ".../Disabler.java",          # optional main file
    "overview": "...", "sections": [{"h","p"}], "packets": [...],
    "files": [
      {"label": "Disabler.java (mode selector)",
       "rel": "com/alan/clients/module/impl/exploit/Disabler.java",
       "explanation": "What this file does, accurately."},
      ...
    ]
  }

Each entry in "files" is rendered as its own FULL-SOURCE code box (line
numbers, highlight.js java dark theme, copy button) with its explanation in
a new section BELOW the box. No per-line annotations.

Usage:
  python3 scripts/generate-analysis.py            # all
  python3 scripts/generate-analysis.py <slug>     # one
"""
import json
import os
import re
import sys
import time
import urllib.parse

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data", "analysis")
OUT = os.path.join(BASE, "analysis")
DEFAULT_SOURCES = os.path.normpath(os.path.join(BASE, "..", "references", "mc-client-sources", "sources"))
SOURCES_ROOT = os.environ.get("SOURCES_ROOT") or DEFAULT_SOURCES
DEFAULT_AC_ROOT = os.path.normpath(os.path.join(BASE, "..", "references", "mc-client-sources", "anticheats"))
AC_ROOT = os.environ.get("AC_ROOT") or DEFAULT_AC_ROOT
SITE = "https://realcrystalnight.github.io/mc-packet-reference"
GH_BASE = "https://github.com/iroot3/mc-client-sources/blob/main/sources"

# anticheat dir name -> github repo (from the anticheat manifest)
AC_REPOS = {}
try:
    for entry in json.load(open(os.path.join(AC_ROOT, "manifest.json"))):
        g = entry.get("github", "")
        if g:
            AC_REPOS[g.replace("/", "-")] = g
except Exception:
    pass


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
        a["files"] = a.get("files", [])
        if a.get("source_rel") and not any(f["rel"] == a["source_rel"] for f in a["files"]):
            a["files"].insert(0, {"label": a["module"] + ".java", "rel": a["source_rel"],
                                  "explanation": a.get("file_explanation", "")})
        for f in a["files"]:
            if a.get("ac"):
                # anticheat-side analysis: resolve against the AC root
                f["path"] = os.path.join(AC_ROOT, a["client"], f["rel"])
                with open(f["path"], encoding="utf-8", errors="replace") as fh:
                    f["code"] = fh.read()
                f["lines"] = f["code"].count("\n") + (0 if f["code"].endswith("\n") else 1)
                repo = AC_REPOS.get(a["client"])
                f["gh_url"] = "https://github.com/" + repo if repo else None
            else:
                f["path"] = os.path.join(SOURCES_ROOT, a["client"], f["rel"])
                with open(f["path"], encoding="utf-8", errors="replace") as fh:
                    f["code"] = fh.read()
                f["lines"] = f["code"].count("\n") + (0 if f["code"].endswith("\n") else 1)
                f["gh_url"] = gh_url(a["client"], f["rel"])
        # countering anticheat checks: ac dir + rel path inside the AC repo
        countering = []
        for c in a.get("countering", []):
            cpath = os.path.join(AC_ROOT, c["ac"], c["rel"])
            if not os.path.isfile(cpath):
                print("WARN %s: countering file missing: %s" % (slug, cpath), file=sys.stderr)
                continue
            with open(cpath, encoding="utf-8", errors="replace") as fh:
                c["code"] = fh.read()
            c["lines"] = c["code"].count("\n") + (0 if c["code"].endswith("\n") else 1)
            repo = AC_REPOS.get(c["ac"])
            c["repo_url"] = "https://github.com/" + repo if repo else None
            countering.append(c)
        a["countering"] = countering
        out.append(a)
    return out


def build_sidebar(analyses, active_slug, mode="page"):
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
    active_cat = None
    for a in analyses:
        if a["slug"] == active_slug:
            active_cat = a["category"]
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
                rel = ("" if mode == "page" and a["category"] == active_cat else cat_prefix(a["category"])) + a["slug"] + ".html"
            parts.append('<a href="' + rel + '" class="nav-item' + active + '">'
                         '<span class="nav-hex">ANA</span>'
                         '<span class="nav-name">' + esc(a["client"]) + ' ' + esc(a["module"]) + '</span></a>')
        parts.append('</div></div>')
    parts.append('</nav>')
    return "\n".join(parts)


def render_prose(s):
    """Multi-paragraph prose -> <p> blocks (no per-line anything)."""
    return "".join("<p>%s</p>" % esc(p.strip()) for p in s.split("\n\n") if p.strip())


def render_viewer(f, ac_repo=None):
    rows = []
    lines = f["code"].rstrip("\n").split("\n")
    for i, line in enumerate(lines, 1):
        rows.append('<tr class="cv-row" data-line="%d">'
                    '<td class="cv-ln"><span class="cv-num">%d</span></td>'
                    '<td class="cv-code"><pre><code>%s</code></pre></td></tr>'
                    % (i, i, esc(line)))
    # raw source kept verbatim (hidden) so the site check can verify the full
    # file made it into the page; <textarea> content is RCDATA, so Java code
    # cannot break out of it
    raw = '<textarea class="cv-raw" hidden>%s</textarea>' % f["code"].rstrip("\n")
    if ac_repo:
        link = '<a class="cv-link" href="' + ac_repo + '" target="_blank" rel="noopener">Repo \u2197</a>'
    else:
        link = '<a class="cv-link" href="' + f["gh_url"] + '" target="_blank" rel="noopener">Original \u2197</a>'
    return ('<div class="code-viewer" id="codeViewer">'
            '<div class="cv-toolbar">'
            '<span class="cv-file">' + esc(f["rel"].split("/")[-1]) + '</span>'
            '<span class="cv-meta">' + str(f["lines"]) + ' lines \u00b7 Java</span>'
            '<button class="cv-copy" data-copy="%d">Copy</button>'
            + link +
            '</div>'
            '<div class="cv-body"><table class="cv-table" id="cvTable">' + "\n".join(rows) + '</table></div>'
            + raw
            + '</div>')


def render_page(a, analyses):
    sidebar = build_sidebar(analyses, a["slug"], "page")
    meta_desc = (a["module"] + " module (" + a["client"] + ") full source analysis \u2014 " + a["overview"][:180])
    packets_html = ""
    if a.get("packets"):
        chips = "".join('<a class="related-chip" href="../../packets/%s/">%s</a>' % (p, p) for p in a["packets"])
        packets_html = '<div class="detail-section"><h3>Packets This Module Uses</h3><div class="related-list">' + chips + '</div></div>'
    sections_html = "".join('<h4>' + esc(s["h"]) + '</h4>' + render_prose(s["p"]) for s in a.get("sections", []))
    total_lines = sum(f["lines"] for f in a["files"])
    # dates for article structured data: data-file mtime (modified), git first commit (published)
    import subprocess as _sp
    data_path = os.path.join(DATA, a["slug"] + ".json")
    mod_date = time.strftime("%Y-%m-%d", time.localtime(os.path.getmtime(data_path)))
    pub_date = mod_date
    try:
        _d = _sp.run(["git", "log", "--diff-filter=A", "--format=%cI", "-1", "--", "data/analysis/%s.json" % a["slug"]],
                     cwd=BASE, capture_output=True, text=True, timeout=10).stdout.strip()
        if _d:
            pub_date = _d[:10]
    except Exception:
        pass
    # every file box: viewer + explanation section below the code
    file_blocks = []
    for f in a["files"]:
        file_blocks.append('<div class="detail-section file-section">'
                           '<h3><span class="file-badge">source</span> ' + esc(f["label"]) + '</h3>'
                           + render_viewer(f) +
                           (('<h4>What this file does</h4>' + render_prose(f["explanation"])) if f.get("explanation") else "")
                           + '</div>')
    files_html = "\n".join(file_blocks)
    # countering anticheat checks: full AC source that counteracts the module
    counter_blocks = []
    for c in a.get("countering", []):
        counter_blocks.append('<div class="detail-section file-section ac-section">'
                              '<h3><span class="file-badge ac">anticheat</span> ' + esc(c["label"]) + '</h3>'
                              + render_viewer(c, c.get("repo_url")) +
                              (('<h4>How it counteracts this module</h4>' + render_prose(c["explanation"])) if c.get("explanation") else "")
                              + '</div>')
    counter_html = ""
    if counter_blocks:
        counter_html = ('<div class="detail-section">'
                        '<h3><span class="file-badge ac">anticheat</span> Countering Checks</h3>'
                        '<p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.65;margin-bottom:12px">'
                        'The anticheat code that detects or counters the techniques this module uses. Full source, '
                        'with the detection mechanism explained below each box.</p></div>'
                        + "\n".join(counter_blocks))
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
<meta property="og:locale" content="en_US">
<meta property="article:published_time" content="%s">
<meta property="article:modified_time" content="%s">
<meta name="keywords" content="Minecraft, 1.8.9, %s, %s, module, packet, anticheat, analysis, source code">
<meta property="og:type" content="article">
<meta property="og:url" content="%s/analysis/%s/%s.html">
<meta property="og:image" content="%s/assets/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=optional" rel="stylesheet">
<link rel="stylesheet" href="../../css/style.css">
<link rel="stylesheet" href="../../assets/github-dark.min.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📦</text></svg>">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"TechArticle","headline":"%s %s \u2014 Full Source Analysis","description":"%s","datePublished":"%s","dateModified":"%s","inLanguage":"en","mainEntityOfPage":{"@type":"WebPage","@id":"%s/analysis/%s/%s.html"},"author":{"@type":"Organization","name":"MC Packet Reference"},"publisher":{"@type":"Organization","name":"MC Packet Reference"},"about":{"@type":"SoftwareApplication","name":"Minecraft Java Edition","version":"1.8.9"}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"%s/"},{"@type":"ListItem","position":2,"name":"Module Analysis","item":"%s/analysis/"},{"@type":"ListItem","position":3,"name":"%s %s","item":"%s/analysis/%s/%s.html"}]}
</script>
<style>
.analysis-body h4 { font-size:0.82rem; font-weight:600; color:var(--text-primary); margin:18px 0 6px; text-transform:uppercase; letter-spacing:0.04em; }
.analysis-body p { font-size:0.88rem; color:var(--text-secondary); line-height:1.7; margin-bottom:10px; }
.file-section h4 { font-size:0.82rem; font-weight:600; color:var(--accent); margin:14px 0 6px; text-transform:uppercase; letter-spacing:0.04em; }
.file-section p { font-size:0.87rem; color:var(--text-secondary); line-height:1.7; margin-bottom:10px; }
.file-badge { font-size:0.6rem; background:var(--accent-dim); color:var(--accent); padding:1px 6px; border-radius:4px; font-weight:600; text-transform:uppercase; vertical-align:middle; }
.file-badge.ac { background:var(--red-dim); color:var(--red); }
.ac-section h3 { color:var(--red); }
.code-viewer { border:1px solid var(--border); border-radius:var(--radius-sm); overflow:hidden; margin:12px 0; background:#0d1117; }
.cv-toolbar { display:flex; align-items:center; gap:12px; padding:8px 14px; background:#161b22; border-bottom:1px solid var(--border); font-size:0.78rem; }
.cv-file { font-family:var(--font-mono); color:var(--text-primary); font-weight:600; }
.cv-meta { color:var(--text-muted); }
.cv-copy { margin-left:auto; background:var(--bg-tertiary); border:1px solid var(--border); color:var(--text-secondary); font-size:0.7rem; padding:3px 10px; border-radius:4px; cursor:pointer; }
.cv-copy:hover { border-color:var(--accent); color:var(--accent); }
.cv-link { color:var(--accent); text-decoration:none; font-size:0.72rem; }
.cv-body { max-height:640px; overflow:auto; }
.cv-table { width:100%%; border-collapse:collapse; font-family:var(--font-mono); font-size:0.76rem; line-height:1.55; }
.cv-table .cv-ln { width:48px; text-align:right; padding:0 10px 0 0; color:#484f58; background:#0d1117; border-right:1px solid #21262d; user-select:none; white-space:nowrap; vertical-align:top; }
.cv-table .cv-num { display:inline-block; width:28px; text-align:right; }
.cv-table .cv-code { padding:0 14px; vertical-align:top; }
.cv-table .cv-code pre { margin:0; background:transparent; }
.cv-table .cv-code code { background:transparent; padding:0; font-size:inherit; color:var(--text-primary); }
.cv-table .cv-code .hljs { background:transparent; padding:0; }
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
        <span class="badge" style="background:var(--bg-tertiary);color:var(--text-muted)">%d files, %d lines</span>
      </div>
      <h1>%s \u2014 Full Source Analysis</h1>
      <p class="detail-desc">%s</p>
      <div class="detail-meta">
        <span class="meta-mcp">%s</span>
        <span class="meta-sep">\u00b7</span>
        <a class="meta-mcp" style="color:var(--accent)" href="%s" target="_blank" rel="noopener">GitHub source \u2197</a>
      </div>
    </div>
    %s
    <div class="detail-section analysis-body">
      <h3>Analysis</h3>
      <h4>Overview</h4>%s
      %s
    </div>
    %s
    %s
    <div style="margin-top:32px;text-align:center">
      <a href="../" style="color:var(--accent);font-size:0.85rem">\u2190 Back to Analysis Hub</a>
    </div>
  </div>
</main>
<script src="../../assets/highlight.min.js"></script>
<script>
(function() {
  // highlight each code box
  document.querySelectorAll('.cv-table').forEach(function(table) {
    var rows = table.querySelectorAll('tr.cv-row');
    var texts = [];
    rows.forEach(function(r) { texts.push(r.querySelector('code').textContent); });
    var src = texts.join('\\n');
    var hl = hljs.highlight(src, {language: 'java'}).value.split('\\n');
    rows.forEach(function(r, i) { r.querySelector('code').innerHTML = hl[i] || ''; });
    table.dataset.src = src;
  });
  // copy buttons
  document.querySelectorAll('.cv-copy').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var table = btn.closest('.code-viewer').querySelector('.cv-table');
      var t = document.createElement('textarea');
      t.value = table.dataset.src || '';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); btn.textContent = 'Copied!'; } catch (e) {}
      document.body.removeChild(t);
      var b = btn; setTimeout(function() { b.textContent = 'Copy'; }, 1500);
    });
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
        esc(a["client"]), esc(a["module"]), pub_date, mod_date, esc(a["client"]), esc(a["module"]),
        SITE, a["category"], a["slug"],
        SITE,
        esc(a["client"]), esc(a["module"]), esc(meta_desc), pub_date, mod_date,
        SITE, a["category"], a["slug"],
        SITE, SITE, esc(a["client"]), esc(a["module"]), SITE, a["category"], a["slug"],
        sidebar,
        esc(a["client"]), esc(a["module"]),
        len(a["files"]), total_lines,
        esc(a["client"] + " " + a["module"]), esc(a["overview"]),
        esc(a["files"][0]["rel"]) if a["files"] else "", a["files"][0]["gh_url"] if a["files"] else "#",
        packets_html,
        render_prose(a["overview"]), sections_html,
        files_html,
        counter_html,
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
                         '<span>' + str(len(a["files"])) + ' files \u00b7 ' + str(sum(f["lines"] for f in a["files"])) + ' lines</span></div>'
                         '<p class="desc">' + esc(a["overview"][:200]) + '</p>'
                         '<div class="packets">' + "".join('<span class="badge" style="background:var(--accent-dim);color:var(--accent)">' + p + '</span>' for p in (a.get("packets") or [])[:6]) + '</div>'
                         '<p class="src-link" style="margin-top:8px"><a href="' + a["files"][0]["gh_url"] + '" target="_blank" rel="noopener">GitHub source \u2197</a></p>'
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
        out_dir = os.path.join(OUT, a["category"])
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, a["slug"] + ".html"), "w", encoding="utf-8") as f:
            f.write(render_page(a, all_analyses))
        print("wrote analysis/%s/%s.html (%d files, %d lines)"
              % (a["category"], a["slug"], len(a["files"]), sum(f["lines"] for f in a["files"])))

    hub = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "analysis-hub-template.html"), encoding="utf-8").read()
    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as f:
        f.write(hub % (SITE, SITE, SITE, SITE, build_sidebar(all_analyses, None, "hub"), render_hub(all_analyses)))
    print("wrote analysis/index.html")


if __name__ == "__main__":
    main()
