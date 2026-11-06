// Nodes tab: one editable row per upgrade.
'use strict';

const NodesTab = {
  built: false,
  query: '',
  show: 'all',
  sortKey: null,      // a column key, '_layout' (disc order), or null (file order)
  sortDir: 1,
  activeId: null,     // the row being edited, highlighted until another row is used

  COLUMNS: [
    { key: 'id', label: 'ID', width: 230 },
    { key: 'icon', label: 'Icon', width: 200 },
    { key: 'name', label: 'Name', width: 190 },
    { key: 'stat', label: 'Stat', width: 210, list: 'dl-stats' },
    { key: 'op', label: 'Op', width: 92, type: 'op' },
    { key: 'value', label: 'Value', width: 82, type: 'number' },
    { key: 'keyword', label: 'Keyword', width: 270 },
    { key: 'desc_suffix', label: 'Desc suffix', width: 270 },
    { key: 'currency', label: 'Currency', width: 130, list: 'dl-currency' },
    { key: 'cost_base', label: 'Cost base', width: 96, type: 'number' },
    { key: 'cost_incr', label: 'Cost incr', width: 96, type: 'number' },
    { key: 'max_level', label: 'Max lvl', width: 70, type: 'number' },
    { key: 'cheater', label: 'Cheater', width: 76, type: 'number' },
    { key: 'cheater_type', label: 'Cheater type', width: 104 },
    { key: 'cheater_req', label: 'Cheater req', width: 104 },
    { key: '_placed', label: 'Placed', width: 150 },
    { key: '_preview', label: 'Description preview', width: 440 },
    { key: '_actions', label: '', width: 76 }
  ],

  build() {
    const root = document.getElementById('tab-nodes');
    this.search = h('input', {
      type: 'search', placeholder: 'Filter: id, name, stat, keyword, or z1 / z1_d2', spellcheck: false,
      title: 'Words are matched against id, name, stat and keyword (all must match).\nz1 shows nodes on discs z1_…; z1_d2 shows nodes on that disc only.',
      oninput: () => { this.query = this.search.value; this.renderRows(); }
    });
    this.sortSel = h('select', { title: 'Order of the rows (view only, does not change the file)', onchange: () => this.setSort(this.sortSel.value) },
      h('option', { value: 'file' }, 'File order'),
      h('option', { value: 'layout' }, 'Disc order'),
      h('option', { value: 'column', hidden: true }, 'Sorted by column'));
    this.showSel = h('select', { onchange: () => { this.show = this.showSel.value; this.renderRows(); } },
      h('option', { value: 'all' }, 'All nodes'),
      h('option', { value: 'unplaced' }, 'Not placed on a disc'),
      h('option', { value: 'issues' }, 'With issues'));
    this.countEl = h('span', { class: 'muted' });
    const toolbar = h('div', { class: 'toolbar' },
      this.search, this.showSel, this.sortSel, this.countEl, h('div', { class: 'spacer' }),
      h('button', { onclick: () => this.addDummy(), title: 'Placeholder node: named Dummy, dummy stat, next-zone icon' }, '+ Dummy node'),
      h('button', { onclick: () => this.addNode() }, '+ Add node'));

    this.dlStats = h('datalist', { id: 'dl-stats' });
    this.dlCurrency = h('datalist', { id: 'dl-currency' });
    this.thead = h('thead');
    this.tbody = h('tbody');
    const colgroup = h('colgroup', null, this.COLUMNS.map((c) => h('col', { style: { width: c.width + 'px' } })));
    this.table = h('table', { class: 'grid' }, colgroup, this.thead, this.tbody);
    this.wrap = h('div', { class: 'grid-wrap' }, this.table);
    root.append(toolbar, this.wrap, this.dlStats, this.dlCurrency);

    this.tbody.addEventListener('change', (e) => this.onCellChange(e));
    this.tbody.addEventListener('focusin', (e) => this.setActive(e.target.closest('tr[data-id]')));
    this.tbody.addEventListener('mousedown', (e) => this.setActive(e.target.closest('tr[data-id]')));
    this.tbody.addEventListener('click', (e) => this.onClick(e));
    this.built = true;
  },

  render() {
    if (!this.built) this.build();
    this.dlStats.replaceChildren(...App.statOptions().map((s) => h('option', { value: s })));
    this.dlCurrency.replaceChildren(...App.currencies().map((s) => h('option', { value: s })));
    this.renderHead();
    this.renderRows();
  },

  renderHead() {
    // The Placed column sorts the same way as "Disc order".
    const sortKeyFor = (c) => (c.key === '_placed' ? '_layout' : c.key);
    this.thead.replaceChildren(h('tr', null, this.COLUMNS.map((c) => {
      const sortable = c.key !== '_actions';
      const on = this.sortKey === sortKeyFor(c);
      const arrow = on ? (this.sortDir > 0 ? ' ▲' : ' ▼') : '';
      return h('th', {
        class: on ? 'sorted' : '',
        onclick: sortable ? () => this.toggleSort(sortKeyFor(c)) : null,
        title: sortable ? (c.key === '_placed' ? 'Sort by disc order' : 'Sort (view only, does not change file order)') : null
      }, c.label + arrow);
    })));
    if (this.sortSel) this.sortSel.value = this.sortKey === null ? 'file' : this.sortKey === '_layout' ? 'layout' : 'column';
  },

  setSort(mode) {
    if (mode === 'column') return;
    this.sortKey = mode === 'layout' ? '_layout' : null;
    this.sortDir = 1;
    this.renderHead();
    this.renderRows();
  },

  // Marks the row being edited so it stays highlighted.
  setActive(tr) {
    if (!tr || tr.dataset.id === this.activeId) return;
    const prev = this.tbody.querySelector('tr.editing');
    if (prev) prev.classList.remove('editing');
    tr.classList.add('editing');
    this.activeId = tr.dataset.id;
  },

  toggleSort(key) {
    if (this.sortKey !== key) { this.sortKey = key; this.sortDir = 1; }
    else if (this.sortDir === 1) this.sortDir = -1;
    else { this.sortKey = null; this.sortDir = 1; }
    this.renderHead();
    this.renderRows();
  },

  visibleNodes() {
    this.placed = Model.placements(App.data);
    const issueIds = new Set((App._issues || App.issues()).filter((i) => i.target && i.target.type === 'node').map((i) => i.target.id));
    this.issueIds = issueIds;
    const { words, discFilters } = parseQuery(this.query);
    let nodes = App.data.nodes.filter((n) => {
      for (const w of words) {
        if (![n.id, n.name, n.stat, n.keyword].some((s) => String(s || '').toLowerCase().includes(w))) return false;
      }
      for (const f of discFilters) {
        const p = this.placed.get(n.id);
        if (!p || !p.some((x) => f(x.disc))) return false;
      }
      if (this.show === 'unplaced' && this.placed.has(n.id)) return false;
      if (this.show === 'issues' && !issueIds.has(n.id)) return false;
      return true;
    });
    if (this.sortKey === '_layout') {
      // Discs in the order they're laid out (zone, orbital, disc), then each node's spot on its disc.
      // Unplaced nodes go last, in file order.
      const rank = (n) => {
        const p = this.placed.get(n.id);
        if (!p) return null;
        return p.map(layoutRank).sort(compareRanks)[0];
      };
      const ranks = new Map(nodes.map((n) => [n.id, rank(n)]));
      const fileIndex = new Map(App.data.nodes.map((n, i) => [n.id, i]));
      nodes = [...nodes].sort((a, b) => {
        const ra = ranks.get(a.id), rb = ranks.get(b.id);
        if (!ra || !rb) return (!ra && !rb) ? fileIndex.get(a.id) - fileIndex.get(b.id) : (ra ? -1 : 1);
        return compareRanks(ra, rb) * this.sortDir;
      });
    } else if (this.sortKey) {
      const key = this.sortKey;
      const val = (n) => key === '_placed' ? (this.placed.has(n.id) ? Model.describePlacement(this.placed.get(n.id)[0]) : '')
        : key === '_preview' ? Model.describe(n) : n[key];
      nodes = [...nodes].sort((a, b) => {
        const va = val(a), vb = val(b);
        const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''), undefined, { numeric: true });
        return c * this.sortDir;
      });
    }
    return nodes;
  },

  renderRows() {
    const nodes = this.visibleNodes();
    this.countEl.textContent = `${nodes.length} of ${App.data.nodes.length} nodes`;
    if (!App.data.nodes.length) {
      this.tbody.replaceChildren(h('tr', null, h('td', { colspan: this.COLUMNS.length },
        h('div', { class: 'empty-state' }, h('h2', null, 'No nodes yet'),
          h('p', null, 'Add a node with + Add node, or check that the game_data.json path in Settings is right.')))));
      return;
    }
    if (this.sortKey !== '_layout') {
      this.tbody.replaceChildren(...nodes.map((n) => this.renderRow(n)));
      return;
    }
    const rows = [];
    let lastDisc;
    for (const n of nodes) {
      const p = this.placed.get(n.id);
      const first = p ? p.map((x) => ({ x, r: layoutRank(x) })).sort((a, b) => compareRanks(a.r, b.r))[0].x : null;
      const key = first ? first.disc + '|' + first.z + '|' + first.o + '|' + first.d : '__unplaced';
      if (key !== lastDisc) {
        lastDisc = key;
        rows.push(this.groupRow(first));
      }
      rows.push(this.renderRow(n));
    }
    this.tbody.replaceChildren(...rows);
  },

  groupRow(p) {
    let label;
    if (!p) label = [h('strong', null, 'Not placed')];
    else {
      const disc = App.disc(p.z, p.o, p.d);
      const center = disc && App.node(disc.center);
      label = [
        h('strong', { class: 'mono' }, p.disc),
        h('span', { class: 'muted' }, `Zone ${p.z + 1} · Orbital ${p.o}` + (center ? ` · center: ${center.name || center.id}` : ''))
      ];
    }
    return h('tr', { class: 'group-row' }, h('td', { colspan: this.COLUMNS.length }, h('div', { class: 'group-label' }, label)));
  },

  renderRow(n) {
    const tr = h('tr', { dataset: { id: n.id }, class: n.id === this.activeId ? 'editing' : null });
    for (const c of this.COLUMNS) tr.append(h('td', null, this.renderCell(n, c)));
    return tr;
  },

  renderCell(n, c) {
    const frozen = App.isFrozen(n.id);
    switch (c.key) {
      case 'id':
        return frozen
          ? h('div', { class: 'id-cell', title: 'Locked id: it is a save key from the demo, so it cannot be renamed' }, h('span', { class: 'lock' }, '🔒'), n.id)
          : h('input', { class: 'mono', value: n.id, dataset: { field: 'id' }, spellcheck: false });
      case 'icon':
        return h('button', { class: 'icon-btn', dataset: { action: 'icon' }, title: n.icon || 'Choose icon' },
          spriteEl(n.icon), h('span', { class: 'name' }, n.icon || 'choose…'));
      case '_placed': {
        const p = this.placed.get(n.id);
        if (!p) return h('span', { class: 'placed none' }, 'not placed');
        return h('span', { class: 'placed', dataset: { action: 'goto' }, title: p.map(Model.describePlacement).join('\n') },
          Model.describePlacement(p[0]) + (p.length > 1 ? ` (+${p.length - 1})` : ''));
      }
      case '_preview': {
        const d = Model.describe(n);
        return h('div', { class: 'preview', title: d }, Model.stripTags(d));
      }
      case '_actions':
        return h('div', { class: 'row-actions' },
          h('button', { class: 'icon ghost', dataset: { action: 'duplicate' }, title: 'Duplicate this node' }, '⧉'),
          h('button', { class: 'icon ghost danger', dataset: { action: 'delete' }, title: 'Delete node' }, '✕'));
      default:
        if (c.type === 'op') {
          return h('select', { dataset: { field: 'op' } },
            Model.OPS.map((o) => h('option', { value: o, selected: n.op === o }, o)));
        }
        return h('input', {
          value: n[c.key] ?? '', dataset: { field: c.key }, spellcheck: false,
          list: c.list || null, inputmode: c.type === 'number' ? 'decimal' : null,
          class: c.type === 'number' ? 'mono' : null
        });
    }
  },

  onCellChange(e) {
    const input = e.target;
    const field = input.dataset.field;
    const tr = input.closest('tr');
    if (!field || !tr) return;
    const id = tr.dataset.id;
    const node = App.node(id);
    if (!node) return;
    let value = input.value;

    if (field === 'id') {
      value = value.trim();
      const err = this.idError(value, id);
      if (err) {
        Toast.show(err, 'error');
        input.value = id;
        return;
      }
      if (this.activeId === id) this.activeId = value;
      App.mutate((data) => renameNode(data, id, value));
      return;
    }
    if (Model.NUMBER_FIELDS.includes(field)) {
      const num = Number(String(value).trim());
      if (String(value).trim() === '' || Number.isNaN(num)) {
        input.classList.add('bad');
        Toast.show(`${field} must be a number`, 'error');
        input.value = node[field];
        setTimeout(() => input.classList.remove('bad'), 1200);
        return;
      }
      value = num;
    }
    App.mutate(() => { node[field] = value; }, { render: false });
    this.refreshRowDerived(tr, node);
  },

  // Updates the computed cells of one row without rebuilding the table (keeps focus).
  refreshRowDerived(tr, node) {
    this.placed = Model.placements(App.data);
    const idx = (key) => this.COLUMNS.findIndex((c) => c.key === key);
    tr.children[idx('_preview')].replaceChildren(this.renderCell(node, { key: '_preview' }));
    tr.children[idx('_placed')].replaceChildren(this.renderCell(node, { key: '_placed' }));
  },

  async onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const tr = btn.closest('tr');
    const node = App.node(tr.dataset.id);
    if (!node) return;
    const action = btn.dataset.action;
    if (action === 'icon') {
      const name = await Pickers.icon(node.icon);
      if (name === null || name === node.icon) return;
      App.mutate(() => { node.icon = name; }, { render: false });
      const fresh = this.renderRow(node);
      tr.replaceWith(fresh);
    } else if (action === 'goto') {
      const p = Model.placements(App.data).get(node.id);
      if (p) App.navigate({ type: 'disc', z: p[0].z, o: p[0].o, d: p[0].d, part: p[0].type === 'center' ? { type: 'center' } : { type: 'slot', s: p[0].s, r: p[0].r, k: p[0].k } });
    } else if (action === 'duplicate') {
      await this.duplicateNode(node);
    } else if (action === 'delete') {
      await this.deleteNode(node);
    }
  },

  idError(value, currentId) {
    if (!value) return 'Id cannot be empty';
    if (!/^[A-Za-z_]\w*$/.test(value)) return 'Use letters, digits and underscores, not starting with a digit';
    if (value !== currentId && App.data.nodes.some((n) => n.id === value)) return `"${value}" already exists`;
    return '';
  },

  async addNode() {
    const r = await askNodeId({
      title: 'Add node',
      help: 'The id becomes a save key once players own this node, so pick a lasting name.'
    });
    if (!r) return;
    App.mutate((data) => data.nodes.push({ ...Model.newNode(r.id), name: r.name }), { render: false });
    this.showNew(r.id, 'name');
  },

  async addDummy() {
    const ids = App.data.nodes.map((n) => n.id);
    const r = await askNodeId({
      title: 'Add dummy node',
      okLabel: 'Add dummy',
      initialId: Model.nextInSeries(ids, 'dummy'),
      initialName: 'Dummy',
      help: 'A placeholder: dummy stat, spr_next_zone_icon, cost 1, max level 1. Edit anything afterwards.'
    });
    if (!r) return;
    App.mutate((data) => data.nodes.push({ ...Model.dummyNode(r.id), name: r.name }), { render: false });
    this.showNew(r.id);
  },

  // Copies every field of a node under a new id, right after the original. The copy is not placed.
  async duplicateNode(node) {
    const ids = App.data.nodes.map((n) => n.id);
    const r = await askNodeId({
      title: `Duplicate "${node.id}"`,
      okLabel: 'Duplicate',
      initialId: Model.nextInSeries(ids, Model.splitSeries(node.id).base),
      initialName: node.name,
      help: 'Every field is copied. The copy is not placed on a disc yet.'
    });
    if (!r) return;
    App.mutate((data) => {
      const i = data.nodes.findIndex((n) => n.id === node.id);
      const copy = JSON.parse(JSON.stringify(data.nodes[i]));
      copy.id = r.id;
      copy.name = r.name;
      data.nodes.splice(i + 1, 0, copy);
    }, { render: false });
    this.showNew(r.id, 'name');
  },

  // Clears filters so a just-created node is visible, then scrolls to it.
  showNew(id, focusField) {
    this.query = '';
    this.search.value = '';
    this.show = 'all';
    this.showSel.value = 'all';
    this.render();
    this.reveal(id, focusField);
  },

  async deleteNode(node) {
    const frozen = App.isFrozen(node.id);
    const p = Model.placements(App.data).get(node.id);
    const msg = h('div', null,
      h('p', null, `Delete "${node.id}"${node.name ? ` (${node.name})` : ''}?`),
      p ? h('p', { class: 'muted' }, `Its ${p.length} disc slot${p.length > 1 ? 's become' : ' becomes'} empty.`) : null,
      frozen ? h('p', { style: { color: 'var(--red)' } }, 'This id is in demo saves. Deleting it means players who bought it lose that upgrade.') : null);
    if (!(await Modal.confirm('Delete node', msg, 'Delete', true))) return;
    App.mutate((data) => {
      data.nodes = data.nodes.filter((n) => n.id !== node.id);
      replaceNodeRefs(data, node.id, null);
    });
  },

  // Scrolls to a node's row and highlights it.
  reveal(id, focusField) {
    let tr = this.tbody.querySelector(`tr[data-id="${CSS.escape(id)}"]`);
    if (!tr) {
      this.query = '';
      this.search.value = '';
      this.show = 'all';
      this.showSel.value = 'all';
      this.renderRows();
      tr = this.tbody.querySelector(`tr[data-id="${CSS.escape(id)}"]`);
    }
    if (!tr) return;
    this.setActive(tr);
    tr.scrollIntoView({ block: 'center' });
    tr.classList.remove('flash');
    void tr.offsetWidth;
    tr.classList.add('flash');
    if (focusField) {
      const input = tr.querySelector(`[data-field="${focusField}"]`);
      if (input) input.focus();
    }
  }
};

// Splits the filter text into words to match and disc filters:
//   z1    -> nodes on any disc whose id starts with "z1_"
//   z1_d2 -> nodes on disc z1_d2 only
// (z1_ and z1_d, typed on the way to z1_d2, behave like z1.)
function parseQuery(text) {
  const words = [];
  const discFilters = [];
  for (const raw of text.trim().toLowerCase().split(/\s+/)) {
    if (!raw) continue;
    const m = raw.match(/^z(\d+)(?:_(?:d(\d+)?)?)?$/);
    if (!m) { words.push(raw); continue; }
    const zone = m[1];
    const disc = m[2];
    discFilters.push(disc === undefined
      ? (id) => String(id).toLowerCase().startsWith(`z${zone}_`)
      : (id) => String(id).toLowerCase() === `z${zone}_d${disc}`);
  }
  return { words, discFilters };
}

// Sort key for one placement: zone, orbital, disc, then sector, ring, slot (the center comes last).
function layoutRank(p) {
  return p.type === 'center' ? [p.z, p.o, p.d, 1, 0, 0, 0] : [p.z, p.o, p.d, 0, p.s, p.r, p.k];
}

function compareRanks(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// Dialog for a new node id. As you type it lists existing ids that look similar, grouped
// by series (buster_force_0 … buster_force_5) with the highest number marked and a button
// for the next one. Resolves with { id, name } or null.
function askNodeId({ title, okLabel = 'Create', initialId = '', initialName = '', help = '' }) {
  const idInput = h('input', { type: 'text', value: initialId, spellcheck: false, class: 'mono', placeholder: 'e.g. buster_force_6' });
  const nameInput = h('input', { type: 'text', value: initialName, spellcheck: false, placeholder: 'Display name (optional)' });
  const errEl = h('div', { class: 'err-text' });
  const list = h('div', { class: 'similar' });
  const render = () => {
    const v = idInput.value.trim();
    errEl.textContent = v ? NodesTab.idError(v, null) : '';
    list.replaceChildren(...similarIdRows(v, (id) => { idInput.value = id; render(); idInput.focus(); }));
  };
  idInput.addEventListener('input', render);
  render();
  const body = h('div', null,
    help ? h('p', { class: 'muted', style: { marginTop: 0 } }, help) : null,
    h('div', { class: 'field-label' }, 'Node id'), idInput, errEl,
    h('div', { class: 'field-label' }, 'Display name'), nameInput,
    h('div', { class: 'field-label', style: { marginTop: '14px' } }, 'Existing ids like this'), list);
  return Modal.open({
    title,
    wide: true,
    body,
    buttons: [
      { label: 'Cancel', value: null },
      {
        label: okLabel, primary: true,
        onClick: (close) => {
          const id = idInput.value.trim();
          const e = NodesTab.idError(id, null);
          if (e) { errEl.textContent = e; idInput.focus(); return; }
          close({ id, name: nameInput.value.trim() });
        }
      }
    ],
    onMount: () => { idInput.focus(); idInput.select(); }
  });
}

function similarIdRows(text, onPick) {
  const typed = text.trim().toLowerCase();
  const base = typed.replace(/_?\d+$/, '');
  if (base.length < 2) return [h('p', { class: 'muted' }, 'Type part of an id to see the existing ones.')];
  const ids = App.data.nodes.map((n) => n.id);
  const groups = new Map();
  for (const n of App.data.nodes) {
    if (!n.id.toLowerCase().includes(base)) continue;
    const s = Model.splitSeries(n.id);
    if (!groups.has(s.base)) groups.set(s.base, []);
    groups.get(s.base).push({ id: n.id, num: s.num, name: n.name });
  }
  if (!groups.size) return [h('p', { class: 'muted' }, 'No existing ids match, so this starts a new series.')];
  const startsFirst = (k) => (k.toLowerCase().startsWith(base) ? 0 : 1);
  const keys = [...groups.keys()].sort((a, b) => startsFirst(a) - startsFirst(b) || a.localeCompare(b));
  const rows = keys.slice(0, 40).map((key) => {
    const items = groups.get(key).sort((a, b) => (a.num ?? -1) - (b.num ?? -1));
    const numbered = items.filter((i) => i.num !== null);
    const max = numbered.length ? numbered[numbered.length - 1].num : null;
    const next = Model.nextInSeries(ids, key);
    return h('div', { class: 'series' },
      h('span', { class: 'series-base mono' }, numbered.length ? key + '_' : key),
      h('span', { class: 'series-items' }, numbered.map((i) =>
        h('span', { class: 'chip mono' + (i.num === max ? ' top' : ''), title: i.id + (i.name ? ' — ' + i.name : '') }, String(i.num)))),
      numbered.length
        ? h('button', { class: 'small', title: `Highest is ${key}_${max}`, onclick: () => onPick(next) }, 'Use ' + next)
        : null);
  });
  if (keys.length > 40) rows.push(h('p', { class: 'muted' }, `…and ${keys.length - 40} more. Keep typing to narrow it down.`));
  return rows;
}

// Replaces every layout reference to a node id (null clears it).
function replaceNodeRefs(data, oldId, newId) {
  for (const zone of data.zones) for (const orb of zone.orbitals) for (const disc of orb.discs) {
    if (disc.center === oldId) disc.center = newId;
    for (const sec of disc.sectors) for (const ring of sec.rings) {
      ring.nodes = ring.nodes.map((x) => (x === oldId ? newId : x));
    }
  }
}

function renameNode(data, oldId, newId) {
  const node = data.nodes.find((n) => n.id === oldId);
  if (!node) return;
  node.id = newId;
  replaceNodeRefs(data, oldId, newId);
}

App.tabs.nodes = NodesTab;
