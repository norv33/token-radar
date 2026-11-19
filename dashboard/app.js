// Token Radar's dashboard, radar-2. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table, a
// per-protocol detail view with the model's own inputs and the protocol's
// farm plan, and the Live view of tokens that already trade. No network:
// every byte it shows is in data.js.
//
// The model, radar-2, in one place (see lib/model.ts for the same arithmetic
// in full). For a pre-token protocol, from the snapshot's own figures:
//
//   multiple  = median mcap/TVL of the live-token protocols in its category,
//               from this same snapshot (at least 3 of them, else the global
//               median), clamped to [0.02, 1.50]
//   implied   = TVL x multiple
//               x (1 + 0.5 x clamp(change_7d, -60, 120) / 100)
//               x (0.6 + 0.4 x min(age_days, 1095) / 1095)
//               x (1 + 0.03 x min(chains - 1, 5))
//
// No protocol name is special-cased: the same function scores every row.
// A protocol's implied value is this entry's claim, never a market price,
// and a token may never launch at all: the board says what a launch would be
// worth if the protocol's record stayed as it is, not that one is coming.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  app.setAttribute('aria-busy', 'false');

  var state = { q: '', category: 'all', chain: 'all', wl: false, tab: 'pre-token', sort: 'rank', dir: 1, selected: null };

  function parseHash() {
    var h = (location.hash || '').replace(/^#/, '');
    var out = {};
    if (!h) return out;
    h.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv.length === 2) out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
    });
    return out;
  }
  function applyHash() {
    var h = parseHash();
    if (h.q !== undefined) state.q = h.q;
    if (h.cat !== undefined) state.category = h.cat;
    if (h.chain !== undefined) state.chain = h.chain;
    if (h.wl !== undefined) state.wl = h.wl === '1';
    if (h.tab === 'live' || h.tab === 'pre-token') state.tab = h.tab;
    if (h.sort !== undefined) state.sort = h.sort;
    if (h.dir !== undefined) state.dir = h.dir === '-1' ? -1 : 1;
    if (h.detail !== undefined) state.selected = h.detail;
  }
  function writeHash() {
    var parts = [];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.category !== 'all') parts.push('cat=' + encodeURIComponent(state.category));
    if (state.chain !== 'all') parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.wl) parts.push('wl=1');
    if (state.tab !== 'pre-token') parts.push('tab=' + state.tab);
    if (state.sort !== 'rank') parts.push('sort=' + state.sort);
    if (state.dir !== 1) parts.push('dir=-1');
    if (state.selected) parts.push('detail=' + encodeURIComponent(state.selected));
    history.replaceState(null, '', parts.length ? '#' + parts.join('&') : location.pathname + location.search);
  }
  applyHash();

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + 'x';
  }
  function esc(s) { return String(s); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // A row is on the watchlist when main.ts flagged it: the snapshot's
  // watchlist is the floor, and the board shows the flag on every row.
  function isWatch(r) { return r.is_watchlist === true; }

  var categories = [];
  var chains = [];
  (function () {
    var cs = {}, ch = {};
    DATA.rows.forEach(function (r) {
      if (r.category) cs[r.category] = true;
      (r.chains || []).forEach(function (c) { ch[c] = true; });
    });
    categories = Object.keys(cs).sort();
    chains = Object.keys(ch).sort();
  })();

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.wl && !isWatch(r)) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      return true;
    });
  }
  function sortedRows(rows) {
    var key = state.sort, dir = state.dir;
    var copy = rows.slice();
    copy.sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (key === 'name') return dir * (String(av).localeCompare(String(bv)));
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return dir * (av - bv);
    });
    return copy;
  }

  function moneyCell(v) { return el('td', { class: 'num val', text: fmtUsd(v) }); }

  function renderTable(container, rows) {
    var wrap = el('div', { class: 'tablewrap' });
    if (rows.length === 0) {
      wrap.appendChild(el('div', { class: 'empty', text: 'No protocols match this filter. Clear the search or pick another category.' }));
      container.appendChild(wrap);
      return;
    }
    var table = el('table');
    var cols = [
      ['rank', 'Rank'], ['name', 'Protocol'], ['category', 'Category'], ['chains', 'Chains'],
      ['tvl_usd', 'TVL'], ['change_7d', '7d'], ['age_days', 'Age'], ['implied_value_usd', 'Implied value'],
    ];
    var thead = el('thead');
    var tr = el('tr');
    cols.forEach(function (c) {
      var th = el('th', { text: c[1] + (state.sort === c[0] ? (state.dir === 1 ? ' ▲' : ' ▼') : '') });
      if (c[0] === 'tvl_usd' || c[0] === 'change_7d' || c[0] === 'age_days' || c[0] === 'implied_value_usd') th.className = 'num sortable';
      else if (c[0] === 'rank' || c[0] === 'name') th.className = 'sortable';
      th.addEventListener('click', function () {
        if (state.sort === c[0]) state.dir = -state.dir;
        else { state.sort = c[0]; state.dir = c[0] === 'name' ? 1 : -1; }
        writeHash(); render();
      });
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
    var tbody = el('tbody');
    rows.forEach(function (r) {
      var row = el('tr', { class: state.selected === r.slug ? 'selected' : '' });
      row.addEventListener('click', function () {
        state.selected = state.selected === r.slug ? null : r.slug;
        writeHash(); render();
        if (state.selected) {
          var d = document.getElementById('detail');
          if (d) d.scrollIntoView({ block: 'nearest' });
        }
      });
      var rankCls = 'rank' + (r.rank === 1 ? ' top1' : r.rank === 2 ? ' top2' : r.rank === 3 ? ' top3' : '');
      row.appendChild(el('td', {}, el('span', { class: rankCls, text: '#' + r.rank })));
      var nameCell = el('td', { class: 'namecell' });
      nameCell.appendChild(el('b', {}, esc(r.name)));
      nameCell.appendChild(el('span', {}, esc(r.slug) + (isWatch(r) ? ' · watchlist' : '')));
      row.appendChild(nameCell);
      row.appendChild(el('td', { class: 'cat', text: r.category || '—' }));
      var chainCell = el('td');
      (r.chains || []).slice(0, 3).forEach(function (c) { chainCell.appendChild(el('span', { class: 'chip', text: c })); });
      if ((r.chains || []).length > 3) chainCell.appendChild(el('span', { class: 'chip', text: '+' + ((r.chains || []).length - 3) }));
      row.appendChild(chainCell);
      row.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
      var ch = el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) });
      row.appendChild(ch);
      row.appendChild(el('td', { class: 'num', text: fmtAge(r.age_days) }));
      row.appendChild(moneyCell(r.implied_value_usd));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    container.appendChild(wrap);
  }

  function renderLive(container) {
    var wrap = el('div', { class: 'tablewrap' });
    var table = el('table');
    var thead = el('thead');
    var tr = el('tr');
    ['Protocol', 'Category', 'Chains', 'TVL', '7d', 'Market cap'].forEach(function (h, i) {
      tr.appendChild(el('th', { class: i >= 3 ? 'num' : '', text: h }));
    });
    thead.appendChild(tr);
    table.appendChild(thead);
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      var row = el('tr');
      row.style.cursor = 'default';
      var nameCell = el('td', { class: 'namecell' });
      nameCell.appendChild(el('b', {}, esc(r.name)));
      nameCell.appendChild(el('span', {}, esc(r.slug)));
      row.appendChild(nameCell);
      row.appendChild(el('td', { class: 'cat', text: r.category || '—' }));
      var chainCell = el('td');
      (r.chains || []).slice(0, 3).forEach(function (c) { chainCell.appendChild(el('span', { class: 'chip', text: c })); });
      row.appendChild(chainCell);
      row.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
      row.appendChild(el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }));
      row.appendChild(moneyCell(r.mcap_usd));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    container.appendChild(el('p', { class: 'fineprint', text: 'These tokens already trade. The board shows the market’s own value for them, never a model’s implied value — they are here so the radar’s pre-token rows are never confused with live ones.' }));
    container.appendChild(wrap);
  }

  function renderDetail(container) {
    var slug = state.selected;
    if (!slug) return;
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    var box = el('section', { class: 'detail', id: 'detail' });
    var close = el('button', { class: 'close-detail', text: 'Close ×', onclick: function () { state.selected = null; writeHash(); render(); } });
    box.appendChild(close);
    box.appendChild(el('h2', {}, esc(row.name)));
    box.appendChild(el('p', { class: 'sub', text: row.slug + ' · ' + (row.category || 'no category') + ' · rank #' + row.rank + ' of ' + DATA.board_size + (isWatch(row) ? ' · on the watchlist' : ' · below the watchlist floor') }));
    var kv = el('div', { class: 'kv' });
    function kvItem(label, value) {
      var d = el('div');
      d.appendChild(el('span', {}, label));
      d.appendChild(el('b', {}, value));
      kv.appendChild(d);
    }
    kvItem('Implied value', fmtUsd(row.implied_value_usd));
    kvItem('TVL', fmtUsd(row.tvl_usd));
    kvItem('7-day change', fmtPct(row.change_7d));
    kvItem('Age (tracked since)', (row.listed_at || 'unknown') + ' · ' + fmtAge(row.age_days));
    kvItem('Chains', (row.chains || []).join(', ') || '—');
    var breakdown = 'TVL ' + fmtUsd(row.tvl_usd) + ' × ' + fmtMult(row.category_multiple) + ' (category multiple) × ' + row.growth_multiplier.toFixed(2) + ' (growth) × ' + row.maturity_multiplier.toFixed(2) + ' (maturity) × ' + row.chain_multiplier.toFixed(2) + ' (chains)';
    var wide = el('div', { class: 'wide' });
    wide.appendChild(el('span', {}, 'How the implied value is built'));
    wide.appendChild(el('b', {}, breakdown));
    kv.appendChild(wide);
    var wide2 = el('div', { class: 'wide' });
    wide2.appendChild(el('span', {}, 'Where the multiple comes from'));
    wide2.appendChild(el('b', {}, row.multiple_source + '.'));
    kv.appendChild(wide2);
    box.appendChild(kv);
    box.appendChild(el('h3', {}, 'Farm plan — six steps'));
    var ol = el('ol', { class: 'steps' });
    (row.farm_steps || []).forEach(function (s) { ol.appendChild(el('li', {}, esc(s))); });
    box.appendChild(ol);
    box.appendChild(el('p', { class: 'fineprint', text: 'This protocol records no token in the snapshot. That is DefiLlama’s record, not proof it has none — and a token may never launch. The implied value is the radar’s claim about what a launch would be worth if the record stayed as it is.' }));
    container.appendChild(box);
  }

  function renderMethod(container) {
    var sec = el('section', { class: 'method' });
    sec.appendChild(el('h2', {}, 'How the radar scores — radar-2'));
    sec.appendChild(el('p', {}, 'Every row is scored by the same function, from the snapshot’s own figures. No protocol name is special-cased.'));
    var formula = el('p', {});
    formula.appendChild(el('code', {}, 'implied = TVL × multiple × growth × maturity × chains'));
    sec.appendChild(formula);
    var list = el('ul', {});
    [
      'multiple — the median mcap/TVL of the live-token protocols in the row’s category, taken from this same snapshot (at least 3 of them, else the snapshot’s global median of ' + DATA.global_multiple.toFixed(4) + 'x), clamped to [0.02, 1.50].',
      'growth — 1 + 0.5 × clamp(7-day TVL change, −60%, +120%) / 100. A protocol growing fast is worth more than one shrinking.',
      'maturity — 0.6 + 0.4 × min(age in days, 1095) / 1095. A protocol that has run a long time with no token has a longer record to price.',
      'chains — 1 + 0.03 × min(chains − 1, 5). More chains, more surface to farm.',
    ].forEach(function (t) { list.appendChild(el('li', {}, t)); });
    sec.appendChild(list);
    sec.appendChild(el('p', {}, 'The watchlist (40 protocols at or above $50M TVL with no token recorded) is the floor, never the ceiling: this board ranks all ' + DATA.board_size + ' rankable pre-token protocols, ' + DATA.early_size + ' of them below the floor.'));
    var h3 = el('h3', {}, 'Category multiples used');
    h3.style.cssText = 'margin:14px 0 4px;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:var(--accent)';
    sec.appendChild(h3);
    var grid = el('div', { class: 'mult-grid' });
    Object.keys(DATA.category_multiples || {}).sort().forEach(function (cat) {
      var v = DATA.category_multiples[cat];
      var d = el('div');
      d.appendChild(el('b', {}, cat + ' — ' + fmtMult(v.multiple)));
      d.appendChild(el('span', {}, 'median of ' + v.live_count + ' live protocols'));
      grid.appendChild(d);
    });
    sec.appendChild(grid);
    sec.appendChild(el('p', { class: 'fineprint', text: 'Source: ' + DATA.source + '. Snapshot as of ' + DATA.as_of + '. Not financial advice: implied values are this radar’s model, a token may never launch, and farming costs gas and locks capital.' }));
    container.appendChild(sec);
  }

  function render() {
    app.textContent = '';
    var wrap = el('div', { class: 'wrap' });

    var hero = el('header', { class: 'hero' });
    hero.appendChild(el('p', { class: 'eyebrow', text: 'Token Radar · radar-2 · snapshot ' + DATA.as_of }));
    var h1 = el('h1', {});
    h1.appendChild(document.createTextNode('Token Radar '));
    h1.appendChild(el('span', { class: 'thin', text: '— pre-token protocols, ranked' }));
    hero.appendChild(h1);
    hero.appendChild(el('p', { class: 'lede', text: 'Every protocol in the snapshot that records no token, ranked by what its token would be worth if the record stayed as it is. The watchlist is the floor, never the ceiling.' }));
    var stats = el('div', { class: 'stats' });
    function stat(v, l) {
      var d = el('div', { class: 'stat' });
      d.appendChild(el('b', {}, v));
      d.appendChild(el('span', {}, l));
      stats.appendChild(d);
    }
    stat(String(DATA.board_size), 'ranked pre-token');
    stat(String(DATA.watchlist_size), 'on the watchlist');
    stat(String(DATA.early_size), 'below the floor');
    stat(String(DATA.live_size), 'live tokens set aside');
    stat(fmtUsd(DATA.rows.length ? DATA.rows[0].implied_value_usd : 0), 'top implied value');
    hero.appendChild(stats);
    wrap.appendChild(hero);

    var tabs = el('div', { class: 'tabs' });
    var tabPre = el('button', { class: 'tab', text: 'Pre-token board (' + DATA.board_size + ')', 'aria-selected': state.tab === 'pre-token' ? 'true' : 'false' });
    tabPre.addEventListener('click', function () { state.tab = 'pre-token'; state.selected = null; writeHash(); render(); });
    var tabLive = el('button', { class: 'tab', text: 'Live tokens (' + DATA.live_size + ')', 'aria-selected': state.tab === 'live' ? 'true' : 'false' });
    tabLive.addEventListener('click', function () { state.tab = 'live'; state.selected = null; writeHash(); render(); });
    tabs.appendChild(tabPre);
    tabs.appendChild(tabLive);
    wrap.appendChild(tabs);

    if (state.tab === 'pre-token') {
      var controls = el('div', { class: 'controls' });
      var fSearch = el('div', { class: 'field grow' });
      fSearch.appendChild(el('label', { text: 'Search name or slug', for: 'q' }));
      var qInput = el('input', { id: 'q', type: 'search', placeholder: 'e.g. gauntlet, veda…', value: state.q });
      qInput.addEventListener('input', function () { state.q = qInput.value; writeHash(); renderTableOnly(); });
      fSearch.appendChild(qInput);
      controls.appendChild(fSearch);
      var fCat = el('div', { class: 'field' });
      fCat.appendChild(el('label', { text: 'Category', for: 'cat' }));
      var catSel = el('select', { id: 'cat' });
      catSel.appendChild(el('option', { value: 'all', text: 'All categories' }));
      categories.forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c })); });
      catSel.value = state.category;
      catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
      fCat.appendChild(catSel);
      controls.appendChild(fCat);
      var fChain = el('div', { class: 'field' });
      fChain.appendChild(el('label', { text: 'Chain', for: 'chain' }));
      var chainSel = el('select', { id: 'chain' });
      chainSel.appendChild(el('option', { value: 'all', text: 'All chains' }));
      chains.forEach(function (c) { chainSel.appendChild(el('option', { value: c, text: c })); });
      chainSel.value = state.chain;
      chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
      fChain.appendChild(chainSel);
      controls.appendChild(fChain);
      var check = el('label', { class: 'check' });
      var wlBox = el('input', { type: 'checkbox' });
      wlBox.checked = state.wl;
      wlBox.addEventListener('change', function () { state.wl = wlBox.checked; writeHash(); render(); });
      check.appendChild(wlBox);
      check.appendChild(document.createTextNode('Watchlist only'));
      controls.appendChild(check);
      var rows = sortedRows(filteredRows());
      controls.appendChild(el('span', { class: 'count', text: rows.length + ' of ' + DATA.board_size + ' shown' }));
      wrap.appendChild(controls);
      var boardSec = el('div', { id: 'boardsec' });
      renderTable(boardSec, rows);
      wrap.appendChild(boardSec);
      renderDetail(wrap);
    } else {
      renderLive(wrap);
    }
    renderMethod(wrap);
    app.appendChild(wrap);
  }

  // Search re-renders only the table, so typing never loses focus.
  function renderTableOnly() {
    var old = document.getElementById('boardsec');
    var count = document.querySelector('.count');
    var rows = sortedRows(filteredRows());
    if (count) count.textContent = rows.length + ' of ' + DATA.board_size + ' shown';
    if (!old) { render(); return; }
    var replacement = document.createElement('div');
    replacement.id = 'boardsec';
    renderTable(replacement, rows);
    old.replaceWith(replacement);
  }

  render();
})();
