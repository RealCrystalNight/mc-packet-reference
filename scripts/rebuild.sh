#!/usr/bin/env bash
# rebuild.sh — one-shot pipeline: verify impl data, merge, rebuild, regenerate.
#
#   ./scripts/rebuild.sh              full rebuild (verify --all, merge, build, pages)
#   ./scripts/rebuild.sh --skip-verify   skip the ground-truth verification step
#
# Sources root can be pointed elsewhere with MC_SOURCES_ROOT.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${1:-}" != "--skip-verify" ]]; then
  echo "==> verify-impl.py (ground truth: found_in + verbatim code diff)"
  python3 scripts/verify-impl.py --all
fi

echo "==> gen-assets.py (og-image, icons, webmanifest)"
python3 scripts/gen-assets.py

echo "==> merge-impl.js (data/impl -> data/packets)"
node scripts/merge-impl.js

echo "==> build.js (js/packet-data.js + registry)"
node scripts/build.js

echo "==> generate-pages.js (packets/*/index.html + sitemap)"
node scripts/generate-pages.js

echo "==> site check"
python3 scripts/check-site.py

echo "Rebuild complete."
