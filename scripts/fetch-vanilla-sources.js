#!/usr/bin/env node
// scripts/fetch-vanilla-sources.js
// Fetches the FULL vanilla MCP 1.8.9 source of every packet class DIRECTLY
// from the Marcelektro/MavenMCP-1.8.9 GitHub repo (raw URLs), verifies each
// exists, and caches the code to data/vanilla/<id>.java for offline builds.
//
// Usage:
//   node scripts/fetch-vanilla-sources.js          # fetch all, verify, cache
//   node scripts/fetch-vanilla-sources.js --check  # only verify existence
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const PACKETS_DIR = path.join(BASE, 'data', 'packets');
const OUT_DIR = path.join(BASE, 'data', 'vanilla');
const RAW = 'https://raw.githubusercontent.com/Marcelektro/MavenMCP-1.8.9/master/src/main/java';
const BLOB = 'https://github.com/Marcelektro/MavenMCP-1.8.9/blob/master/src/main/java';

// Protocol state + direction -> MCP package path
const STATE_DIR = {
  'HANDSHAKING|SERVERBOUND': 'handshake/client',
  'LOGIN|SERVERBOUND': 'login/client',
  'LOGIN|CLIENTBOUND': 'login/server',
  'STATUS|SERVERBOUND': 'status/client',
  'STATUS|CLIENTBOUND': 'status/server',
  'PLAY|SERVERBOUND': 'play/client',
  'PLAY|CLIENTBOUND': 'play/server'
};

function mcpPath(pkt) {
  const dir = STATE_DIR[pkt.state + '|' + pkt.dir];
  if (!dir) return null;
  return 'net/minecraft/network/' + dir + '/' + pkt.id + '.java';
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = fs.readdirSync(PACKETS_DIR).filter(f => f.endsWith('.json'));
  const packets = files.map(f => JSON.parse(fs.readFileSync(path.join(PACKETS_DIR, f), 'utf8')));
  const index = {};

  let ok = 0, fail = 0;
  const failures = [];

  for (const pkt of packets) {
    const rel = mcpPath(pkt);
    if (!rel) { failures.push(pkt.id + ': no state/dir mapping'); fail++; continue; }
    const rawUrl = RAW + '/' + rel;
    const blobUrl = BLOB + '/' + rel;
    try {
      const res = await fetch(rawUrl, { redirect: 'follow' });
      if (!res.ok) {
        failures.push(pkt.id + ': HTTP ' + res.status + ' ' + rawUrl);
        fail++;
        continue;
      }
      const code = await res.text();
      if (!checkOnly) {
        fs.writeFileSync(path.join(OUT_DIR, pkt.id + '.java'), code);
      }
      index[pkt.id] = { rel, raw: rawUrl, blob: blobUrl, bytes: Buffer.byteLength(code, 'utf8') };
      ok++;
    } catch (e) {
      failures.push(pkt.id + ': ' + e.message);
      fail++;
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, '_index.json'), JSON.stringify(index, null, 2));
  console.log('vanilla sources: ' + ok + ' ok, ' + fail + ' failed' + (checkOnly ? ' (check only)' : ' (fetched to data/vanilla/)'));
  if (failures.length) {
    console.log('FAILURES:');
    failures.forEach(f => console.log('  ' + f));
    process.exit(1);
  }
}

main();
