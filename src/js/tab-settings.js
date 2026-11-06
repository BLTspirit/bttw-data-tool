// Settings tab: typed paths with Browse buttons and found/not-found status.
'use strict';

const SettingsTab = {
  built: false,

  GROUPS: [
    {
      title: 'GameMaker project',
      help: 'Optional. Setting this lets you fill every path below in one click with the standard project locations.',
      rows: [{ key: 'projectDir', label: 'Project folder', kind: 'folder' }],
      extra: () => h('button', { class: 'small', onclick: () => SettingsTab.fillFromProject() }, 'Fill paths from project folder')
    },
    {
      title: 'Icons',
      help: 'The project\'s sprites folder (the one with a sub-folder per sprite). Its sprite names fill the icon picker.',
      rows: [{ key: 'spritesDir', label: 'Sprite folder', kind: 'folder' }],
      extra: () => h('span', { class: 'muted' }, h('button', { class: 'small', onclick: () => SettingsTab.rescan() }, 'Rescan sprites'), '  ', SettingsTab.spriteCount = h('span'))
    },
    {
      title: 'Data file',
      help: 'Save writes both files. game_data.json is what the tool edits; keep it outside datafiles/ so it does not ship. scr_game_data.gml is generated for the game: create an empty script asset named scr_game_data in GameMaker once, and the tool overwrites its .gml on every save.',
      rows: [
        { key: 'dataFile', label: 'game_data.json', kind: 'save' },
        { key: 'gmlScript', label: 'scr_game_data.gml', kind: 'file', filters: [{ name: 'GML', extensions: ['gml'] }] }
      ]
    },
    {
      title: 'Stat names',
      help: 'Stat names from this script fill the Stat dropdown and let the Issues tab flag unknown stats. They are re-read whenever you switch back to the tool, or click Rescan stats.',
      rows: [{ key: 'baseStatsScript', label: 'scr_init_base_stats.gml', kind: 'file', filters: [{ name: 'GML', extensions: ['gml'] }] }],
      extra: () => h('span', { class: 'muted' }, h('button', { class: 'small', onclick: () => SettingsTab.rescanStats() }, 'Rescan stats'), '  ', SettingsTab.statCount = h('span'))
    }
  ],

  build() {
    const root = document.getElementById('tab-settings');
    this.inputs = {};
    this.statusEls = {};
    const groups = this.GROUPS.map((g) => h('div', null,
      h('h2', null, g.title),
      h('p', { class: 'help' }, g.help),
      g.rows.map((row) => this.buildRow(row)),
      g.extra ? h('div', { style: { margin: '2px 0 0 178px' } }, g.extra()) : null));
    root.append(h('div', { class: 'settings' }, groups));
    this.built = true;
  },

  buildRow(row) {
    const input = h('input', {
      type: 'text', spellcheck: false, placeholder: row.kind === 'folder' ? 'Folder path' : 'File path',
      onchange: () => this.set(row.key, input.value.trim())
    });
    const status = h('span', { class: 'status unset' }, 'not set');
    const browse = h('button', {
      class: 'small',
      onclick: async () => {
        const cur = App.settings[row.key] || App.settings.projectDir || undefined;
        let p = null;
        if (row.kind === 'folder') p = await window.api.pickFolder(cur);
        else if (row.kind === 'save') p = await window.api.pickSaveFile(cur || 'game_data.json');
        else p = await window.api.pickFile(cur, row.filters);
        if (p) this.set(row.key, p);
      }
    }, 'Browse…');
    this.inputs[row.key] = input;
    this.statusEls[row.key] = status;
    return h('div', { class: 'path-row' }, h('label', null, row.label), input, browse, status);
  },

  async set(key, value) {
    await App.updateSettings({ [key]: value });
    if (key === 'dataFile' && value && (await window.api.exists(value)) && !App.data.nodes.length) {
      if (await App.loadFromDisk()) App.render();
    }
    this.render();
  },

  async fillFromProject() {
    const dir = App.settings.projectDir;
    if (!dir) return Toast.show('Set the project folder first', 'warn');
    const derived = await window.api.deriveFromProject(dir);
    const overwriting = Object.keys(derived).filter((k) => App.settings[k] && App.settings[k] !== derived[k]);
    if (overwriting.length && !(await Modal.confirm('Overwrite paths?', `This replaces ${overwriting.length} path${overwriting.length > 1 ? 's' : ''} you already set.`, 'Overwrite'))) return;
    await App.updateSettings(derived);
    this.render();
    Toast.show('Paths filled from the project folder');
  },

  async rescanStats() {
    const r = await App.refreshStats();
    if (!r.ok) {
      Toast.show('Could not read stat names: ' + r.error, 'error', 5000);
    } else {
      const parts = [];
      if (r.added.length) parts.push(`${r.added.length} new (${r.added.slice(0, 5).join(', ')}${r.added.length > 5 ? ', …' : ''})`);
      if (r.removed.length) parts.push(`${r.removed.length} removed (${r.removed.slice(0, 5).join(', ')}${r.removed.length > 5 ? ', …' : ''})`);
      Toast.show(`Found ${App.statNames.length} stats` + (parts.length ? ': ' + parts.join('; ') : ', no changes'), 'ok', 6000);
    }
    App.refreshChrome();
    this.render();
  },

  async rescan() {
    const r = await App.refreshSprites();
    if (!r.ok) Toast.show('Could not read sprite folder: ' + r.error, 'error', 5000);
    else Toast.show(`Found ${r.sprites.length} sprites`);
    this.render();
  },

  async render() {
    if (!this.built) this.build();
    for (const [key, input] of Object.entries(this.inputs)) {
      if (document.activeElement !== input) input.value = App.settings[key] || '';
      const el = this.statusEls[key];
      const p = App.settings[key];
      if (!p) { el.className = 'status unset'; el.textContent = 'not set'; continue; }
      const ok = await window.api.exists(p);
      if (key === 'dataFile' && !ok) { el.className = 'status unset'; el.textContent = 'created on save'; continue; }
      el.className = 'status ' + (ok ? 'ok' : 'bad');
      el.textContent = ok ? 'found' : 'not found';
    }
    if (this.statCount) this.statCount.textContent = App.statNames.length ? `${App.statNames.length} stat names loaded` : 'no stat names loaded';
    if (this.spriteCount) this.spriteCount.textContent = App.sprites.length ? `${App.sprites.length} sprites loaded` : 'no sprites loaded';
  }
};

App.tabs.settings = SettingsTab;
