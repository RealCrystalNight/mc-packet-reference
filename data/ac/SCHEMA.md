# data/ac/ — Anti-Cheat Check Schema

Each file `data/ac/<PacketId>.json` holds the SERVER-SIDE anti-cheat story for
one packet: which checks in the cloned anticheats process it, how, and what
they flag. Merged into `data/packets/<id>.json` as `implementation.anticheat`
by `scripts/merge-impl.js` and rendered as the "Anti-Cheat Checks" section.

## Ground truth rules (MANDATORY)

1. Sources are the cloned anticheat repos under
   `references/mc-client-sources/anticheats/<owner>-<repo>/` (see manifest.json).
   The per-packet corpus is `data/ac-mined/<PacketId>.txt` (grep of every
   anticheat for the packet's MCP name, Mojang/ProtocolLib 1.8 name, and
   check-domain keywords).
2. `found_in` MUST contain ONLY anticheat directory names that have a real
   corpus hit for this packet. Never invent a check or attribute code to an
   anticheat that does not reference the packet.
3. `detailed_code` MUST be the FULL file cat'd verbatim from the cited
   anticheat, wrapped by the standard marker (use a helper equivalent to
   make-code-block.py; it lives at website/scripts/make-code-block.py and
   accepts `--sources`):
   `python3 scripts/make-code-block.py "AC_DIR_NAME" "rel/path/Check.kt" --sources=<anticheats root>`
   AI comments go AFTER the verbatim block, prefixed `// NOTE (AI): ...`.
4. No corpus hits for a packet? `checks: []` and the overview explains why
   (login/status/handshake packets are invisible to server-side anticheats;
   some clientbound packets are ignored). Do NOT invent checks.
5. Anticheats are server-side: they see IN packets (client->server) and, for
   a few clientbound packets (S08 teleport, S27 explosion, S32 transaction),
   the OUT side. Checks are usually event/pipeline listeners, not packet
   classes. Match the packet to the CHECK DOMAIN (Reach/KillAura for C02,
   Fly/Speed/NoFall/Phase for C03, etc.) using the corpus.

## Anti-slop style

Zero em dashes in prose (allowed only in code_source/FILE markers), zero
emoji, zero AI-isms. Sentence-case headings. Expert tone.

## JSON schema

```json
{
  "overview": "2-4 sentences: how server-side anticheats view this packet.",
  "checks": [
    {
      "name": "Reach / KillAura",
      "found_in": ["GrimAnticheat-Grim", "Updated-NoCheatPlus-NoCheatPlus"],
      "purpose": "What the check achieves.",
      "how_it_works": "Mechanism: data collection, math, flags.",
      "detects": "Which cheats/behaviors it catches.",
      "detailed_code": "// ===== FILE: GrimAnticheat-Grim — src/main/java/ac/grim/.../Reach.java =====\n<full verbatim file>\n// NOTE (AI): ...",
      "code_source": "GrimAnticheat-Grim — src/main/java/ac/grim/.../Reach.java",
      "variations": "How other anticheats in found_in implement the same check."
    }
  ]
}
```

- `checks`: 2-5 entries for rich packets (C03, C02, C0F, S08, S12, C07, C08,
  C0B, C0A...), 0-2 for thin ones. Every entry's found_in must trace to
  data/ac-mined/_index.json.
- Prefer checks with full source files available; Kotlin (Grim, Kauri, Shard,
  Intave) and Java are both fine, Skript (.sk) too.
