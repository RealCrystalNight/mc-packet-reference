#!/usr/bin/env node
// scripts/build.js
// Reads data/packets/*.json + data/registry.json → generates js/packet-data.js
//   + js/search-index.js (global home search: packets + classes + analyses + modules)
//
// Usage:
//   node scripts/build.js          # regenerate from individual JSONs
//   node scripts/build.js --init   # first time: extract from main.js → JSONs → packet-data.js
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const DATA = path.join(BASE, 'data');
const PACKETS_DIR = path.join(DATA, 'packets');
const JS_DIR = path.join(BASE, 'js');
const MAIN_JS = path.join(JS_DIR, 'main.js');
const REGISTRY = path.join(DATA, 'registry.json');
const OUT = path.join(JS_DIR, 'packet-data.js');
const SEARCH_OUT = path.join(JS_DIR, 'search-index.js');
const ANALYSIS_DIR = path.join(DATA, 'analysis');
const ANALYSIS_INDEX = path.join(ANALYSIS_DIR, 'index.json');

// Vanilla-internals classes — mirrors LOGIC_CLASSES in scripts/generate-pages.js
// (slug/title/desc only; the full sources live in data/vanilla-logic/).
const LOGIC_CLASSES = [
  { slug: 'EntityPlayerSP', rel: 'net/minecraft/client/entity/EntityPlayerSP.java', title: 'EntityPlayerSP', desc: 'Client player entity: emits C03 movement, C0A swings, C0B actions and C0C input every tick from onUpdateWalkingPlayer.' },
  { slug: 'EntityPlayerMP', rel: 'net/minecraft/entity/player/EntityPlayerMP.java', title: 'EntityPlayerMP', desc: 'Server player entity: health, XP and inventory sync fan out S06, S1F, S2F and S30 packets from onUpdateEntity.' },
  { slug: 'EntityTrackerEntry', rel: 'net/minecraft/entity/EntityTrackerEntry.java', title: 'EntityTrackerEntry', desc: 'Server per-entity tracker: builds spawn packets and pushes S12 velocity, S14 movement and S18 teleports to tracking players.' },
  { slug: 'ServerConfigurationManager', rel: 'net/minecraft/server/management/ServerConfigurationManager.java', title: 'ServerConfigurationManager', desc: 'Login/join orchestrator: fires S01 JoinGame, S38 tab-list, S39 abilities and S41 difficulty during initializeConnectionToPlayer.' },
  { slug: 'NetHandlerPlayServer', rel: 'net/minecraft/network/NetHandlerPlayServer.java', title: 'NetHandlerPlayServer', desc: 'Server play-state net handler: validates every C-packet (processPlayer movement gates, C02 reach, C0E clicks) and sends S08 corrections.' },
  { slug: 'NetHandlerPlayClient', rel: 'net/minecraft/client/network/NetHandlerPlayClient.java', title: 'NetHandlerPlayClient', desc: 'Client play-state net handler: handle<Entity> dispatch for every S-packet plus C00/C03/C0F/C17/C19 replies upstream.' },
  { slug: 'WorldServer', rel: 'net/minecraft/world/WorldServer.java', title: 'WorldServer', desc: 'Server world: broadcasts S24 block actions, S27 explosions, S2A particles and S2C lightning to nearby players.' },
  { slug: 'PlayerControllerMP', rel: 'net/minecraft/client/multiplayer/PlayerControllerMP.java', title: 'PlayerControllerMP', desc: 'Client interaction controller: attackEntity/interact send C02, clickBlock sends C07, windowClick sends C0E, slot sync sends C10.' },
  { slug: 'ServerScoreboard', rel: 'net/minecraft/scoreboard/ServerScoreboard.java', title: 'ServerScoreboard', desc: 'Server scoreboard: objective/team/score mutations broadcast S3B, S3C, S3D and S3E to all players.' },
  { slug: 'NetHandlerLoginServer', rel: 'net/minecraft/server/network/NetHandlerLoginServer.java', title: 'NetHandlerLoginServer', desc: 'Server login state machine (HELLO/KEY/AUTHENTICATING/READY): S01 encryption challenge, S02 success, S03 compression.' },
  { slug: 'WorldManager', rel: 'net/minecraft/world/WorldManager.java', title: 'WorldManager', desc: 'Server world listener: relays S25 break progress, S28 effects and S29 sounds to players near the event.' },
  { slug: 'PlayerManager', rel: 'net/minecraft/server/management/PlayerManager.java', title: 'PlayerManager', desc: 'Chunk watch manager: streams S21 chunk data, S22 multi-block deltas and S26 bulk loads to watching players.' },
  { slug: 'EntityLivingBase', rel: 'net/minecraft/entity/EntityLivingBase.java', title: 'EntityLivingBase', desc: 'Living-entity base: swingItem, potion-effect add/remove and item pickup emit S0B, S1D/S1E and S0D through the tracker.' },
  { slug: 'OldServerPinger', rel: 'net/minecraft/client/network/OldServerPinger.java', title: 'OldServerPinger', desc: 'Server-list prober: C00Handshake(47, STATUS) + C00 query + C01 ping sequence feeding the multiplayer latency readout.' },
  { slug: 'NetHandlerStatusServer', rel: 'net/minecraft/server/network/NetHandlerStatusServer.java', title: 'NetHandlerStatusServer', desc: 'Server status responder: answers C00 query with S00 JSON and C01 ping with S01 echo, then closes the channel.' },
  { slug: 'ItemInWorldManager', rel: 'net/minecraft/server/management/ItemInWorldManager.java', title: 'ItemInWorldManager', desc: 'Survival interaction handler: block break/place and creative resync emit S23 corrections and S38 list updates.' }
];

function main() {
  const arg = process.argv[2];

  if (arg === '--init') {
    initFromMainJs();
    return;
  }

  buildFromJsons();
}

// --init: one-time extraction from main.js
function initFromMainJs() {
  const mainJs = fs.readFileSync(MAIN_JS, 'utf8');
  const packets = parsePacketsFromJs(mainJs);
  console.log(`Extracted ${packets.length} packets from main.js`);

  fs.mkdirSync(PACKETS_DIR, { recursive: true });

  // Write individual JSONs
  const registry = [];
  for (const p of packets) {
    const fname = p.id + '.json';
    fs.writeFileSync(path.join(PACKETS_DIR, fname), JSON.stringify(p, null, 2));
    registry.push({
      id: p.id, hex: p.hex, dec: p.dec, dir: p.dir,
      state: p.state, name: p.name, desc: p.desc,
      tags: p.tags || [], file: fname
    });
  }
  fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2));
  console.log(`Wrote ${packets.length} JSONs → data/packets/`);
  console.log(`Wrote data/registry.json`);

  // Also build the JS output
  writePacketDataJs(packets);
  writeSearchIndexJs(packets);
}

// Default: rebuild from data/packets/*.json
function buildFromJsons() {
  const files = fs.readdirSync(PACKETS_DIR).filter(f => f.endsWith('.json'));
  const packets = [];

  for (const f of files) {
    const raw = fs.readFileSync(path.join(PACKETS_DIR, f), 'utf8');
    packets.push(JSON.parse(raw));
  }

  // Sort by state order, then by hex ID
  const stateOrder = { HANDSHAKING: 0, LOGIN: 1, STATUS: 2, PLAY: 3 };
  packets.sort((a, b) => {
    if (a.state !== b.state) return stateOrder[a.state] - stateOrder[b.state];
    if (a.dir !== b.dir) return a.dir === 'SERVERBOUND' ? -1 : 1;
    return a.dec - b.dec;
  });

  console.log(`Loaded ${packets.length} packets from data/packets/`);

  // Regenerate registry
  const registry = packets.map(p => ({
    id: p.id, hex: p.hex, dec: p.dec, dir: p.dir,
    state: p.state, name: p.name, desc: p.desc,
    tags: p.tags || [], file: p.id + '.json'
  }));
  fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2));
  console.log(`Regenerated data/registry.json`);

  writePacketDataJs(packets);
  writeSearchIndexJs(packets);
}

function writePacketDataJs(packets) {
  // Strip implementation/writeup payloads from the search bundle — the static
  // packet pages carry the full content; packet-data.js only powers search.
  // Module NAMES are kept (not code) for keyword search + count chips.
  const lean = packets.map(p => {
    const copy = Object.assign({}, p);
    if (copy.implementation) {
      copy.modules = (copy.implementation.modules || []).map(m => m.name);
      copy.moduleCount = (copy.implementation.modules || []).length;
    }
    delete copy.implementation;
    return copy;
  });
  const json = JSON.stringify(lean);
  const out = [
    '// AUTO-GENERATED by scripts/build.js — DO NOT EDIT',
    '// Source: data/packets/*.json (implementation stripped — pages carry it)',
    '// Run `node scripts/build.js` to regenerate',
    '',
    'const PACKETS = ' + json + ';',
    ''
  ].join('\n');
  fs.writeFileSync(OUT, out);
  console.log(`Generated js/packet-data.js (${Buffer.byteLength(out, 'utf8')} bytes, ${packets.length} packets)`);
}

// Global home-search index: packets + vanilla-internals classes + module
// analyses + cheat modules. Shape:
//   const SEARCH_INDEX = { packets:[...], classes:[...], analyses:[...], modules:[...] }
// each entry {type,title,url,desc,keywords}. Packet search in js/main.js is
// untouched (still uses PACKETS/_search); this only ADDS new result groups.
function writeSearchIndexJs(packets) {
  // --- packets (from data/packets/*.json) ---
  const pktEntries = packets.map(function(p) {
    var modNames = [];
    if (p.implementation && p.implementation.modules) {
      modNames = p.implementation.modules.map(function(m) { return m.name; });
    } else if (p.modules) {
      modNames = p.modules.map(function(m) { return typeof m === 'string' ? m : m.name; });
    }
    return {
      type: 'packet',
      title: p.id + ' — ' + p.name,
      url: 'packets/' + p.id + '/',
      desc: p.desc || '',
      keywords: [p.id, p.name, p.hex, String(p.dec), p.state, p.dir, (p.tags || []).join(' '), modNames.join(' ')].join(' ')
    };
  });

  // --- vanilla-internals classes (16 slugs, desc from LOGIC_CLASSES) ---
  const classEntries = LOGIC_CLASSES.map(function(e) {
    return {
      type: 'class',
      title: e.title,
      url: 'classes/' + e.slug + '/',
      desc: e.desc,
      keywords: [e.slug, e.title, e.rel, e.desc].join(' ')
    };
  });

  // --- module analyses (data/analysis/index.json + per-analysis JSONs) ---
  var analysisEntries = [];
  try {
    const idx = JSON.parse(fs.readFileSync(ANALYSIS_INDEX, 'utf8'));
    (idx.analyses || []).forEach(function(slug) {
      try {
        const a = JSON.parse(fs.readFileSync(path.join(ANALYSIS_DIR, slug + '.json'), 'utf8'));
        analysisEntries.push({
          type: 'analysis',
          title: (a.module || slug) + ' — ' + (a.client || ''),
          url: 'analysis/' + a.category + '/' + slug + '.html',
          desc: String(a.overview || '').substring(0, 300),
          keywords: [slug, a.module, a.client, a.category, (a.packets || []).join(' ')].join(' ')
        });
      } catch (e) { /* skip unreadable analysis JSON */ }
    });
  } catch (e) { /* no analyses yet */ }

  // --- cheat modules (aggregated from packet implementation data) ---
  const modMap = {};
  packets.forEach(function(p) {
    var mods = (p.implementation && p.implementation.modules) || [];
    mods.forEach(function(m) {
      (modMap[m.name] = modMap[m.name] || []).push({ id: p.id, clients: m.found_in || [] });
    });
  });
  const moduleEntries = Object.keys(modMap).sort().map(function(mn) {
    const hits = modMap[mn];
    const clientSet = {};
    hits.forEach(function(h) { h.clients.forEach(function(c) { clientSet[c] = true; }); });
    const clients = Object.keys(clientSet).sort();
    const ids = hits.map(function(h) { return h.id; });
    return {
      type: 'module',
      title: mn,
      url: 'modules/',
      desc: 'Used in ' + hits.length + (hits.length === 1 ? ' packet: ' : ' packets: ') + ids.join(', ') + (clients.length ? ' (' + clients.join(', ') + ')' : ''),
      keywords: [mn, ids.join(' '), clients.join(' ')].join(' ')
    };
  });

  const index = { packets: pktEntries, classes: classEntries, analyses: analysisEntries, modules: moduleEntries };
  const out = [
    '// AUTO-GENERATED by scripts/build.js — DO NOT EDIT',
    '// Global home-search index (packets + vanilla-internals + analyses + modules)',
    '// Sources: data/packets/*.json, data/vanilla-logic (16 slugs), data/analysis/*.json, packet implementation modules',
    '// Run `node scripts/build.js` to regenerate',
    '',
    'const SEARCH_INDEX = ' + JSON.stringify(index) + ';',
    ''
  ].join('\n');
  fs.writeFileSync(SEARCH_OUT, out);
  console.log(`Generated js/search-index.js (${Buffer.byteLength(out, 'utf8')} bytes: ${pktEntries.length} packets, ${classEntries.length} classes, ${analysisEntries.length} analyses, ${moduleEntries.length} modules)`);
}

function parsePacketsFromJs(src) {
  const start = src.indexOf('const PACKETS = [');
  if (start === -1) throw new Error('PACKETS array not found in main.js — already migrated?');

  let depth = 0;
  let i = start + 'const PACKETS = ['.length - 1;
  for (; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) break; }
  }
  const arraySrc = src.substring(start + 'const PACKETS ='.length, i + 1);
  return eval(arraySrc);
}

main();
