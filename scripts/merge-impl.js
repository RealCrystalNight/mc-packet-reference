#!/usr/bin/env node
// scripts/merge-impl.js
// Merges data/impl/<packet>.json (advanced writeups + real mined implementations)
// into data/packets/<packet>.json as the `implementation` field.
//
// Usage:
//   node scripts/merge-impl.js            # merge ALL packets that have impl data
//   node scripts/merge-impl.js C02PacketUseEntity   # single packet
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const PACKETS_DIR = path.join(BASE, 'data', 'packets');
const IMPL_DIR = path.join(BASE, 'data', 'impl');
const AC_DIR = path.join(BASE, 'data', 'ac');

function main() {
  const targets = process.argv.slice(2);
  const implFiles = targets.length
    ? targets.map(t => t + '.json').filter(f => fs.existsSync(path.join(IMPL_DIR, f)))
    : fs.readdirSync(IMPL_DIR).filter(f => f.endsWith('.json'));

  let merged = 0;
  let missing = 0;

  for (const f of implFiles) {
    const pktId = f.slice(0, -5);
    const pktPath = path.join(PACKETS_DIR, pktId + '.json');
    if (!fs.existsSync(pktPath)) { console.error('SKIP (no packet json): ' + pktId); missing++; continue; }

    const pkt = JSON.parse(fs.readFileSync(pktPath, 'utf8'));
    const impl = JSON.parse(fs.readFileSync(path.join(IMPL_DIR, f), 'utf8'));

    // Schema guard: only accept known keys so garbage can't sneak in.
    const ALLOWED = new Set([
      'writeup', 'overview', 'server_handling', 'protocol_notes',
      'anticheat_landscape', 'modules', 'general_hooks',
      'client_variations', 'related'
    ]);
    for (const k of Object.keys(impl)) {
      if (!ALLOWED.has(k)) { console.error('DROPPED unknown key "' + k + '" in ' + pktId); delete impl[k]; }
    }
    if (impl.modules && !Array.isArray(impl.modules)) {
      console.error('DROPPED non-array modules in ' + pktId); delete impl.modules;
    }

    // Anti-cheat data (data/ac/<id>.json) -> implementation.anticheat
    const acPath = path.join(AC_DIR, pktId + '.json');
    if (fs.existsSync(acPath)) {
      const ac = JSON.parse(fs.readFileSync(acPath, 'utf8'));
      const AC_ALLOWED = new Set(['overview', 'checks']);
      for (const k of Object.keys(ac)) {
        if (!AC_ALLOWED.has(k)) { console.error('DROPPED unknown ac key "' + k + '" in ' + pktId); delete ac[k]; }
      }
      if (ac.checks && !Array.isArray(ac.checks)) {
        console.error('DROPPED non-array ac checks in ' + pktId); delete ac.checks;
      }
      impl.anticheat = ac;
    }

    pkt.implementation = impl;
    fs.writeFileSync(pktPath, JSON.stringify(pkt, null, 2));
    merged++;
  }

  console.log(`Merged implementation data into ${merged} packet JSONs${missing ? ` (${missing} missing packet files)` : ''}`);
}

main();
