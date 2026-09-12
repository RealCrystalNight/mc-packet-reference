#!/usr/bin/env bash
# scripts/build-graph.sh
# Builds the graphify knowledge graph for the vendored MCP 1.8.9 source.
# Fully local AST extraction (no API key, nothing leaves the machine).
#
#   uv tool install graphifyy     # once
#   ./scripts/fetch-mcp-src.sh    # once / to update
#   ./scripts/build-graph.sh
#
# Output (git-ignored, consumed by scripts/generate-source.js + generate-graph.js):
#   vendor/graphify-out/graph.json         raw symbol graph
#   vendor/graphify-out/graph.html         community-level interactive graph
#   vendor/graphify-out/GRAPH_TREE.html    D3 collapsible symbol tree
#   vendor/graphify-out/GRAPH_REPORT.md    god nodes / communities / cycles
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="vendor/MavenMCP-1.8.9/src/main/java"
WORK="vendor/graphwork"
OUT="$WORK/graphify-out"

[[ -d "$SRC" ]] || { echo "missing $SRC — run scripts/fetch-mcp-src.sh first" >&2; exit 1; }
command -v graphify >/dev/null 2>&1 || { echo "graphify not found — run: uv tool install graphifyy" >&2; exit 1; }

echo "==> graphify extract (local AST, code-only)"
rm -rf "$WORK"; mkdir -p "$WORK"
graphify extract "$SRC" --code-only --no-gitignore --out "$WORK"

echo "==> cluster (Leiden) — report only, no LLM labels"
graphify cluster-only "$WORK" --no-label --no-viz

echo "==> interactive community graph"
graphify export html --graph "$OUT/graph.json" --node-limit 3000

echo "==> D3 symbol tree"
graphify tree --graph "$OUT/graph.json" --output "$OUT/GRAPH_TREE.html" --label "Minecraft 1.8.9"

mkdir -p vendor/graphify-out
cp "$OUT/graph.json" "$OUT/graph.html" "$OUT/GRAPH_REPORT.md" "$OUT/GRAPH_TREE.html" "$OUT/.graphify_analysis.json" vendor/graphify-out/
echo "==> graph ready in vendor/graphify-out/"
