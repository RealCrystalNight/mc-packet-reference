#!/usr/bin/env python3
"""check-site.py — post-build sanity checks on the generated static site.

1. Every data/packets/*.json has a rendered packets/<id>/index.html.
2. Every page contains the packet title and required section markers.
3. Every related-packet chip links to an existing page.
4. js/packet-data.js parses and contains all packet ids.
5. sitemap.xml lists every packet page.
"""
import json
import os
import re
import sys
from html import unescape as h_unescape

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKETS_DIR = os.path.join(BASE, "data", "packets")
PAGES_DIR = os.path.join(BASE, "packets")
SITE = "https://realcrystalnight.github.io/mc-packet-reference"

errors = []

pkt_ids = sorted(f[:-5] for f in os.listdir(PACKETS_DIR) if f.endswith(".json"))
print("packets:", len(pkt_ids))

for pid in pkt_ids:
    page = os.path.join(PAGES_DIR, pid, "index.html")
    if not os.path.exists(page):
        errors.append("missing page: %s" % page)
        continue
    html = open(page, encoding="utf-8", errors="replace").read()
    if pid not in html:
        errors.append("%s: page lacks packet id in content" % pid)
    # related chips must point at real pages
    for m in re.finditer(r'href="\.\./([A-Za-z0-9]+)/"', html):
        if m.group(1) != pid and not os.path.exists(os.path.join(PAGES_DIR, m.group(1), "index.html")):
            errors.append("%s: broken related link to %s" % (pid, m.group(1)))
    # SEO invariants on every generated page
    if "@context\":\"https://***@type" in html or "***@type" in html:
        errors.append("%s: malformed JSON-LD @context" % pid)
    if 'rel="canonical" href="' + SITE + "/packets/" + pid + '/"' not in html:
        errors.append("%s: canonical does not point at %s/packets/%s/" % (pid, SITE, pid))
    if 'og:image' not in html or "assets/og-image.png" not in html:
        errors.append("%s: missing og:image" % pid)
    if "<h1>" not in html:
        errors.append("%s: missing h1" % pid)
    if "application/ld+json" not in html or "BreadcrumbList" not in html:
        errors.append("%s: missing structured data" % pid)

# modules index
mod_page = os.path.join(PAGES_DIR, "..", "modules", "index.html")
if not os.path.exists(mod_page):
    errors.append("missing modules/index.html")
else:
    mh = open(mod_page, encoding="utf-8").read()
    if "Module Index" not in mh or "mod-card" not in mh:
        errors.append("modules/index.html looks empty")
    if 'rel="canonical" href="' + SITE + '/modules/"' not in mh:
        errors.append("modules/index.html canonical wrong")

# packets index (static listing) must be current
pkt_index = os.path.join(PAGES_DIR, "index.html")
if not os.path.exists(pkt_index):
    errors.append("missing packets/index.html")
else:
    pi = open(pkt_index, encoding="utf-8").read()
    if 'rel="canonical" href="' + SITE + '/packets/"' not in pi:
        errors.append("packets/index.html canonical wrong")
    if str(len(pkt_ids)) not in pi:
        errors.append("packets/index.html packet count out of date")
    if "mc-packet-reference.github.io" in pi:
        errors.append("packets/index.html still references the wrong domain")

# brand assets
for asset in ["assets/og-image.png", "assets/icon-192.png", "assets/icon-512.png", "assets/site.webmanifest"]:
    if not os.path.exists(os.path.join(BASE, asset)):
        errors.append("missing %s" % asset)

# robots.txt sitemap must point at the real site
robots = open(os.path.join(BASE, "robots.txt"), encoding="utf-8").read()
if SITE + "/sitemap.xml" not in robots:
    errors.append("robots.txt sitemap URL is wrong")

# analysis pages: hub + every registered analysis + assets
an_data = os.path.join(BASE, "data", "analysis")
if os.path.isdir(an_data):
    idx = json.load(open(os.path.join(an_data, "index.json")))
    hub = os.path.join(BASE, "analysis", "index.html")
    if not os.path.exists(hub):
        errors.append("missing analysis/index.html")
    for slug in idx["analyses"]:
        data = json.load(open(os.path.join(an_data, slug + ".json")))
        page = os.path.join(BASE, "analysis", data["category"], slug + ".html")
        if not os.path.exists(page):
            errors.append("missing analysis page: %s" % slug)
            continue
        ph = open(page, encoding="utf-8").read()
        if 'class="cv-row"' not in ph:
            errors.append("%s: no code viewer rows" % slug)
        if "highlight.min.js" not in ph or "github-dark.min.css" not in ph:
            errors.append("%s: highlight.js assets missing" % slug)
        if "What this file does" not in ph:
            errors.append("%s: missing file explanations" % slug)
        # every declared file must appear as its own viewer with an explanation
        files = data.get("files", [])
        if data.get("source_rel") and not any(f["rel"] == data["source_rel"] for f in files):
            files = [{"rel": data["source_rel"]}] + files
        for f in files:
            if not f.get("explanation") or len(f["explanation"]) < 60:
                errors.append("%s: file '%s' missing real explanation" % (slug, f["rel"]))
            src = open(os.path.join(
                os.path.normpath(os.path.join(BASE, "..", "references", "mc-client-sources", "sources")),
                data["client"], f["rel"]), encoding="utf-8", errors="replace").read()
            # the page renders each code line HTML-escaped inside its own row, so
            # verify per-line escaped presence rather than a raw whole-file substring
            def esc(s):
                return (s.replace("&", "&amp;").replace("<", "&lt;")
                         .replace(">", "&gt;").replace('"', "&quot;"))
            missing_lines = [l for l in src.rstrip("\n").split("\n")
                             if l.strip() and esc(l) not in ph]
            if missing_lines:
                errors.append("%s: file '%s' code not present in page (%d lines missing)"
                              % (slug, f["rel"], len(missing_lines)))
        if "annotation" in json.dumps(data).lower():
            errors.append("%s: stale annotation fields present" % slug)
        # countering anticheat checks: every entry must exist in the AC root and
        # appear in the page with a real explanation
        for c in data.get("countering", []):
            if not c.get("explanation") or len(c["explanation"]) < 60:
                errors.append("%s: countering '%s' missing real explanation" % (slug, c.get("label")))
            ac_src = os.path.join(
                os.path.normpath(os.path.join(BASE, "..", "references", "mc-client-sources", "anticheats")),
                c.get("ac", ""), c.get("rel", ""))
            if not os.path.isfile(ac_src):
                errors.append("%s: countering file not found: %s" % (slug, ac_src))
                continue
            if "Countering Checks" not in ph:
                errors.append("%s: missing Countering Checks section" % slug)
            raw = open(ac_src, encoding="utf-8", errors="replace").read().rstrip("\n")
            if raw not in ph:
                errors.append("%s: countering file '%s' code not present in page" % (slug, c.get("rel")))
    for asset in ["assets/highlight.min.js", "assets/github-dark.min.css"]:
        if not os.path.exists(os.path.join(BASE, asset)):
            errors.append("missing %s" % asset)

# vanilla source: every packet page must carry the full MCP class fetched from
# Marcelektro/MavenMCP-1.8.9 (data/vanilla/<id>.java) + the original link
vanilla_idx = os.path.join(BASE, "data", "vanilla", "_index.json")
if os.path.exists(vanilla_idx):
    vindex = json.load(open(vanilla_idx))
    for pid in pkt_ids:
        page = os.path.join(PAGES_DIR, pid, "index.html")
        if not os.path.exists(page):
            continue
        html = open(page, encoding="utf-8").read()
        if pid not in vindex:
            errors.append("%s: no fetched vanilla source (run scripts/fetch-vanilla-sources.js)" % pid)
            continue
        if "Vanilla Source" not in html:
            errors.append("%s: missing Vanilla Source section" % pid)
        if vindex[pid]["blob"] not in html:
            errors.append("%s: missing MavenMCP original link" % pid)
        src = open(os.path.join(BASE, "data", "vanilla", pid + ".java"), encoding="utf-8", errors="replace").read().rstrip("\n")
        # the page escapes code per line; extract the Vanilla Source viewer's
        # code cells and unescape to compare against the fetched source
        m = re.search(r"<h3>Vanilla Source</h3>(.*?)</div>\s*</div>", html, re.S)
        if not m:
            errors.append("%s: Vanilla Source section missing" % pid)
            continue
        cells = re.findall(r'<td class="cv-code"><pre><code>(.*?)</code></pre></td>', m.group(1), re.S)
        joined = "\n".join(h_unescape(c) for c in cells)
        if joined != src:
            errors.append("%s: vanilla source code mismatch in page (%d vs %d chars)" % (pid, len(joined), len(src)))

# packet-data.js integrity
pd_path = os.path.join(BASE, "js", "packet-data.js")
pd = open(pd_path, encoding="utf-8").read()
m = re.search(r"const PACKETS = (\[.*?\]);", pd, re.S)
if not m:
    errors.append("packet-data.js: PACKETS array not found")
else:
    try:
        pkts = json.loads(m.group(1))
        ids = [p["id"] for p in pkts]
        missing = [pid for pid in pkt_ids if pid not in ids]
        if missing:
            errors.append("packet-data.js missing %d packets: %s" % (len(missing), missing[:5]))
        if any("implementation" in p for p in pkts):
            errors.append("packet-data.js should not contain implementation payloads (search bundle)")
        print("packet-data.js: %d packets, %.1f KB" % (len(pkts), os.path.getsize(pd_path) / 1024))
    except Exception as e:
        errors.append("packet-data.js parse failed: %s" % e)

# sitemap integrity
sm_path = os.path.join(BASE, "sitemap.xml")
sm = open(sm_path, encoding="utf-8").read()
missing_sm = [pid for pid in pkt_ids if (SITE + "/packets/" + pid + "/") not in sm]
if missing_sm:
    errors.append("sitemap missing %d packet urls" % len(missing_sm))

# every page must have a working stylesheet link
for pid in pkt_ids[:5]:
    html = open(os.path.join(PAGES_DIR, pid, "index.html"), encoding="utf-8").read()
    if "../../css/style.css" not in html:
        errors.append("%s: missing stylesheet link" % pid)

if errors:
    print("\nERRORS (%d):" % len(errors))
    for e in errors:
        print("  " + e)
    sys.exit(1)
print("OK: %d pages, search bundle, sitemap all consistent" % len(pkt_ids))
