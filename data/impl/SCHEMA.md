# data/impl/ — Writeup & Implementation Schema

Each file `data/impl/<PacketId>.json` holds the ADVANCED writeup + real mined
implementation data for one packet. It is merged into `data/packets/<id>.json`
by `scripts/merge-impl.js` and rendered by `scripts/generate-pages.js`.

## Ground truth rules (MANDATORY)

1. Every module, code snippet, and client attribution MUST come from the mined
   corpus: `data/mined/<PacketId>.txt` (grep of the 8 reference clients) and the
   real source files under `references/mc-client-sources/sources/`.
2. The 8 reference clients are: Memeware 7.3, Nekoware v1 private, Rise 5.99,
   Rise 6.2.4, Rise 6.1.30, Sigma 4.11, Spicy, Tenacity 6.0.
   `found_in` MUST contain ONLY these client names, and ONLY clients whose
   corpus actually contains the module file for this packet.
3. `detailed_code` MUST be the FULL Java file, cat'd verbatim from the cited
   source (every line, no trimming). Format:

   ```java
   // ===== FILE: Rise 5.99 — dev/rise/module/impl/other/PingSpoof.java =====
   <entire file, verbatim, exactly as cat prints it>
   // NOTE (AI): ...analysis comments go AFTER the full code, never inside...
   ```

   Generate the block with `python3 scripts/make-code-block.py "Client Name" "path/File.java"`
   so the wrapper is consistent. AI comments are appended after the verbatim
   block, prefixed with `// NOTE`. Never fabricate, clean, or truncate the code.
   `code_source` cites `Client — path/File.java`.
4. If a packet has zero module hits in the corpus, say so honestly in the
   writeup and explain WHY (protocol role makes it invisible to modules).
   Do NOT invent modules. `modules` may be an empty array.
5. Vanilla handling facts (NetHandlerPlayServer.processX, NetHandlerPlayClient
   handler) come from the bundled `net/minecraft/` sources in the corpus.

## Anti-slop style

- Zero em dashes, zero emoji, zero "delve/unveil/harness" AI-isms.
- Sentence-case headings. Direct, dense, expert tone. Assume the reader knows
  1.8.9 networking and packet IDs.
- Every claim that names a client or module must trace to the corpus.

## JSON schema

```json
{
  "writeup": [
    { "h": "Role in the protocol", "p": "2-4 sentences + wire/state context." },
    { "h": "Vanilla handling", "p": "What NetHandlerPlayServer/Client does. May contain fenced ```java code." },
    { "h": "Why clients touch it", "p": "Module landscape over the 8 clients." },
    { "h": "Exploit surface", "p": "Timing/state abuses, what anti-cheats watch." }
  ],
  "overview": "1-3 sentence strategic overview shown above the module list.",
  "server_handling": "Prose: exact server-side processing, validation, rate limits. May use ```java fences.",
  "protocol_notes": "Prose: wire encoding quirks, ordering constraints, protocol-state rules.",
  "anticheat_landscape": "Prose: which anti-cheats flag abuse of this packet, what they measure, bypass trade-offs.",
  "modules": [
    {
      "name": "ModuleName",
      "found_in": ["Rise 5.99", "Sigma 4.11"],
      "purpose": "What the module achieves with this packet.",
      "how_it_works": "Mechanism: event hook, timing, conditions.",
      "detailed_code": "REAL verbatim code from one representative client, with a leading comment naming it.",
      "code_source": "Rise 5.99 — dev/rise/module/impl/other/PingSpoof.java",
      "vanilla_hook": "The event/hook surface it uses (PacketSendEvent, PacketReceiveEvent, onTick...).",
      "anti_cheat_notes": "Detection risk and why it does/does not flag.",
      "variations": "How other clients in found_in implement it differently."
    }
  ],
  "general_hooks": "Shared event-hook pattern across clients (may be omitted).",
  "client_variations": "Cross-client API differences: sendQueue vs sendPacketNoEvent vs packet abstraction.",
  "related": ["C03PacketPlayer", "S00PacketKeepAlive"]
}
```

`writeup` sections: aim for 3-5 sections, each 60-150 words. Dense, specific,
packed with real detail. This is the "super advanced" part — go deeper than the
field tables: think timing, order, state machines, server math, anti-cheat
heuristics, per-client API differences.

`modules`: include EVERY distinct module that appears in the corpus for the
packet, grouped when a client has many near-identical variants (e.g. Rise 6.x
disabler suite). 2-6 module entries is typical. Every entry's found_in must
match corpus reality (see _index.json).
