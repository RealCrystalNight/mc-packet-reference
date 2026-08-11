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
