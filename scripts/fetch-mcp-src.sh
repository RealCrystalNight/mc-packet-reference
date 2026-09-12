#!/usr/bin/env bash
# scripts/fetch-mcp-src.sh
# Sparse-clones ONLY src/ from Marcelektro/MavenMCP-1.8.9 into vendor/.
# vendor/ is git-ignored: it is a build input, not website content. The
# generated pages under source/ are what gets committed and served.
#
#   ./scripts/fetch-mcp-src.sh          clone (or update) vendor/MavenMCP-1.8.9
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="vendor/MavenMCP-1.8.9"
REPO="https://github.com/Marcelektro/MavenMCP-1.8.9"

if [[ -d "$DEST/.git" ]]; then
  echo "==> updating $DEST"
  git -C "$DEST" pull --ff-only
else
  echo "==> sparse-cloning $REPO -> $DEST (src/ only)"
  rm -rf "$DEST"
  git clone --depth 1 --filter=blob:none --sparse "$REPO" "$DEST"
  git -C "$DEST" sparse-checkout set src
fi

echo "==> src ready: $(find "$DEST/src" -type f | wc -l) files ($(du -sh "$DEST/src" | cut -f1))"
