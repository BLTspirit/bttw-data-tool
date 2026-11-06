// App state, undo/redo, file actions, and navigation between tabs.
'use strict';

const DEFAULT_CURRENCIES = ['dollars', 'gold', 'diamond', 'keys', 'uncommon_keys', 'rare_keys'];

const App = {
  data: Model.emptyData(),
  settings: {},
  sprites: [],
  spriteMap: new Map(),
  imageCache: new Map(),
  statNames: [],
  statSet: null,
  dirty: false,
  undoStack: [],
  redoStack: [],
  tab: 'nodes',
  tabs: {},
  // Selected disc and the part of it being edited.
  // part: null | { type: 'center' } | { type: 'slot', s, r, k } | { type: 'orbital' }
  sel: { z: 0, o: 0, d: 0, part: null },

  // ---------- lookups ----------
  spriteUrl(name) {
    const s = this.spriteMap.get(name);
    return s ? s.url : null;
  },
  // Cached Image for canvas drawing; redraws the disc view once it loads.
  image(name) {
    const url = this.spriteUrl(name);
    if (!url) return null;
    let img = this.imageCache.get(url);
    if (!img) {
      img = new Image();
      img.onload = () => { if (this.tab === 'discs') this.tabs.discs.draw(); };
      img.src = url;
      this.imageCache.set(url, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  },
  node(id) {
    return id ? this.data.nodes.find((n) => n.id === id) || null : null;
  },
  disc(z = this.sel.z, o = this.sel.o, d = this.sel.d) {
    const zone = this.data.zones[z];
    const orb = zone && zone.orbitals[o];
    return (orb && orb.discs[d]) || null;
  },
  isFrozen(id) {
    return (this.data.frozen_ids || []).includes(id);
  },
  issues() {
    return Model.validate(this.data, {
      spriteNames: this.sprites.length ? new Set(this.spriteMap.keys()) : null,
      statNames: this.statSet
    });
  },
  currencies() {
    return [...new Set([...DEFAULT_CURRENCIES, ...this.data.nodes.map((n) => n.currency).filter(Boolean)])];
  },
  statOptions() {
    return [...new Set(['dummy', ...this.statNames, ...this.data.nodes.map((n) => n.stat).filter(Boolean)])];
  },

  // ---------- state changes ----------
  // Every edit goes through here so it can be undone.
  mutate(fn, { render = true } = {}) {
    this.undoStack.push(JSON.stringify(this.data));
    if (this.undoStack.length > 300) this.undoStack.shift();
    this.redoStack = [];
    fn(this.data);
    this.setDirty(true);
    if (render) this.render();
    else this.refreshChrome();
  },
  undo() {
    if (!this.undoStack.length) return Toast.show('Nothing to undo', 'warn', 1400);
    this.redoStack.push(JSON.stringify(this.data));
    this.data = JSON.parse(this.undoStack.pop());
    this.setDirty(true);
    this.render();
  },
  redo() {
    if (!this.redoStack.length) return Toast.show('Nothing to redo', 'warn', 1400);
    this.undoStack.push(JSON.stringify(this.data));
    this.data = JSON.parse(this.redoStack.pop());
    this.setDirty(true);
    this.render();
  },
  setDirty(v) {
    this.dirty = v;
    window.api.setDirty(v);
    this.refreshChrome();
  },

  // Keeps the selection pointing at something that exists.
  clampSel() {
    const s = this.sel;
    const zones = this.data.zones;
    if (!zones.length) { this.sel = { z: 0, o: 0, d: -1, part: null }; return; }
    s.z = Math.min(Math.max(0, s.z), zones.length - 1);
    const orbs = zones[s.z].orbitals;
    if (!orbs.length) { s.o = 0; s.d = -1; if (s.part && s.part.type !== 'orbital') s.part = null; return; }
    s.o = Math.min(Math.max(0, s.o), orbs.length - 1);
    const discs = orbs[s.o].discs;
    if (!discs.length) { s.d = -1; if (s.part && s.part.type !== 'orbital') s.part = null; return; }
    if (s.d < 0 && !(s.part && s.part.type === 'orbital')) s.d = 0;
    s.d = Math.min(s.d, discs.length - 1);
    const p = s.part;
    if (p && p.type === 'slot') {
      const disc = discs[Math.max(0, s.d)];
      const ring = disc && disc.sectors[p.s] && disc.sectors[p.s].rings[p.r];
      if (!ring || p.k >= ring.nodes.length) s.part = null;
    }
  },

  // ---------- rendering ----------
  refreshChrome() {
    const issues = this.issues();
    const errors = issues.filter((i) => i.level === 'error').length;
    const badge = document.getElementById('issue-badge');
    badge.textContent = issues.length ? String(issues.length) : '0';
    badge.className = 'badge' + (errors ? ' err' : issues.length ? ' warn' : '');
    const label = document.getElementById('file-label');
    label.textContent = this.settings.dataFile ? '\u200E' + this.settings.dataFile + '\u200E' : 'No game_data.json path set';
    label.title = this.settings.dataFile || '';
    label.classList.toggle('dirty', this.dirty);
    this._issues = issues;
  },
  render() {
    this.clampSel();
    this.refreshChrome();
    const t = this.tabs[this.tab];
    if (t) t.render();
  },
  showTab(name) {
    this.tab = name;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
    Tooltip.hide();
    this.render();
  },

  // target: { type: 'node', id } | { type: 'disc', z, o, d, part? } | { type: 'orbital', z, o } | { type: 'zone', z }
  navigate(target) {
    if (!target) return;
    if (target.type === 'node') {
      this.showTab('nodes');
      this.tabs.nodes.reveal(target.id);
      return;
    }
    if (target.type === 'disc') this.sel = { z: target.z, o: target.o, d: target.d, part: target.part || null };
    else if (target.type === 'orbital') this.sel = { z: target.z, o: target.o, d: -1, part: { type: 'orbital' } };
    else if (target.type === 'zone') this.sel = { z: target.z, o: 0, d: 0, part: null };
    this.showTab('discs');
  },

  // ---------- settings, sprites, stats ----------
  async loadSettings() {
    this.settings = await window.api.getSettings();
  },
  async updateSettings(patch) {
    const before = { ...this.settings };
    this.settings = await window.api.setSettings({ ...this.settings, ...patch });
    if (before.spritesDir !== this.settings.spritesDir) await this.refreshSprites();
    if (before.baseStatsScript !== this.settings.baseStatsScript) await this.refreshStats();
    this.refreshChrome();
  },
  async refreshSprites() {
    const r = await window.api.scanSprites(this.settings.spritesDir);
    this.sprites = r.ok ? r.sprites : [];
    this.spriteMap = new Map(this.sprites.map((s) => [s.name, s]));
    this.imageCache.clear();
    return r;
  },
  // Reads stat names from the base stats script.
  // Returns { ok, error?, added: [], removed: [] } compared with the previous list.
  async refreshStats() {
    const before = new Set(this.statNames);
    this.statNames = [];
    this.statSet = null;
    const p = this.settings.baseStatsScript;
    if (!p) return { ok: false, error: 'No base stats script is set.', added: [], removed: [] };
    const r = await window.api.readText(p);
    if (!r.ok) return { ok: false, error: r.error, added: [], removed: [] };
    this.statNames = [...new Set(Parsers.parseBaseStats(r.text).map((s) => s.key))];
    this.statSet = this.statNames.length ? new Set(this.statNames) : null;
    const after = new Set(this.statNames);
    return {
      ok: true,
      added: this.statNames.filter((s) => !before.has(s)),
      removed: [...before].filter((s) => !after.has(s))
    };
  },

  // Re-reads the stat names without any message; redraws if they changed.
  async refreshStatsQuietly() {
    const r = await this.refreshStats();
    if (r.ok && (r.added.length || r.removed.length)) this.render();
  },

  // ---------- files ----------
  async loadFromDisk({ quiet = false } = {}) {
    const p = this.settings.dataFile;
    if (!p) return false;
    const r = await window.api.readText(p);
    if (!r.ok) {
      if (!quiet) Toast.show('Could not read game_data.json: ' + r.error, 'error', 5000);
      return false;
    }
    try {
      this.data = Model.load(r.text);
    } catch (e) {
      Toast.show('game_data.json could not be loaded: ' + e.message, 'error', 6000);
      return false;
    }
    this.undoStack = [];
    this.redoStack = [];
    this.sel = { z: 0, o: 0, d: 0, part: null };
    this.setDirty(false);
    if (!quiet) Toast.show('Loaded game_data.json');
    return true;
  },
  async reload() {
    if (this.dirty && !(await Modal.confirm('Reload from disk?', 'Your unsaved changes will be lost.', 'Reload', true))) return;
    if (await this.loadFromDisk()) this.render();
  },
  async save() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // commit the cell being edited
    let p = this.settings.dataFile;
    if (!p) {
      p = await window.api.pickSaveFile('game_data.json');
      if (!p) return;
      await this.updateSettings({ dataFile: p });
    }
    const text = Model.stringify(Model.normalize(this.data));
    const r = await window.api.writeText(p, text);
    if (!r.ok) return Toast.show('Save failed: ' + r.error, 'error', 6000);
    this.setDirty(false);
    const gmlProblem = await this.writeGml();
    if (gmlProblem) {
      Toast.show('Saved game_data.json, but ' + gmlProblem, 'error', 8000);
      return;
    }
    const errors = (this._issues || []).filter((i) => i.level === 'error').length;
    Toast.show(errors ? `Saved, with ${errors} error${errors > 1 ? 's' : ''} listed under Issues` : 'Saved game_data.json and scr_game_data.gml', errors ? 'warn' : 'ok');
  },

  // Writes scr_game_data.gml for the game. Returns a problem description, or '' when it worked.
  async writeGml() {
    const p = this.settings.gmlScript;
    if (!p) return 'no scr_game_data.gml path is set in Settings, so the game was not updated.';
    if (!(await window.api.exists(p))) {
      return 'scr_game_data.gml was not found. Create an empty script named scr_game_data in GameMaker once, then save again.';
    }
    const gml = Model.toGml(this.data, { spriteNames: this.sprites.length ? new Set(this.spriteMap.keys()) : null });
    const r = await window.api.writeText(p, gml.text, { backup: false });
    if (!r.ok) return 'writing scr_game_data.gml failed: ' + r.error;
    if (gml.warnings.length) {
      const more = gml.warnings.length > 1 ? ` (+${gml.warnings.length - 1} more, see Issues)` : '';
      Toast.show('scr_game_data.gml: ' + gml.warnings[0] + more, 'warn', 9000);
    }
    return '';
  }
};
