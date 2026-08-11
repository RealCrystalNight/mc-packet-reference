#!/usr/bin/env python3
"""verify-impl.py — verify every data/impl/<packet>.json against ground truth.

Checks:
1. Valid JSON, schema keys only.
2. found_in clients are from the 8 reference clients AND have a real corpus hit
   for this packet (filename fuzzy-match vs the module name).
3. Every detailed_code that carries a FILE: marker is byte-identical to the
   actual source file (verbatim part = block between the marker and the first
   // NOTE line).
4. Related packet ids exist in data/packets/.
5. Completeness: every packet json has a data/impl counterpart (--all mode).

Usage:
  python3 scripts/verify-impl.py            # verify existing impl files
  python3 scripts/verify-impl.py --all      # also report packets with no impl
"""
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKETS_DIR = os.path.join(BASE, "data", "packets")
IMPL_DIR = os.path.join(BASE, "data", "impl")
AC_DIR = os.path.join(BASE, "data", "ac")
MINED_INDEX = os.path.join(BASE, "data", "mined", "_index.json")

DEFAULT_SOURCES = os.path.normpath(os.path.join(BASE, "..", "references", "mc-client-sources", "sources"))
SOURCES_ROOT = os.environ.get("MC_SOURCES_ROOT") or DEFAULT_SOURCES

CLIENTS = ["Memeware 7.3", "Nekoware v1 private", "Rise 5.99", "Rise 6.2.4",
           "Rise 6.1.30", "Sigma 4.11", "Spicy", "Tenacity 6.0"]

ALLOWED = {"writeup", "overview", "server_handling", "protocol_notes",
           "anticheat_landscape", "modules", "general_hooks",
           "client_variations", "related"}

errors = []
warnings = []


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def module_aliases(name):
    """Split 'AutoGG / AutoGroomer / Spammer' and strip '(timer reset)' suffixes."""
    base = re.sub(r"\(.*?\)", "", name)
    parts = re.split(r"[/,]", base)
    return [norm(p) for p in parts if norm(p)]


def check_module(pkt_id, mod, index_entry):
    name = mod.get("name", "?")
    found = mod.get("found_in") or []
    if not isinstance(found, list):
        errors.append("[%s] %s: found_in is not a list" % (pkt_id, name))
        return
    aliases = module_aliases(name)
    for client in found:
        if client not in CLIENTS:
            errors.append("[%s] %s: found_in client '%s' is not one of the 8 reference clients" % (pkt_id, name, client))
            continue
        files = index_entry.get(client) or []
        # fuzzy: any alias appears in a mined file path, or the corpus text
        ok = any(any(a and a in norm(f) for a in aliases) for f in files)
        if not ok:
            corpus_path = os.path.join(BASE, "data", "mined", pkt_id + ".txt")
            if os.path.exists(corpus_path):
                text = norm(open(corpus_path, encoding="utf-8", errors="replace").read())
                ok = any(a and a in text for a in aliases)
        if not ok:
            errors.append("[%s] %s: found_in '%s' has no corpus hit for this packet" % (pkt_id, name, client))

    code = mod.get("detailed_code")
    if code:
        m = re.match(r"^// ===== FILE: ([^\n]+) =====\n", code)
        if not m:
            warnings.append("[%s] %s: detailed_code lacks the FILE: marker" % (pkt_id, name))
            return
        header = m.group(1)
        mm = re.match(r"^(.*?) \u2014 (.*)$", header)
        if not mm:
            errors.append("[%s] %s: unparseable FILE header '%s'" % (pkt_id, name, header))
            return
        client, rel = mm.group(1), mm.group(2)
        verbatim_end = code.find("\n// NOTE")
        verbatim = code[m.end():] if verbatim_end == -1 else code[m.end():verbatim_end]
        verbatim = verbatim.rstrip("\n")
        src_path = os.path.join(SOURCES_ROOT, client, rel)
        if not os.path.isfile(src_path):
            errors.append("[%s] %s: source file not found: %s" % (pkt_id, name, src_path))
            return
        actual = open(src_path, encoding="utf-8", errors="replace").read().rstrip("\n")
        if norm_trailing(verbatim) != norm_trailing(actual):
            errors.append("[%s] %s: code block MISMATCH with %s" % (pkt_id, name, src_path))


def norm_trailing(s):
    return "\n".join(line.rstrip() for line in s.split("\n"))


def check_ac_file(pkt_id, ac_data, ac_index, ac_root):
    """Verify one data/ac/<pkt>.json against the anticheat corpus + sources."""
    for k in ac_data:
        if k not in ("overview", "checks"):
            errors.append("[ac:%s] unknown key '%s'" % (pkt_id, k))
    for c in ac_data.get("checks") or []:
        if not isinstance(c, dict) or "name" not in c:
            errors.append("[ac:%s] malformed check entry" % pkt_id)
            continue
        name = c.get("name", "?")
        for ac in c.get("found_in") or []:
            if ac not in ac_index.get(pkt_id, {}):
                errors.append("[ac:%s] check '%s': found_in '%s' has no corpus hit" % (pkt_id, name, ac))
        code = c.get("detailed_code")
        if code:
            m = re.match(r"^// ===== FILE: ([^\n]+) =====\n", code)
            if not m:
                warnings.append("[ac:%s] check '%s': code lacks FILE: marker" % (pkt_id, name))
                continue
            mm = re.match(r"^(.*?) \u2014 (.*)$", m.group(1))
            if not mm:
                errors.append("[ac:%s] check '%s': unparseable FILE header" % (pkt_id, name))
                continue
            ac_dir, rel = mm.group(1), mm.group(2)
            verbatim_end = code.find("\n// NOTE")
            verbatim = code[m.end():] if verbatim_end == -1 else code[m.end():verbatim_end]
            verbatim = verbatim.rstrip("\n")
            src_path = os.path.join(ac_root, ac_dir, rel)
            if not os.path.isfile(src_path):
                errors.append("[ac:%s] check '%s': source file not found: %s" % (pkt_id, name, src_path))
                continue
            actual = open(src_path, encoding="utf-8", errors="replace").read().rstrip("\n")
            if norm_trailing(verbatim) != norm_trailing(actual):
                errors.append("[ac:%s] check '%s': code MISMATCH with %s" % (pkt_id, name, src_path))


def main():
    check_all = "--all" in sys.argv
    ac_root = os.environ.get("AC_ROOT") or os.path.normpath(os.path.join(BASE, "..", "references", "mc-client-sources", "anticheats"))
    if os.path.exists(MINED_INDEX):
        index = json.load(open(MINED_INDEX))
    else:
        index = {}
    ac_index_path = os.path.join(BASE, "data", "ac-mined", "_index.json")
    ac_index = json.load(open(ac_index_path)) if os.path.exists(ac_index_path) else {}

    impl_files = sorted(f for f in os.listdir(IMPL_DIR) if f.endswith(".json"))
    for f in impl_files:
        pkt_id = f[:-5]
        with open(os.path.join(IMPL_DIR, f)) as fh:
            data = json.load(fh)
        for k in data:
            if k not in ALLOWED:
                errors.append("[%s] unknown schema key '%s'" % (pkt_id, k))
        if data.get("modules") and not isinstance(data["modules"], list):
            errors.append("[%s] modules is not an array" % pkt_id)
        for mod in data.get("modules") or []:
            if not isinstance(mod, dict) or "name" not in mod:
                errors.append("[%s] malformed module entry" % pkt_id)
                continue
            check_module(pkt_id, mod, index.get(pkt_id, {}))
        for rel in data.get("related") or []:
            if not os.path.exists(os.path.join(PACKETS_DIR, rel + ".json")):
                errors.append("[%s] related packet '%s' does not exist" % (pkt_id, rel))

    if check_all:
        missing = sorted(
            f[:-5] for f in os.listdir(PACKETS_DIR) if f.endswith(".json")
            and not os.path.exists(os.path.join(IMPL_DIR, f[:-5] + ".json"))
        )
        if missing:
            print("PACKETS WITHOUT IMPL (%d):" % len(missing))
            for p in missing:
                print("  " + p)

    # Anti-cheat data (data/ac/*.json)
    ac_files = sorted(f for f in os.listdir(AC_DIR) if f.endswith(".json")) if os.path.isdir(AC_DIR) else []
    for f in ac_files:
        pkt_id = f[:-5]
        with open(os.path.join(AC_DIR, f)) as fh:
            ac_data = json.load(fh)
        check_ac_file(pkt_id, ac_data, ac_index, ac_root)

    print("Verified %d impl files" % len(impl_files))
    if ac_files:
        print("Verified %d anticheat files" % len(ac_files))
    if warnings:
        print("\nWARNINGS (%d):" % len(warnings))
        for w in warnings:
            print("  " + w)
    if errors:
        print("\nERRORS (%d):" % len(errors))
        for e in errors:
            print("  " + e)
        sys.exit(1)
    print("OK: all checks passed")


if __name__ == "__main__":
    main()
