#!/usr/bin/env python3
"""mine-sources.py — Mine the 8 reference client sources for every packet class.

For each packet in data/packets/*.json, greps all 8 client source trees for the
packet class name and writes:

  data/mined/<packetid>.txt   — per-client, per-file grep context corpus
                                 (the ground truth sub-agents write from)
  data/mined/_index.json      — packet -> client -> [relative file paths]

Usage:
  python3 scripts/mine-sources.py            # mine everything
  python3 scripts/mine-sources.py C02PacketUseEntity   # single packet
"""
import json
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Sources root is configurable — env MC_SOURCES_ROOT, else first CLI arg after
# the packet filter, else a relative default (sibling of this repo).
DEFAULT_SOURCES = os.path.normpath(os.path.join(BASE, "..", "references", "mc-client-sources", "sources"))
SOURCES_ROOT = os.environ.get("MC_SOURCES_ROOT") or DEFAULT_SOURCES
PACKETS_DIR = os.path.join(BASE, "data", "packets")
MINED_DIR = os.path.join(BASE, "data", "mined")
IMPL_DIR = os.path.join(BASE, "data", "impl")

# The 8 authoritative reference clients (user-specified).
# Override with env MC_CLIENTS (comma-separated) or CLI flag --clients=a,b,c.
DEFAULT_CLIENTS = [
    "Memeware 7.3",
    "Nekoware v1 private",
    "Rise 5.99",
    "Rise 6.2.4",
    "Rise 6.1.30",
    "Sigma 4.11",
    "Spicy",
    "Tenacity 6.0",
]

# Packet ids that are NOT the MCP class name.
CLASS_ALIASES = {
    "C00Handshake": "C00PacketHandshake",
}

CTX = 6  # context lines around each match


def grep_file_hits(client_dir, class_name):
    """Run grep -rn -C on the client dir; return {relpath: [(lineno, line), ...]}."""
    hits = {}
    proc = subprocess.run(
        ["grep", "-rn", "-C", str(CTX), "--include=*.java", class_name, client_dir],
        capture_output=True, text=True,
    )
    if proc.returncode not in (0, 1):
        return hits  # grep error — skip
    current = None
    for raw in proc.stdout.splitlines():
        if raw == "--":
            continue
        m = re.match(r"^(.*):(\d+):(.*)$", raw)
        if not m:
            continue
        path, lineno, content = m.group(1), int(m.group(2)), m.group(3)
        # grep may print path as ./foo — normalize
        rel = os.path.relpath(path, client_dir)
        hits.setdefault(rel, []).append((lineno, content))
    return hits


def mine_packet(pkt_id, clients):
    class_name = CLASS_ALIASES.get(pkt_id, pkt_id)
    index_entry = {}
    blocks = ["# %s — mined corpus (%d clients)\n" % (pkt_id, len(clients)),
              "Ground truth for %s. Modules listed per client with file paths and\n"
              "grep context. cat the full file for verbatim code.\n" % class_name]

    for client in clients:
        client_dir = os.path.join(SOURCES_ROOT, client)
        if not os.path.isdir(client_dir):
            continue
        hits = grep_file_hits(client_dir, class_name)
        if not hits:
            continue
        index_entry[client] = sorted(hits.keys())
        blocks.append("\n## %s\n" % client)
        for rel in sorted(hits.keys()):
            lines = hits[rel]
            blocks.append("### %s\n```java" % rel)
            for lineno, content in lines:
                blocks.append("%5d | %s" % (lineno, content))
            blocks.append("```\n")

    return "\n".join(blocks), index_entry


def main():
    os.makedirs(MINED_DIR, exist_ok=True)
    os.makedirs(IMPL_DIR, exist_ok=True)

    # Split args: packet ids vs --clients=... flag
    ids = []
    clients_override = None
    out_dir = None
    for a in sys.argv[1:]:
        if a.startswith("--clients="):
            clients_override = a.split("=", 1)[1].split(",")
        elif a.startswith("--sources="):
            global SOURCES_ROOT
            SOURCES_ROOT = a.split("=", 1)[1]
        elif a.startswith("--out="):
            out_dir = a.split("=", 1)[1]
        else:
            ids.append(a)
    clients = clients_override or (os.environ.get("MC_CLIENTS", "").split(",") if os.environ.get("MC_CLIENTS") else DEFAULT_CLIENTS)
    if not ids:
        ids = sorted(f[:-5] for f in os.listdir(PACKETS_DIR) if f.endswith(".json"))

    if not os.path.isdir(SOURCES_ROOT):
        print("ERROR: sources root not found: %s" % SOURCES_ROOT, file=sys.stderr)
        print("Pass --sources=/path/to/sources or set MC_SOURCES_ROOT.", file=sys.stderr)
        sys.exit(1)

    mine_dir = out_dir or MINED_DIR
    os.makedirs(mine_dir, exist_ok=True)
    index_path = os.path.join(mine_dir, "_index.json")
    index = {}
    if os.path.exists(index_path):
        index = json.load(open(index_path))

    for pkt_id in ids:
        corpus, entry = mine_packet(pkt_id, clients)
        with open(os.path.join(mine_dir, pkt_id + ".txt"), "w") as f:
            f.write(corpus)
        total_files = sum(len(v) for v in entry.values())
        index[pkt_id] = entry
        print("%-26s %3d files across %d clients" % (pkt_id, total_files, len(entry)))

    with open(index_path, "w") as f:
        json.dump(index, f, indent=1, sort_keys=True)
    print("Wrote %d corpus files to %s" % (len(ids), mine_dir))


if __name__ == "__main__":
    main()
