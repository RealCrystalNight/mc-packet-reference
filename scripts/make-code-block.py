#!/usr/bin/env python3
"""make-code-block.py — wrap a full client source file as a verbatim code block.

Prints the FULL file content wrapped in the standard marker so it can be pasted
straight into data/impl/<packet>.json `detailed_code` fields.

Usage:
  python3 scripts/make-code-block.py "Rise 5.99" "dev/rise/module/impl/other/PingSpoof.java"
  python3 scripts/make-code-block.py "Memeware 7.3" "me/memewaredevs/client/module/exploit/Disabler.java" --sources=/path/to/sources
"""
import argparse
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SOURCES = os.path.normpath(os.path.join(BASE, "..", "references", "mc-client-sources", "sources"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("client", help="client directory name, e.g. 'Rise 5.99'")
    ap.add_argument("relpath", help="file path relative to the client dir")
    ap.add_argument("--sources", default=os.environ.get("MC_SOURCES_ROOT") or DEFAULT_SOURCES,
                    help="sources root (env MC_SOURCES_ROOT overrides)")
    args = ap.parse_args()

    full = os.path.join(args.sources, args.client, args.relpath)
    if not os.path.isfile(full):
        print("ERROR: %s not found" % full, file=sys.stderr)
        sys.exit(1)

    with open(full, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    print("// ===== FILE: %s \u2014 %s =====" % (args.client, args.relpath))
    print(content.rstrip("\n"))
    print()


if __name__ == "__main__":
    main()
