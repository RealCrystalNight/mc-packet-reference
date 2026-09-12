'use strict';
// scripts/graph-lib.js
// Loads a graphify graph.json and collapses it to a CLASS-LEVEL graph:
// one node per .java file, edges aggregated from the symbol-level edges
// (calls/imports/inherits/references/...). Both the class pages (neighbour
// lists) and the graph hub use this so they never disagree.
//
// Usage: const gg = loadClassGraph('/path/to/graph.json');

const fs = require('fs');
const path = require('path');

function basenameNoExt(f) { return path.basename(String(f)).replace(/\.java$/, ''); }

function loadClassGraph(graphJsonPath) {
  if (!graphJsonPath || !fs.existsSync(graphJsonPath)) return null;
  let g;
  try { g = JSON.parse(fs.readFileSync(graphJsonPath, 'utf8')); }
  catch (e) { return null; }
  const nodes = g.nodes || [];
  const links = g.links || g.edges || [];

  const byId = {};
  nodes.forEach(function(n) { byId[n.id] = n; });

  // Pick the best "class node" for each .java file: prefer a _callable_class
  // whose label matches the file's basename, else any _callable_class, else
  // the first node declared in the file.
  const fileClass = {};
  const fileRank = {};
  nodes.forEach(function(n) {
    const f = n.source_file;
    if (!f || !/\.java$/.test(f)) return;
    const isMatch = !!n._callable_class && n.label === basenameNoExt(f);
    const rank = isMatch ? 2 : (n._callable_class ? 1 : 0);
    if (!(f in fileClass) || rank > fileRank[f]) {
      fileClass[f] = { id: n.id, label: n.label, community: n.community };
      fileRank[f] = rank;
    }
  });

  const files = Object.keys(fileClass).sort();
  const fileSet = {};
  files.forEach(function(f) {
    fileSet[f] = { file: f, label: fileClass[f].label, community: fileClass[f].community, degree: 0 };
  });

  // Aggregate symbol edges to file<->file with relation counts.
  const pair = {};
  const relationCounts = {};
  links.forEach(function(e) {
    const a = byId[e.source], b = byId[e.target];
    if (!a || !b) return;
    const fa = a.source_file, fb = b.source_file;
    if (!fa || !fb || !fileSet[fa] || !fileSet[fb] || fa === fb) return;
    const rel = e.relation || 'references';
    relationCounts[rel] = (relationCounts[rel] || 0) + 1;
    const key = fa + '\u0000' + fb + '\u0000' + rel;
    pair[key] = (pair[key] || 0) + 1;
  });

  const edges = [];
  const neighbours = {}; // file -> { file -> Set(relation) }
  Object.keys(pair).forEach(function(k) {
    const p = k.split('\u0000');
    edges.push({ source: p[0], target: p[1], relation: p[2], weight: pair[k] });
  });
  edges.forEach(function(e) {
    (neighbours[e.source] = neighbours[e.source] || {});
    (neighbours[e.source][e.target] = neighbours[e.source][e.target] || new Set()).add(e.relation);
  });

  files.forEach(function(f) { fileSet[f].degree = Object.keys(neighbours[f] || {}).length; });

  // Communities: group files by their class node's community id.
  const communities = {};
  files.forEach(function(f) {
    const c = fileClass[f].community;
    if (c === undefined || c === null) return;
    (communities[c] = communities[c] || []).push(f);
  });

  const godNodes = files.slice().sort(function(a, b) {
    return fileSet[b].degree - fileSet[a].degree || a.localeCompare(b);
  });

  return {
    generatedFrom: graphJsonPath,
    counts: { files: files.length, rawNodes: nodes.length, rawEdges: links.length, communities: Object.keys(communities).length },
    relationCounts: relationCounts,
    allFiles: files,
    byFile: fileSet,
    edges: edges,
    communities: communities,
    godNodes: godNodes,
    neighbours: neighbours,
    classNodeId: (function() { const m = {}; files.forEach(function(f) { m[f] = fileClass[f].id; }); return m; })()
  };
}

// Human-friendly community label: most common package prefix among members.
function communityLabel(files) {
  const counts = {};
  files.forEach(function(f) {
    const parts = f.split('/');
    const pkg = parts.slice(0, Math.min(parts.length - 1, 4)).join('.');
    counts[pkg] = (counts[pkg] || 0) + 1;
  });
  let best = '', n = -1;
  Object.keys(counts).forEach(function(k) { if (counts[k] > n) { n = counts[k]; best = k; } });
  return best;
}

// Dependency neighbours of one file, grouped by relation.
function neighboursOf(gg, file) {
  if (!gg || !gg.neighbours || !gg.neighbours[file]) return [];
  const out = [];
  Object.keys(gg.neighbours[file]).forEach(function(target) {
    out.push({ file: target, label: (gg.byFile[target] || {}).label || target, relations: Array.from(gg.neighbours[file][target]) });
  });
  return out.sort(function(a, b) { return a.label.localeCompare(b.label); });
}

module.exports = { loadClassGraph: loadClassGraph, communityLabel: communityLabel, neighboursOf: neighboursOf, basenameNoExt: basenameNoExt };
