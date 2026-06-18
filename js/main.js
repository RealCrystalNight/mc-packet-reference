(function() {
"use strict";

// PACKET DATA — loaded from js/packet-data.js (auto-generated)
// Edit JSONs in data/packets/ then run: node scripts/build.js
// ============================================================

var state = {
  activeTag: null,
  searchTerm: '',
  dirFilter: '',
  stateFilter: '',
  selectedPacket: null,
  implEnabled: true
};

// ============================================================
// GROUP PACKETS
// ============================================================
const groups = [
  { id: 'handshake', label: 'Handshaking', state: 'HANDSHAKING', color: '#eab308' },
  { id: 'login-sb', label: 'Login → Server', state: 'LOGIN', dir: 'SERVERBOUND', color: '#22c55e' },
  { id: 'login-cb', label: 'Login → Client', state: 'LOGIN', dir: 'CLIENTBOUND', color: '#a855f7' },
  { id: 'status-sb', label: 'Status → Server', state: 'STATUS', dir: 'SERVERBOUND', color: '#22c55e' },
  { id: 'status-cb', label: 'Status → Client', state: 'STATUS', dir: 'CLIENTBOUND', color: '#a855f7' },
  { id: 'play-sb', label: 'Play → Server', state: 'PLAY', dir: 'SERVERBOUND', color: '#22c55e' },
  { id: 'play-cb', label: 'Play → Client', state: 'PLAY', dir: 'CLIENTBOUND', color: '#a855f7' }
];

function getGroupPackets(group) {
  return PACKETS.filter(p => {
    if (p.state !== group.state) return false;
    if (group.dir && p.dir !== group.dir) return false;
    return true;
  });
}

// ============================================================
// BUILD SIDEBAR
// ============================================================
function buildSidebarNav(visiblePackets) {
  const nav = document.getElementById('sidebarNav');
  let html = '';

  groups.forEach(group => {
    const pkts = getGroupPackets(group);
    const filtered = visiblePackets ? pkts.filter(p => visiblePackets.includes(p)) : pkts;
    if (filtered.length === 0) return;

    html += `<div class="nav-section">`;
    html += `<div class="nav-section-header" data-group="${group.id}">`;
    html += `<svg class="chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>`;
    html += `<span>${group.label}</span>`;
    html += `<span class="count">${filtered.length}</span>`;
    html += `</div>`;
    html += `<div class="nav-items">`;

    filtered.forEach(p => {
      const prefix = p.id.substring(0, 3);
      const dirClass = p.dir === 'SERVERBOUND' ? 'sb' : 'cb';
      const dirLabel = p.dir === 'SERVERBOUND' ? 'SB' : 'CB';
      const active = state.selectedPacket && state.selectedPacket.id === p.id ? ' active' : '';
      html += `<div class="nav-item${active}" data-pid="${p.id}">`;
      html += `<span class="nav-hex">${prefix}</span>`;
      html += `<span class="nav-name">${p.name}</span>`;
      html += `<span class="nav-dir ${dirClass}">${dirLabel}</span>`;
      html += `</div>`;
    });

    html += `</div></div>`;
  });

  if (!html) {
    html = '<div class="no-results"><h3>No packets found</h3></div>';
  }

  nav.innerHTML = html;

  nav.querySelectorAll('.nav-section-header').forEach(function(header) {
    header.addEventListener('click', function() {
      header.classList.toggle('collapsed');
      header.nextElementSibling.classList.toggle('collapsed');
    });
  });

  nav.querySelectorAll('.nav-item').forEach(function(item) {
    item.addEventListener('click', function() {
      selectPacket(item.dataset.pid);
    });
  });
}

// ============================================================
// SEARCH — comprehensive across all packet fields
// ============================================================
function searchPackets(term) {
  if (!term.trim()) return PACKETS.slice();

  var t = term.toLowerCase().trim();
  return PACKETS.filter(function(p) {
    var searchable = [
      p.id.toLowerCase(),
      p.name.toLowerCase(),
      p.desc.toLowerCase(),
      p.hex.toLowerCase(),
      String(p.dec),
      p.state.toLowerCase(),
      p.dir.toLowerCase(),
      (p.notes || '').toLowerCase(),
      (p.handler || '').toLowerCase()
    ];
    (p.tags || []).forEach(function(x) { searchable.push(x); });
    (p.mcp || []).forEach(function(m) { searchable.push(m.toLowerCase()); });
    (p.fields || []).forEach(function(f) {
      searchable.push(f.name.toLowerCase(), f.type.toLowerCase(), f.desc.toLowerCase());
    });
    (p.encoding || []).forEach(function(e) {
      searchable.push(String(e[0]).toLowerCase(), String(e[1]).toLowerCase(), (e[2]||'').toLowerCase());
    });
    (p.subclasses || []).forEach(function(s) {
      searchable.push(s.name.toLowerCase(), s.desc.toLowerCase());
    });

    for (var i = 0; i < searchable.length; i++) {
      if (searchable[i].indexOf(t) !== -1) return true;
    }
    return false;
  });
}

function applyFilters() {
  var result = searchPackets(state.searchTerm);

  if (state.dirFilter) {
    result = result.filter(function(p) { return p.dir === state.dirFilter; });
  }
  if (state.stateFilter) {
    result = result.filter(function(p) { return p.state === state.stateFilter; });
  }
  if (state.activeTag) {
    result = result.filter(function(p) { return (p.tags || []).indexOf(state.activeTag) !== -1; });
  }

  return result;
}

function refresh() {
  var visible = applyFilters();
  buildSidebarNav(visible);
  buildOverviewSections(visible);
  buildOverviewStats(visible);
  updateFilterButton();
}

// ============================================================
// FILTER PANEL (dropdown)
// ============================================================
function getAllTags() {
  var tagSet = {};
  PACKETS.forEach(function(p) {
    (p.tags || []).forEach(function(t) { tagSet[t] = true; });
  });
  return Object.keys(tagSet).sort();
}

function buildFilterTagGrid() {
  var grid = document.getElementById('filterTagGrid');
  if (!grid) return;
  var tags = getAllTags();
  grid.innerHTML = tags.map(function(t) {
    var active = state.activeTag === t ? ' active' : '';
    return '<span class="filter-tag-chip' + active + '" data-tag="' + t + '">' + t + '</span>';
  }).join('');

  grid.querySelectorAll('.filter-tag-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      var tag = this.dataset.tag;
      if (state.activeTag === tag) {
        state.activeTag = null;
      } else {
        state.activeTag = tag;
      }
      refresh();
      buildFilterTagGrid();
    });
  });
}

function updateFilterButton() {
  var btn = document.getElementById('filterBtn');
  var count = document.getElementById('filterCount');
  var n = 0;
  if (state.dirFilter) n++;
  if (state.stateFilter) n++;
  if (state.activeTag) n++;

  if (n > 0) {
    btn.classList.add('has-filters');
    count.style.display = 'inline';
    count.textContent = n;
  } else {
    btn.classList.remove('has-filters');
    count.style.display = 'none';
  }
}

function clearAllFilters() {
  state.activeTag = null;
  state.dirFilter = '';
  state.stateFilter = '';
  var dropdown = document.getElementById('filterDropdown');
  // Reset radio buttons
  document.querySelectorAll('input[name="dirFilter"]').forEach(function(r) { r.checked = false; });
  document.querySelectorAll('input[name="stateFilter"]').forEach(function(r) { r.checked = false; });
  // Reset dir/state filter values
  document.querySelector('input[name="dirFilter"][value=""]').checked = true;
  document.querySelector('input[name="stateFilter"][value=""]').checked = true;
  refresh();
  buildFilterTagGrid();
}

// ============================================================
// OVERVIEW
// ============================================================
function buildOverviewStats(filtered) {
  var el = document.getElementById('overviewStats');
  if (!el) return;
  var total = filtered.length;
  var sb = 0, cb = 0;
  filtered.forEach(function(p) {
    if (p.dir === 'SERVERBOUND') sb++; else cb++;
  });
  el.innerHTML =
    '<div class="stat-card"><div class="stat-num">' + total + '</div><div class="stat-label">Packets</div></div>' +
    '<div class="stat-card"><div class="stat-num" style="color:#22c55e">' + sb + '</div><div class="stat-label">Serverbound</div></div>' +
    '<div class="stat-card"><div class="stat-num" style="color:#a855f7">' + cb + '</div><div class="stat-label">Clientbound</div></div>';
}

function buildOverviewSections(filtered) {
  var el = document.getElementById('overviewSections');
  if (!el) return;
  var html = '';
  groups.forEach(function(group) {
    var pkts = filtered.filter(function(p) {
      if (p.state !== group.state) return false;
      if (group.dir && p.dir !== group.dir) return false;
      return true;
    });
    if (pkts.length === 0) return;

    html += '<div class="overview-section">';
    html += '<h2>' + group.label + ' <span style="font-size:0.7rem;color:var(--text-muted);font-weight:400">' + pkts.length + ' packets</span></h2>';
    html += '<div class="section-packet-list">';
    pkts.forEach(function(p) {
      var prefix = p.id.substring(0, 3);
      html += '<div class="section-packet-row" data-pid="' + p.id + '">';
      html += '<span class="row-hex">' + prefix + '</span>';
      html += '<span class="row-name">' + p.name + '</span>';
      html += '<span class="row-desc">' + p.desc + '</span>';
      html += '</div>';
    });
    html += '</div></div>';
  });
  el.innerHTML = html;

  el.querySelectorAll('.section-packet-row').forEach(function(row) {
    row.addEventListener('click', function() { selectPacket(row.dataset.pid); });
  });
}

// ============================================================
// PACKET SELECTION & DETAIL VIEW
// ============================================================
function selectPacket(pid) {
  var p = PACKETS.find(function(x) { return x.id === pid; });
  if (!p) return;

  state.selectedPacket = p;
  document.getElementById('overviewPanel').style.display = 'none';
  document.getElementById('detailPanel').style.display = 'block';
  document.getElementById('main').scrollTop = 0;

  renderDetail(p);
  refresh();
  updateHash();
  updateSeo(p);
}

function showOverview() {
  state.selectedPacket = null;
  document.getElementById('detailPanel').style.display = 'none';
  document.getElementById('overviewPanel').style.display = 'block';
  document.getElementById('main').scrollTop = 0;
  refresh();
  updateHash();
  updateSeo(null);
}

function renderDetail(p) {
  var dirClass = p.dir === 'SERVERBOUND' ? 'dir-sb' : 'dir-cb';
  var dirLabel = p.dir === 'SERVERBOUND' ? 'Serverbound (Client \u2192 Server)' : 'Clientbound (Server \u2192 Client)';

  var headerHtml = '';
  headerHtml += '<button class="detail-back" onclick="showOverview()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> All packets</button>';
  headerHtml += '<h2><span class="detail-hex">' + p.hex + '</span> ' + p.id + '</h2>';
  headerHtml += '<p class="detail-desc">' + p.desc + '</p>';
  headerHtml += '<div class="detail-meta">';
  headerHtml += '<span class="badge ' + dirClass + '">' + dirLabel + '</span>';
  headerHtml += '<span class="meta-sep">\u00b7</span>';
  headerHtml += '<span class="badge state">' + p.state + '</span>';
  headerHtml += '<span class="meta-sep">\u00b7</span>';
  headerHtml += '<span class="meta-mcp">net/minecraft/network/' + (p.dir === 'SERVERBOUND' ? 'play/client' : p.state.toLowerCase() === 'play' ? 'play/server' : '') + '/' + p.id + '.java</span>';
  headerHtml += '</div>';

  headerHtml += '<a href="/mc-packet-reference/packets/' + p.id + '/" class="detail-permalink" title="Permalink to standalone page" target="_blank"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Permalink</a>';

  if (p.tags && p.tags.length) {
    headerHtml += '<div class="detail-tags">';
    p.tags.forEach(function(t) { headerHtml += '<span class="dtag">' + t + '</span>'; });
    headerHtml += '</div>';
  }
  document.getElementById('detailHeader').innerHTML = headerHtml;

  var bodyHtml = '';

  if (p.fields && p.fields.length) {
    bodyHtml += '<div class="detail-section"><h3>Fields</h3>';
    bodyHtml += '<table class="fields-table"><thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead><tbody>';
    p.fields.forEach(function(f) {
      bodyHtml += '<tr><td class="f-name">' + f.name + '</td><td class="f-type">' + f.type + '</td><td class="f-desc">' + f.desc + '</td></tr>';
    });
    bodyHtml += '</tbody></table></div>';
  }

  if (p.subclasses && p.subclasses.length) {
    bodyHtml += '<div class="detail-section"><h3>Subclasses</h3><div class="subclass-list">';
    p.subclasses.forEach(function(s) {
      bodyHtml += '<div class="subclass-item"><span class="sub-name">' + s.name + '</span><span class="sub-desc">' + s.desc + '</span></div>';
    });
    bodyHtml += '</div></div>';
  }

  if (p.encoding && p.encoding.length) {
    bodyHtml += '<div class="detail-section"><h3>Wire Encoding</h3>';
    bodyHtml += '<table class="encoding-table"><thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead><tbody>';
    p.encoding.forEach(function(e) {
      bodyHtml += '<tr><td class="e-field">' + e[0] + '</td><td class="e-type">' + e[1] + '</td><td class="e-notes">' + (e[2] || '') + '</td></tr>';
    });
    bodyHtml += '</tbody></table></div>';
  }

  if (p.mcp && p.mcp.length) {
    bodyHtml += '<div class="detail-section"><h3>MCP References</h3><div class="mcp-block">';
    p.mcp.forEach(function(m) {
      bodyHtml += '<div class="mcp-row"><span class="mcp-label">MCP</span><code>' + m + '</code></div>';
    });
    bodyHtml += '</div></div>';
  }

  if (p.handler) {
    bodyHtml += '<div class="detail-section"><h3>Handler Interface</h3>';
    bodyHtml += '<div class="mcp-block"><div class="mcp-row"><span class="mcp-label">HND</span><code>' + p.handler + '</code></div></div>';
    bodyHtml += '</div>';
  }

  if (p.notes) {
    bodyHtml += '<div class="detail-section"><h3>Notes</h3><div class="notes-box">' + p.notes + '</div></div>';
  }

  // Implementation cases (experimental)
  if (state.implEnabled && p.implementation) {
    var impl = p.implementation;
    bodyHtml += '<div class="impl-section">';
    bodyHtml += '<h3><span class="impl-badge">implementation</span> Implementation Cases</h3>';

    if (impl.overview) {
      bodyHtml += '<p class="impl-pattern">' + impl.overview + '</p>';
    }

    if (impl.modules && impl.modules.length) {
      impl.modules.forEach(function(m) {
        bodyHtml += '<div class="impl-module-entry">';
        bodyHtml += '<div class="impl-module-header">';
        bodyHtml += '<span class="impl-module-name">' + m.name + '</span>';
        if (m.found_in && m.found_in.length) {
          bodyHtml += '<span class="impl-module-clients">(' + m.found_in.join(', ') + ')</span>';
        }
        bodyHtml += '</div>';
        if (m.purpose) {
          bodyHtml += '<p class="impl-pattern">' + m.purpose + '</p>';
        }
        if (m.how_it_works) {
          bodyHtml += '<p class="impl-pattern" style="font-size:0.8rem;color:var(--text-muted)">' + m.how_it_works + '</p>';
        }
        if (m.detailed_code) {
          bodyHtml += '<div class="impl-code"><code>' + escapeHtml(m.detailed_code) + '</code></div>';
        }
        if (m.vanilla_hook) {
          bodyHtml += '<div class="impl-meta"><span><strong>Vanilla hook:</strong> ' + m.vanilla_hook + '</span></div>';
        }
        if (m.anti_cheat_notes) {
          bodyHtml += '<div class="impl-meta" style="color:var(--orange);margin-top:4px"><span>' + m.anti_cheat_notes + '</span></div>';
        }
        bodyHtml += '</div>';
      });
    }

    if (impl.general_hooks) {
      bodyHtml += '<div class="impl-meta" style="margin-top:8px;white-space:pre-wrap">' + impl.general_hooks + '</div>';
    }
    if (impl.client_variations) {
      bodyHtml += '<div class="impl-clients">' + impl.client_variations + '</div>';
    }

    bodyHtml += '</div>';
  }

  document.getElementById('detailBody').innerHTML = bodyHtml;
}

// ============================================================
// EVENT HANDLERS
// ============================================================
document.getElementById('sidebarSearch').addEventListener('input', function() {
  state.searchTerm = this.value;
  refresh();
});

// Filter button toggle
document.getElementById('filterBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  var dd = document.getElementById('filterDropdown');
  if (dd.style.display === 'none') {
    dd.style.display = 'block';
  } else {
    dd.style.display = 'none';
  }
  buildFilterTagGrid();
});

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  var dd = document.getElementById('filterDropdown');
  var btn = document.getElementById('filterBtn');
  if (dd.style.display === 'block' && !dd.contains(e.target) && e.target !== btn) {
    dd.style.display = 'none';
  }
});

// Direction radio
document.querySelectorAll('input[name="dirFilter"]').forEach(function(r) {
  r.addEventListener('change', function() {
    state.dirFilter = this.value;
    refresh();
  });
});

// State radio
document.querySelectorAll('input[name="stateFilter"]').forEach(function(r) {
  r.addEventListener('change', function() {
    state.stateFilter = this.value;
    refresh();
  });
});

// Clear filters button
document.getElementById('filterClear').addEventListener('click', clearAllFilters);

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  if (e.key === '/' && document.activeElement !== document.getElementById('sidebarSearch')) {
    e.preventDefault();
    document.getElementById('sidebarSearch').focus();
  }
  if (e.key === 'Escape') {
    var dd = document.getElementById('filterDropdown');
    if (dd.style.display === 'block') {
      dd.style.display = 'none';
      return;
    }
    if (state.selectedPacket) {
      showOverview();
    }
  }
});

// ============================================================
// INIT
// ============================================================
function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updateSeo(p) {
  if (p) {
    document.title = p.id + ' — Minecraft 1.8.9 Packet Reference';
    var desc = (p.desc || '').substring(0, 155);
    var el = document.querySelector('meta[name="description"]');
    if (el) el.setAttribute('content', p.id + ': ' + desc);
    var ogt = document.querySelector('meta[property="og:title"]');
    if (ogt) ogt.setAttribute('content', p.id + ' — Minecraft 1.8.9 Packet Reference');
    var ogd = document.querySelector('meta[property="og:description"]');
    if (ogd) ogd.setAttribute('content', p.id + ': ' + desc);
    var twt = document.querySelector('meta[name="twitter:title"]');
    if (twt) twt.setAttribute('content', p.id + ' — MC 1.8.9 Packet Ref');
    var twd = document.querySelector('meta[name="twitter:description"]');
    if (twd) twd.setAttribute('content', p.id + ': ' + desc);
  } else {
    document.title = 'Minecraft 1.8.9 Packet Reference — Complete Network Protocol Docs';
    var desc = 'Complete reference for all 105 Minecraft 1.8.9 network packets with fields, wire encoding, MCP references, and real-world implementation cases.';
    var el = document.querySelector('meta[name="description"]');
    if (el) el.setAttribute('content', desc);
    var ogt = document.querySelector('meta[property="og:title"]');
    if (ogt) ogt.setAttribute('content', 'Minecraft 1.8.9 Packet Reference');
    var ogd = document.querySelector('meta[property="og:description"]');
    if (ogd) ogd.setAttribute('content', desc);
    var twt = document.querySelector('meta[name="twitter:title"]');
    if (twt) twt.setAttribute('content', 'Minecraft 1.8.9 Packet Reference');
    var twd = document.querySelector('meta[name="twitter:description"]');
    if (twd) twd.setAttribute('content', desc);
  }
}

function updateHash() {
  var url = new URL(window.location);
  if (state.selectedPacket) {
    url.hash = state.selectedPacket.id;
  } else {
    url.hash = '';
  }
  window.history.replaceState({}, '', url);
}

function onHashChange() {
  var hash = window.location.hash.replace('#', '');
  if (hash) {
    var p = PACKETS.find(function(x) { return x.id === hash; });
    if (p) { selectPacket(p.id); return; }
  }
  showOverview();
}

function init() {
  window.addEventListener('hashchange', onHashChange);
  buildFilterTagGrid();
  refresh();

  var hash = window.location.hash.replace('#', '');
  if (hash) {
    var p = PACKETS.find(function(x) { return x.id === hash; });
    if (p) {
      selectPacket(p.id);
      return;
    }
  }
  showOverview();
}

init();

window.showOverview = showOverview;
window.selectPacket = selectPacket;

})();
