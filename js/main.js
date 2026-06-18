(function() {
"use strict";

// PACKET DATA — loaded from js/packet-data.js (auto-generated)
// Edit JSONs in data/packets/ then run: node scripts/build.js
// ============================================================

var state = {
  activeTag: null,
  searchTerm: '',
  dirFilter: '',
  stateFilter: ''
};

function debounce(fn, wait) {
  var timer;
  return function() {
    var ctx = this, args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function() { fn.apply(ctx, args); }, wait || 120);
  };
}

function initSearchData(packets) {
  packets.forEach(function(p) {
    var parts = [
      p.id || '', p.name || '', p.desc || '',
      p.hex || '', String(p.dec || ''),
      p.state || '', p.dir || '',
      (p.notes || '').toLowerCase(), (p.handler || '').toLowerCase()
    ];
    (p.tags || []).forEach(function(t) { parts.push(t); });
    (p.mcp || []).forEach(function(m) { parts.push(m.toLowerCase()); });
    (p.fields || []).forEach(function(f) {
      parts.push((f.name || '').toLowerCase(), (f.type || '').toLowerCase(), (f.desc || '').toLowerCase());
    });
    (p.encoding || []).forEach(function(e) {
      parts.push(String(e[0] || '').toLowerCase(), String(e[1] || '').toLowerCase(), (e[2] || '').toLowerCase());
    });
    (p.subclasses || []).forEach(function(s) {
      parts.push((s.name || '').toLowerCase(), (s.desc || '').toLowerCase());
    });
    p._search = parts.join(' ').toLowerCase();
  });
}

// ============================================================
// GROUP PACKETS
// ============================================================
var groups = [
  { id: 'handshake', label: 'Handshaking', state: 'HANDSHAKING', dir: 'SERVERBOUND', color: '#eab308' },
  { id: 'login-sb', label: 'Login → Server', state: 'LOGIN', dir: 'SERVERBOUND', color: '#22c55e' },
  { id: 'login-cb', label: 'Login → Client', state: 'LOGIN', dir: 'CLIENTBOUND', color: '#a855f7' },
  { id: 'status-sb', label: 'Status → Server', state: 'STATUS', dir: 'SERVERBOUND', color: '#22c55e' },
  { id: 'status-cb', label: 'Status → Client', state: 'STATUS', dir: 'CLIENTBOUND', color: '#a855f7' },
  { id: 'play-sb', label: 'Play → Server', state: 'PLAY', dir: 'SERVERBOUND', color: '#22c55e' },
  { id: 'play-cb', label: 'Play → Client', state: 'PLAY', dir: 'CLIENTBOUND', color: '#a855f7' }
];

function getGroupPackets(group) {
  return PACKETS.filter(function(p) {
    if (p.state !== group.state) return false;
    if (group.dir && p.dir !== group.dir) return false;
    return true;
  });
}

// ============================================================
// BUILD SIDEBAR — links to standalone packet pages
// ============================================================
function buildSidebarNav(visiblePackets) {
  var nav = document.getElementById('sidebarNav');
  var html = '';

  groups.forEach(function(group) {
    var pkts = getGroupPackets(group);
    var filtered = visiblePackets ? pkts.filter(function(p) { return visiblePackets.indexOf(p) !== -1; }) : pkts;
    if (filtered.length === 0) return;

    html += '<div class="nav-section">';
    html += '<div class="nav-section-header" role="button" tabindex="0" data-group="' + group.id + '">';
    html += '<svg class="chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>';
    html += '<span>' + group.label + '</span>';
    html += '<span class="count">' + filtered.length + '</span>';
    html += '</div>';
    html += '<div class="nav-items">';

    filtered.forEach(function(p) {
      var prefix = p.id.substring(0, 3);
      var dirClass = p.dir === 'SERVERBOUND' ? 'sb' : 'cb';
      var dirLabel = p.dir === 'SERVERBOUND' ? 'SB' : 'CB';
      html += '<a href="packets/' + p.id + '/" class="nav-item">';
      html += '<span class="nav-hex">' + prefix + '</span>';
      html += '<span class="nav-name">' + p.name + '</span>';
      html += '<span class="nav-dir ' + dirClass + '">' + dirLabel + '</span>';
      html += '</a>';
    });

    html += '</div></div>';
  });

  if (!html) html = '<div class="no-results"><h3>No packets found</h3></div>';
  nav.innerHTML = html;

  nav.querySelectorAll('.nav-section-header').forEach(function(header) {
    header.addEventListener('click', function() {
      header.classList.toggle('collapsed');
      header.nextElementSibling.classList.toggle('collapsed');
    });
    header.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        header.click();
      }
    });
  });
}

// ============================================================
// SEARCH
// ============================================================
function searchPackets(term) {
  if (!term.trim()) return PACKETS.slice();
  var t = term.toLowerCase().trim();
  return PACKETS.filter(function(p) {
    return p._search.indexOf(t) !== -1;
  });
}

function applyFilters() {
  var r = searchPackets(state.searchTerm);
  if (state.dirFilter) r = r.filter(function(p) { return p.dir === state.dirFilter; });
  if (state.stateFilter) r = r.filter(function(p) { return p.state === state.stateFilter; });
  if (state.activeTag) r = r.filter(function(p) { return (p.tags || []).indexOf(state.activeTag) !== -1; });
  return r;
}

function refresh() {
  var visible = applyFilters();
  buildSidebarNav(visible);
  buildOverviewSections(visible);
  buildOverviewStats(visible);
  updateFilterButton();
}

// ============================================================
// FILTER PANEL
// ============================================================
function getAllTags() {
  var s = {};
  PACKETS.forEach(function(p) { (p.tags || []).forEach(function(t) { s[t] = true; }); });
  return Object.keys(s).sort();
}

function buildFilterTagGrid() {
  var grid = document.getElementById('filterTagGrid');
  if (!grid) return;
  var tags = getAllTags();
  grid.innerHTML = tags.map(function(t) {
    var a = state.activeTag === t ? ' active' : '';
    return '<button type="button" class="filter-tag-chip' + a + '" aria-pressed="' + (state.activeTag === t ? 'true' : 'false') + '" data-tag="' + t + '">' + t + '</button>';
  }).join('');
  grid.querySelectorAll('.filter-tag-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      var tag = this.dataset.tag;
      state.activeTag = state.activeTag === tag ? null : tag;
      refresh();
      buildFilterTagGrid();
    });
  });
}

function updateFilterButton() {
  var btn = document.getElementById('filterBtn');
  var count = document.getElementById('filterCount');
  var n = (state.dirFilter ? 1 : 0) + (state.stateFilter ? 1 : 0) + (state.activeTag ? 1 : 0);
  if (n > 0) { btn.classList.add('has-filters'); count.style.display = 'inline'; count.textContent = n; }
  else { btn.classList.remove('has-filters'); count.style.display = 'none'; }
}

function clearAllFilters() {
  state.activeTag = null;
  state.dirFilter = '';
  state.stateFilter = '';
  document.querySelectorAll('input[name="dirFilter"]').forEach(function(r) { r.checked = false; });
  document.querySelectorAll('input[name="stateFilter"]').forEach(function(r) { r.checked = false; });
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
  var total = filtered.length, sb = 0, cb = 0;
  filtered.forEach(function(p) { if (p.dir === 'SERVERBOUND') sb++; else cb++; });
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
    html += '<h2>' + group.label + ' <span style="font-size:0.7rem;color:var(--text-muted);font-weight:400;margin-left:6px">' + pkts.length + ' packets</span></h2>';
    html += '<div class="section-packet-list">';
    pkts.forEach(function(p) {
      var prefix = p.id.substring(0, 3);
      html += '<a href="packets/' + p.id + '/" class="section-packet-row">';
      html += '<span class="row-hex">' + prefix + '</span>';
      html += '<span class="row-name">' + p.name + '</span>';
      html += '<span class="row-desc">' + p.desc + '</span>';
      html += '</a>';
    });
    html += '</div></div>';
  });
  el.innerHTML = html;
}

// ============================================================
// EVENT HANDLERS
// ============================================================
document.getElementById('sidebarSearch').addEventListener('input', debounce(function() {
  state.searchTerm = this.value;
  refresh();
}, 120));

document.getElementById('filterBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  var dd = document.getElementById('filterDropdown');
  dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
  buildFilterTagGrid();
});

document.addEventListener('click', function(e) {
  var dd = document.getElementById('filterDropdown');
  var btn = document.getElementById('filterBtn');
  if (dd.style.display === 'block' && !dd.contains(e.target) && e.target !== btn) {
    dd.style.display = 'none';
  }
});

document.querySelectorAll('input[name="dirFilter"]').forEach(function(r) {
  r.addEventListener('change', function() { state.dirFilter = this.value; refresh(); });
});
document.querySelectorAll('input[name="stateFilter"]').forEach(function(r) {
  r.addEventListener('change', function() { state.stateFilter = this.value; refresh(); });
});
document.getElementById('filterClear').addEventListener('click', clearAllFilters);

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  if (e.key === '/' && document.activeElement !== document.getElementById('sidebarSearch')) {
    e.preventDefault();
    document.getElementById('sidebarSearch').focus();
  }
  if (e.key === 'Escape') {
    var dd = document.getElementById('filterDropdown');
    if (dd.style.display === 'block') { dd.style.display = 'none'; return; }
  }
});

// ============================================================
// INIT
// ============================================================
function init() {
  initSearchData(PACKETS);
  buildFilterTagGrid();
  refresh();
}

init();
})();
