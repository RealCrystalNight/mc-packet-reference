# Minecraft 1.8.9 Packet Reference

Complete reference for all 105 Minecraft 1.8.9 network packets, with
super-advanced writeups and real implementation data mined from 8 reference
client codebases (Memeware 7.3, Nekoware v1 private, Rise 5.99, Rise 6.2.4,
Rise 6.1.30, Sigma 4.11, Spicy, Tenacity 6.0).

## Features
- All 105 packets documented with fields, types, wire encoding, MCP references
- Deep Dive writeup per packet: protocol role, vanilla handling, exploit surface
- Server-Side Handling / Protocol Analysis / Anti-Cheat Landscape callouts
- Real implementation cases: full module source files cat'd verbatim from the
  reference clients, with AI analysis notes appended after the code
- Search by packet name, ID, or description; filter by direction and state
- Dark theme, mobile-responsive, static GitHub Pages deployment

## Data Sources
- MCP (Minecraft Coder Pack) deobfuscated 1.8.9 sources
- wiki.vg protocol specification
- Forge JavaDocs (1.8.9)
- 8 reference client source trees (see `data/mined/` for the grep corpus)

## Pipeline

The site is generated from layered data. Everything is reproducible:

```bash
# 1. Mine the 8 client sources for every packet class → data/mined/<id>.txt
#    (sources root configurable: --sources=... or env MC_SOURCES_ROOT)
python3 scripts/mine-sources.py

# 2. (Content authoring) data/impl/<id>.json — advanced writeups + real code.
#    Schema: data/impl/SCHEMA.md. Full-file code blocks:
python3 scripts/make-code-block.py "Rise 5.99" "dev/rise/module/impl/other/PingSpoof.java"

# 3. Verify every impl file against ground truth (found_in + verbatim code diff)
python3 scripts/verify-impl.py --all

# 4. Merge impl data into packet JSONs
node scripts/merge-impl.js

# 5. Rebuild search bundle + regenerate all pages + sitemap
node scripts/build.js
node scripts/generate-pages.js
```

### Data layout
```
data/
├── packets/<id>.json    # base packet metadata (fields, encoding, MCP)
├── impl/<id>.json       # advanced writeup + implementation cases (authored)
├── impl/SCHEMA.md       # writeup contract / schema
└── mined/<id>.txt       # grep corpus: every module referencing the packet
```

`js/packet-data.js` (the search bundle) intentionally strips implementation
payloads; the static pages carry the full content.

## Deployment
Static site, deploy to GitHub Pages (repo: mc-packet-reference, branch: main).
