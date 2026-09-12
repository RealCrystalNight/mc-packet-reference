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
- Anti-Cheat Checks section: real server-side check code from 50 cloned
  anticheats (NoCheatPlus, Grim, Kauri, Artemis, Intave, Frequency, NESS...)
- Search by packet name, ID, or description; filter by direction and state
- Dark theme, mobile-responsive, static GitHub Pages deployment
- Full 1.8.9 source browser: all 1,612 MavenMCP classes as individual SEO
  pages, downloadable raw `.java`, and 3,087 verbatim resource assets
- graphify knowledge graph: 20,519 symbols / 74,466 edges collapsed to a
  crawlable class dependency graph, plus interactive class/community/tree views

## Data Sources
- MCP (Minecraft Coder Pack) deobfuscated 1.8.9 sources — the full tree is
  vendored from Marcelektro/MavenMCP-1.8.9 (sparse clone of `src/`; see
  `scripts/fetch-mcp-src.sh`)
- graphify (Graphify-Labs/graphify) local AST knowledge graph of that source
- wiki.vg protocol specification
- Forge JavaDocs (1.8.9)
- 10 reference client source trees (see `data/mined/` + `data/mined-novliquid/` for the grep corpora)
- 50 cloned open-source anticheats (see
  `../references/mc-client-sources/anticheats/` + its manifest.json; clone with
  `scripts/clone-anticheats.sh`, AC_ROOT configurable)

## Pipeline

The site is generated from layered data. Everything is reproducible:

```bash
# 1. Mine the 8 client sources for every packet class → data/mined/<id>.txt
#    (sources root configurable: --sources=... or env MC_SOURCES_ROOT)
python3 scripts/mine-sources.py

# 1b. (Optional) Clone anticheat repos → references/mc-client-sources/anticheats/
#     then mine them for every packet → data/ac-mined/<id>.txt (AC_ROOT configurable)
bash ../references/mc-client-sources/anticheats/scripts/clone-anticheats.sh
python3 scripts/mine-ac.py

# 2. (Content authoring) data/impl/<id>.json — advanced writeups + real code.
#    Schema: data/impl/SCHEMA.md. Full-file code blocks:
python3 scripts/make-code-block.py "Rise 5.99" "dev/rise/module/impl/other/PingSpoof.java"
#    Anti-cheat check data: data/ac/<id>.json — Schema: data/ac/SCHEMA.md

# 3. Verify every impl file against ground truth (found_in + verbatim code diff)
python3 scripts/verify-impl.py --all

# 4. Merge impl data into packet JSONs
node scripts/merge-impl.js

# 5. Rebuild search bundle + regenerate all pages + sitemap
node scripts/build.js
node scripts/generate-pages.js
```

### Full source browser + code graph (optional, ~14 MB vendored input)

```bash
# 6. Sparse-clone ONLY src/ from MavenMCP (git-ignored build input)
./scripts/fetch-mcp-src.sh          # -> vendor/MavenMCP-1.8.9/src

# 7. Build the graphify knowledge graph (local AST, no API key)
uv tool install graphifyy           # once
./scripts/build-graph.sh            # -> vendor/graphify-out/{graph.json,graph.html,...}

# 8. Generate the served pages
node scripts/generate-source.js     # -> source/** (1,612 class pages + browser + api/source.json)
node scripts/generate-graph.js      # -> source/graph/** + api/graph.json
# scripts/rebuild.sh runs steps 6–8 automatically when vendor/ is present.
```

A fresh clone can regenerate everything: `./scripts/fetch-mcp-src.sh &&
./scripts/build-graph.sh && ./scripts/rebuild.sh`.

### Data layout
```
data/
├── packets/<id>.json    # base packet metadata (fields, encoding, MCP)
├── impl/<id>.json       # advanced writeup + implementation cases (authored)
├── impl/SCHEMA.md       # writeup contract / schema
├── ac/<id>.json         # anti-cheat check data (authored, optional)
├── ac/SCHEMA.md         # anti-cheat schema
├── mined/<id>.txt       # grep corpus: every module referencing the packet
└── ac-mined/<id>.txt    # grep corpus: every anticheat check touching the packet
```

### Served source-browser outputs
```
source/
├── index.html                 # package/class browser + client-side filter
├── <pkg>/<Class>/index.html   # one SEO page per class (source + dependencies)
├── <pkg>/index.html           # package listing
├── src/main/java/<...>.java   # raw source mirrors (downloadable)
├── src/main/resources/<...>   # raw resource/asset mirrors (textures, lang, shaders)
├── resources/index.html       # resource tree
└── graph/                     # code graph hub + interactive views + class-graph.json

api/source.json                # machine index of every class
api/graph.json                 # class-level graph (nodes, links, communities)
sitemap-source.xml             # sitemap for all 1,600+ source pages (indexed from sitemap-index.xml)
```

`js/packet-data.js` (the search bundle) intentionally strips implementation
payloads; the static pages carry the full content.

## Deployment
Static site, deploy to GitHub Pages (repo: mc-packet-reference, branch: main).
