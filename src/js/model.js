// The game_data.json model: shape, import from the old files, validation,
// and serialization. Works in the page (window.Model) and in Node for tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Model = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA_VERSION = 1;

  // `op` names match the old CSV column names so mapping back is obvious.
  const OPS = ['incr', 'pct', 'pct_add', 'mult', 'activate', 'none'];
  const OP_COLUMNS = ['incr', 'pct', 'pct_add', 'activate', 'mult'];
  const OP_DEFAULTS = { incr: 0, pct: 0, pct_add: 0, activate: 0, mult: 1 };
  // Same priority order as the description builder in scr_init_nodes.
  const OP_PRIORITY = ['activate', 'incr', 'pct', 'pct_add', 'mult'];

  const NODE_FIELDS = [
    'id', 'name', 'stat', 'op', 'value', 'keyword', 'desc_suffix', 'icon',
    'currency', 'cost_base', 'cost_incr', 'max_level', 'cheater', 'cheater_type', 'cheater_req'
  ];
  const NUMBER_FIELDS = ['value', 'cost_base', 'cost_incr', 'max_level', 'cheater'];

  function newNode(id) {
    return {
      id, name: '', stat: 'dummy', op: 'incr', value: 0, keyword: '', desc_suffix: '', icon: '',
      currency: 'dollars', cost_base: 1, cost_incr: 0, max_level: 1,
      cheater: -1, cheater_type: '-1', cheater_req: '-1'
    };
  }

  function newDisc(id, sectorCount = 2) {
    const sectors = [];
    for (let i = 0; i < sectorCount; i++) sectors.push({ rings: [{ nodes: [null] }] });
    return { id, center: null, sectors };
  }

  function emptyData() {
    return { schema_version: SCHEMA_VERSION, frozen_ids: [], nodes: [], zones: [] };
  }

  // Collapses the five modifier columns into one op/value pair.
  function opFromColumns(values) {
    const v = {};
    for (const c of OP_COLUMNS) v[c] = values[c] === undefined ? OP_DEFAULTS[c] : Number(values[c]);
    const set = OP_PRIORITY.filter((c) => v[c] !== OP_DEFAULTS[c]);
    if (!set.length) return { op: 'none', value: 0, conflicts: [] };
    return { op: set[0], value: v[set[0]], conflicts: set.length > 1 ? set : [] };
  }

  // Expands op/value back into the old five columns (for the game loader later).
  function columnsFromOp(node) {
    const out = { ...OP_DEFAULTS };
    if (node.op && node.op !== 'none' && node.op in out) out[node.op] = Number(node.value) || 0;
    return out;
  }

  function fmtNum(x) {
    return String(Number(Number(x).toFixed(6)));
  }

  // Mirrors the description builder in scr_init_nodes (number formatting is approximate).
  function describe(node) {
    const c = columnsFromOp(node);
    const kw = node.keyword || '';
    let boost;
    if (c.activate === 1) boost = kw;
    else if (c.incr !== 0) boost = (c.incr > 0 ? '+' : '') + fmtNum(c.incr) + ' ' + kw;
    else if (c.pct !== 0) boost = (c.pct > 0 ? '+' : '') + fmtNum(c.pct * 100) + '% ' + kw;
    else if (c.pct_add !== 0) boost = (c.pct_add > 0 ? '+' : '') + fmtNum(c.pct_add * 100) + '% ' + kw;
    else if (c.mult !== 1) boost = 'x' + fmtNum(c.mult) + ' ' + kw;
    else boost = '? to ' + kw;
    return boost + (node.desc_suffix || '');
  }

  function stripTags(s) {
    return String(s || '').replace(/\[[^\]]*\]/g, '');
  }

  // Builds game_data from the parsed old sources.
  // input: { initNodes, csv, hierarchy, clustering, discFiles: { "z_i": json | null } }
  function importData(input) {
    const log = [];
    const callbacks = [];
    const data = emptyData();
    const csvById = new Map();
    for (const row of input.csv.rows) {
      if (csvById.has(row.id)) log.push(`CSV has "${row.id}" more than once; the last row was used.`);
      csvById.set(row.id, row);
    }
    const known = new Set(['node_key', ...OP_COLUMNS, 'currency', 'cost_base', 'cost_incr', 'max_level', 'cheater', 'cheater_type', 'cheater_req']);
    for (const col of input.csv.columns) {
      if (!known.has(col)) log.push(`CSV column "${col}" is not handled by the tool and was ignored.`);
    }

    const seen = new Set();
    const buildNode = (id, init, row) => {
      const node = newNode(id);
      if (init) {
        node.name = init.name;
        node.stat = init.stat;
        node.keyword = init.keyword;
        node.icon = init.icon;
        node.desc_suffix = init.desc_suffix;
        if (init.on_purchase_src) callbacks.push({ id, source: init.on_purchase_src });
      }
      if (row) {
        const v = row.values;
        const op = opFromColumns(v);
        node.op = op.op;
        node.value = op.value;
        if (op.conflicts.length) {
          log.push(`"${id}" sets more than one modifier column (${op.conflicts.join(', ')}); kept "${op.op}" (the one the description uses).`);
        }
        for (const f of ['currency', 'cheater_type', 'cheater_req']) if (f in v) node[f] = v[f];
        for (const f of ['cost_base', 'cost_incr', 'max_level', 'cheater']) if (f in v) node[f] = v[f];
      }
      return node;
    };

    for (const init of input.initNodes) {
      if (seen.has(init.id)) {
        log.push(`scr_init_nodes defines "${init.id}" more than once; the first was kept.`);
        continue;
      }
      seen.add(init.id);
      const row = csvById.get(init.id);
      if (!row) log.push(`"${init.id}" has no row in upgr.csv; cost and modifier fields use defaults.`);
      data.nodes.push(buildNode(init.id, init, row));
    }
    for (const row of input.csv.rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      log.push(`"${row.id}" is in upgr.csv but not in scr_init_nodes; added with empty name and icon.`);
      data.nodes.push(buildNode(row.id, null, row));
    }

    const hierarchy = input.hierarchy || [];
    const clustering = input.clustering || [];
    if (clustering.length > hierarchy.length) {
      log.push(`orbital_clustering lists ${clustering.length} zones but disc_hierarchy has ${hierarchy.length}; the extra clustering entries were dropped.`);
    }
    hierarchy.forEach((orbitalCounts, z) => {
      const zone = { orbitals: [] };
      let discIndex = 0;
      orbitalCounts.forEach((count, o) => {
        const c = clustering[z] ? clustering[z][o] : undefined;
        const orbital = { cluster_dir: typeof c === 'number' ? c : null, discs: [] };
        for (let k = 0; k < count; k++, discIndex++) {
          const id = `z${z}_d${discIndex}`;
          const file = input.discFiles[`${z}_${discIndex}`];
          if (!file) {
            log.push(`disc_${z}_${discIndex}.json was not found; added an empty disc "${id}" in its place.`);
            orbital.discs.push({ id, center: null, sectors: [] });
            continue;
          }
          orbital.discs.push({
            id,
            center: file.center_node || null,
            sectors: (file.disc || []).map((sector) => ({
              rings: (sector || []).map((ring) => ({ nodes: (ring || []).map((n) => n || null) }))
            }))
          });
        }
        zone.orbitals.push(orbital);
      });
      data.zones.push(zone);
    });

    data.frozen_ids = data.nodes.map((n) => n.id);
    return { data, log, callbacks };
  }

  // Every place a node id is used in the layout.
  function placements(data) {
    const map = new Map();
    const add = (id, p) => {
      if (!id) return;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(p);
    };
    data.zones.forEach((zone, z) =>
      zone.orbitals.forEach((orb, o) =>
        orb.discs.forEach((disc, d) => {
          add(disc.center, { z, o, d, disc: disc.id, type: 'center' });
          disc.sectors.forEach((sec, s) =>
            sec.rings.forEach((ring, r) =>
              ring.nodes.forEach((id, k) => add(id, { z, o, d, disc: disc.id, type: 'slot', s, r, k }))
            )
          );
        })
      )
    );
    return map;
  }

  function describePlacement(p) {
    if (!p) return '';
    return p.type === 'center' ? `${p.disc} · center` : `${p.disc} · S${p.s + 1} R${p.r + 1}`;
  }

  // ctx: { spriteNames: Set | null, statNames: Set | null }
  function validate(data, ctx = {}) {
    const issues = [];
    const err = (msg, target) => issues.push({ level: 'error', msg, target });
    const warn = (msg, target) => issues.push({ level: 'warn', msg, target });

    const ids = new Map();
    data.nodes.forEach((n) => ids.set(n.id, (ids.get(n.id) || 0) + 1));
    for (const [id, count] of ids) if (count > 1) err(`Node id "${id}" is defined ${count} times.`, { type: 'node', id });

    for (const id of data.frozen_ids || []) {
      if (!ids.has(id)) err(`"${id}" was deleted or renamed, but it is a save key from the demo.`, null);
    }

    const placed = placements(data);
    for (const n of data.nodes) {
      const t = { type: 'node', id: n.id };
      if (!/^[A-Za-z_]\w*$/.test(n.id)) err(`"${n.id}" is not a valid id (letters, digits, underscores).`, t);
      const p = placed.get(n.id);
      if (!p) warn(`"${n.id}" is not placed on any disc.`, t);
      else if (p.length > 1) err(`"${n.id}" is placed ${p.length} times (${p.map(describePlacement).join(', ')}).`, t);
      if (!n.name) warn(`"${n.id}" has no display name.`, t);
      if (!n.icon) warn(`"${n.id}" has no icon.`, t);
      else if (ctx.spriteNames && !ctx.spriteNames.has(n.icon)) err(`"${n.id}" uses icon "${n.icon}", which is not in the sprite folder.`, t);
      if (!n.stat) err(`"${n.id}" has no stat.`, t);
      else if (ctx.statNames && n.stat !== 'dummy' && !ctx.statNames.has(n.stat)) warn(`"${n.id}" uses stat "${n.stat}", which is not in base stats.`, t);
      if (!OPS.includes(n.op)) err(`"${n.id}" has an unknown op "${n.op}".`, t);
      if (!n.currency) warn(`"${n.id}" has no currency.`, t);
      for (const f of NUMBER_FIELDS) {
        if (typeof n[f] !== 'number' || Number.isNaN(n[f])) err(`"${n.id}": ${f} is not a number.`, t);
      }
    }

    data.zones.forEach((zone, z) => {
      if (!zone.orbitals.length) warn(`Zone ${z + 1} has no orbitals.`, { type: 'zone', z });
      zone.orbitals.forEach((orb, o) => {
        if (!orb.discs.length) warn(`Zone ${z + 1}, orbital ${o} has no discs.`, { type: 'orbital', z, o });
        orb.discs.forEach((disc, d) => {
          const base = { type: 'disc', z, o, d };
          if (!disc.center) warn(`${disc.id} has no center node.`, { ...base, part: { type: 'center' } });
          else if (!ids.has(disc.center)) err(`${disc.id} center uses "${disc.center}", which is not a node.`, { ...base, part: { type: 'center' } });
          if (!disc.sectors.length) warn(`${disc.id} has no sectors.`, base);
          disc.sectors.forEach((sec, s) => {
            if (!sec.rings.length) warn(`${disc.id} sector ${s + 1} has no rings.`, base);
            sec.rings.forEach((ring, r) => {
              if (!ring.nodes.length) warn(`${disc.id} S${s + 1} R${r + 1} has no slots.`, base);
              ring.nodes.forEach((id, k) => {
                const part = { type: 'slot', s, r, k };
                if (!id) warn(`${disc.id} S${s + 1} R${r + 1} has an empty slot.`, { ...base, part });
                else if (!ids.has(id)) err(`${disc.id} S${s + 1} R${r + 1} uses "${id}", which is not a node.`, { ...base, part });
              });
            });
          });
        });
      });
    });

    const discIds = new Map();
    data.zones.forEach((zone) => zone.orbitals.forEach((orb) => orb.discs.forEach((disc) => discIds.set(disc.id, (discIds.get(disc.id) || 0) + 1))));
    for (const [id, count] of discIds) if (count > 1) err(`Disc id "${id}" is used ${count} times.`, null);

    return issues;
  }

  // Puts fields in a stable order so diffs stay readable.
  function normalize(data) {
    const nodes = data.nodes.map((n) => {
      const out = {};
      for (const f of NODE_FIELDS) out[f] = n[f] === undefined ? newNode(n.id)[f] : n[f];
      for (const k of Object.keys(n)) if (!(k in out)) out[k] = n[k];
      return out;
    });
    const zones = data.zones.map((zone) => ({
      ...zone,
      orbitals: zone.orbitals.map((orb) => ({
        cluster_dir: orb.cluster_dir ?? null,
        ...orb,
        discs: orb.discs.map((disc) => ({
          id: disc.id,
          center: disc.center ?? null,
          ...disc,
          sectors: disc.sectors.map((sec) => ({ ...sec, rings: sec.rings.map((ring) => ({ ...ring, nodes: ring.nodes.map((x) => x || null) })) }))
        }))
      }))
    }));
    return { schema_version: SCHEMA_VERSION, nodes, zones, frozen_ids: [...(data.frozen_ids || [])] };
  }

  function load(text) {
    const raw = JSON.parse(text);
    if (typeof raw !== 'object' || !raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.zones)) {
      throw new Error('This file does not look like game_data.json (missing nodes or zones).');
    }
    if ((raw.schema_version || 0) > SCHEMA_VERSION) {
      throw new Error(`This file uses schema version ${raw.schema_version}, newer than this tool supports (${SCHEMA_VERSION}).`);
    }
    raw.frozen_ids = raw.frozen_ids || [];
    return normalize(raw);
  }

  // JSON with short arrays/objects kept on one line.
  function stringify(value) {
    const fmt = (v, ind) => {
      const flat = JSON.stringify(v);
      if (flat === undefined) return 'null';
      if (v === null || typeof v !== 'object' || flat.length <= 88) return flat;
      const next = ind + '  ';
      if (Array.isArray(v)) return '[\n' + v.map((x) => next + fmt(x, next)).join(',\n') + '\n' + ind + ']';
      const keys = Object.keys(v).filter((k) => v[k] !== undefined);
      return '{\n' + keys.map((k) => next + JSON.stringify(k) + ': ' + fmt(v[k], next)).join(',\n') + '\n' + ind + '}';
    };
    return fmt(value, '') + '\n';
  }

  // ---------- GML export ----------
  const GML_IDENT = /^[A-Za-z_]\w*$/;

  function gmlString(s) {
    return '"' + String(s)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t')
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') + '"';
  }

  // Words GML won't accept as a struct field name in a literal.
  const GML_RESERVED = new Set([
    'if', 'else', 'while', 'do', 'for', 'repeat', 'switch', 'case', 'default', 'break', 'continue',
    'exit', 'return', 'function', 'var', 'globalvar', 'global', 'self', 'other', 'all', 'noone',
    'new', 'delete', 'with', 'enum', 'try', 'catch', 'finally', 'throw', 'static', 'constructor',
    'true', 'false', 'undefined', 'not', 'and', 'or', 'xor', 'div', 'mod', 'begin', 'end', 'then', 'until'
  ]);

  // GML number literals have no exponent notation, and whole numbers past 32 bits become
  // int64 (which overflows past ~9.2e18). So:
  //   - very large or very small numbers are written as (mantissa * power(10, exponent))
  //   - whole numbers of 2^31 and up are wrapped in real() so they stay ordinary reals
  function gmlNumber(n) {
    if (!Number.isFinite(n)) return '0';
    const a = Math.abs(n);
    if (a !== 0 && (a < 1e-6 || a >= 2 ** 53)) {
      const [mantissa, exponent] = n.toExponential().split('e');
      return '(' + mantissa + ' * power(10, ' + Number(exponent) + '))';
    }
    const s = String(n);
    if (Number.isInteger(n) && a >= 2 ** 31) return 'real(' + s + ')';
    return s;
  }

  // Writes game_data as a GML script that returns the same data as a struct literal.
  // Node and disc `id` fields are written as `key` (id is a built-in variable name in GML).
  // Icons in spriteNames are written as sprite references so the compiler sees them
  // (and never strips them as unused); others are written as strings.
  // opts: { spriteNames: Set | null, stamp: string }
  function toGml(data, opts = {}) {
    const d = normalize(data);
    const warnings = [];
    const sprites = opts.spriteNames || null;
    const stamp = opts.stamp || new Date().toISOString();

    const value = (v) => {
      if (v === null || v === undefined) return 'undefined';
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) warnings.push('A value that is not a number was written as 0.');
        return gmlNumber(v);
      }
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      if (typeof v === 'string') return gmlString(v);
      if (Array.isArray(v)) return '[' + v.map(value).join(', ') + ']';
      return struct(v);
    };
    const struct = (o, special = {}) => {
      const parts = [];
      for (const k of Object.keys(o)) {
        if (o[k] === undefined) continue;
        const outKey = k === 'id' ? 'key' : k;
        if (!GML_IDENT.test(outKey) || GML_RESERVED.has(outKey)) {
          warnings.push(`Field "${k}" can't be a GML field name and was left out of scr_game_data.gml.`);
          continue;
        }
        parts.push(outKey + ': ' + (special[k] ? special[k](o[k]) : value(o[k])));
      }
      return '{ ' + parts.join(', ') + ' }';
    };
    if (!sprites) warnings.push('The sprite folder is not loaded, so every icon was written as a name and looked up at runtime. Set the sprite folder in Settings and save again.');
    const icon = (name) => {
      if (!name) return '""';
      if (sprites && sprites.has(name) && GML_IDENT.test(name) && !GML_RESERVED.has(name)) return name;
      if (sprites) warnings.push(`Icon "${name}" is not in the sprite folder; written as a name and looked up at runtime.`);
      return gmlString(name);
    };

    const nodeLines = d.nodes.map((n) => '\t\t\t' + struct(n, { icon }));
    const discText = (disc) => struct(disc);
    const zoneLines = d.zones.map((zone) => {
      const orbs = zone.orbitals.map((orb) => {
        const discs = orb.discs.map((disc) => '\t\t\t\t\t' + discText(disc));
        return '\t\t\t\t{ cluster_dir: ' + value(orb.cluster_dir) + ', discs: [\n' + discs.join(',\n') + (discs.length ? '\n' : '') + '\t\t\t\t] }';
      });
      return '\t\t\t{ orbitals: [\n' + orbs.join(',\n') + (orbs.length ? '\n' : '') + '\t\t\t] }';
    });

    const text = [
      '// GENERATED by the BTTW Data Tool from game_data.json. Do not edit by hand:',
      '// every save in the tool overwrites this file. Read by scr_game_data_loader.',
      '// Node and disc ids are stored as `key`.',
      '',
      '/// Changes on every save; the loader polls it to live-reload while running from the IDE.',
      'function game_data_stamp() {',
      '\tif (live_call()) return live_result;',
      '\treturn ' + gmlString(stamp) + ';',
      '}',
      '',
      '/// All upgrade nodes and the disc layout.',
      'function game_data_get() {',
      '\tif (live_call()) return live_result;',
      '\treturn {',
      '\t\tschema_version: ' + SCHEMA_VERSION + ',',
      '\t\tnodes: [',
      nodeLines.join(',\n'),
      '\t\t],',
      '\t\tzones: [',
      zoneLines.join(',\n'),
      '\t\t]',
      '\t};',
      '}',
      ''
    ].join('\n');
    return { text, warnings: [...new Set(warnings)] };
  }

  // "buster_force_5" -> { base: "buster_force", num: 5 }; ids without a trailing number have num null.
  function splitSeries(id) {
    const m = String(id).match(/^(.*)_(\d+)$/);
    return m ? { base: m[1], num: Number(m[2]) } : { base: String(id), num: null };
  }

  // The next free id in a series: one past the highest existing number (base_0 if none).
  function nextInSeries(ids, base) {
    let max = -1;
    for (const id of ids) {
      const s = splitSeries(id);
      if (s.base === base && s.num !== null) max = Math.max(max, s.num);
    }
    const taken = new Set(ids);
    let n = max + 1;
    while (taken.has(`${base}_${n}`)) n++;
    return `${base}_${n}`;
  }

  // Placeholder node: "Dummy" name, the dummy stat, and the next-zone icon.
  function dummyNode(id) {
    return {
      ...newNode(id),
      name: 'Dummy', stat: 'dummy', op: 'activate', value: 1, keyword: 'Dummy',
      icon: 'spr_next_zone_icon', currency: 'dollars', cost_base: 1, cost_incr: 0, max_level: 1
    };
  }

  function nextDiscId(data, z) {
    const used = new Set();
    data.zones.forEach((zone) => zone.orbitals.forEach((orb) => orb.discs.forEach((d) => used.add(d.id))));
    let k = 0;
    while (used.has(`z${z}_d${k}`)) k++;
    return `z${z}_d${k}`;
  }

  return {
    SCHEMA_VERSION, OPS, OP_COLUMNS, NODE_FIELDS, NUMBER_FIELDS,
    newNode, newDisc, emptyData, opFromColumns, columnsFromOp, describe, stripTags,
    importData, placements, describePlacement, validate, normalize, load, stringify, toGml, nextDiscId,
    splitSeries, nextInSeries, dummyNode
  };
});
