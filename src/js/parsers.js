// Readers for the project's current data sources: upgr.csv, the InitNode
// calls in scr_init_nodes.gml, and the array literals in scr_init_disc_data.gml.
// Works in the page (window.Parsers) and in Node (require) for tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Parsers = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Removes // and /* */ comments, leaving string literals untouched.
  function stripGmlComments(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
      const c = src[i];
      const d = src[i + 1];
      if (c === '/' && d === '/') {
        while (i < n && src[i] !== '\n') i++;
        continue;
      }
      if (c === '/' && d === '*') {
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
        i += 2;
        continue;
      }
      if (c === '@' && d === '"') {
        let j = i + 2;
        while (j < n && src[j] !== '"') j++;
        out += src.slice(i, j + 1);
        i = j + 1;
        continue;
      }
      if (c === '"') {
        let j = i + 1;
        while (j < n && src[j] !== '"') {
          if (src[j] === '\\') j++;
          j++;
        }
        out += src.slice(i, j + 1);
        i = j + 1;
        continue;
      }
      out += c;
      i++;
    }
    return out;
  }

  // Given the index of an opening bracket, returns the index of its match.
  function findClosing(src, openIdx) {
    let depth = 0;
    const n = src.length;
    for (let i = openIdx; i < n; i++) {
      const c = src[i];
      if (c === '"') {
        i++;
        while (i < n && src[i] !== '"') {
          if (src[i] === '\\') i++;
          i++;
        }
        continue;
      }
      if (c === '@' && src[i + 1] === '"') {
        i += 2;
        while (i < n && src[i] !== '"') i++;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  // Splits the arguments of a call whose "(" is at openIdx.
  function readCallArgs(src, openIdx) {
    const end = findClosing(src, openIdx);
    if (end < 0) throw new Error('Unclosed call');
    const args = [];
    let depth = 0;
    let start = openIdx + 1;
    for (let i = openIdx + 1; i < end; i++) {
      const c = src[i];
      if (c === '"') {
        i++;
        while (i < end && src[i] !== '"') {
          if (src[i] === '\\') i++;
          i++;
        }
        continue;
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === ',' && depth === 0) {
        args.push(src.slice(start, i).trim());
        start = i + 1;
      }
    }
    const last = src.slice(start, end).trim();
    if (last !== '' || args.length) args.push(last);
    return { args, end };
  }

  function unescapeGml(s) {
    const map = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\' };
    return s.replace(/\\(.)/g, (_, ch) => (ch in map ? map[ch] : ch));
  }

  function decodeArg(raw) {
    if (raw === undefined) return { kind: 'missing' };
    const s = raw.trim();
    let m;
    if ((m = s.match(/^"((?:[^"\\]|\\.)*)"$/s))) return { kind: 'string', value: unescapeGml(m[1]) };
    if ((m = s.match(/^@"([^"]*)"$/s))) return { kind: 'string', value: m[1] };
    if (/^function\b/.test(s)) return { kind: 'function', source: s };
    if (s === 'undefined') return { kind: 'undefined' };
    if (/^-?\d+(\.\d+)?$/.test(s)) return { kind: 'number', value: Number(s) };
    if (/^[A-Za-z_]\w*$/.test(s)) return { kind: 'ident', value: s };
    return { kind: 'expr', source: s };
  }

  // Reads every `key: new InitNode(...)` entry, in source order.
  function parseInitNodes(src) {
    const clean = stripGmlComments(src);
    const re = /([A-Za-z_]\w*)\s*:\s*new\s+InitNode\s*\(/g;
    const nodes = [];
    const warnings = [];
    let m;
    while ((m = re.exec(clean))) {
      const id = m[1];
      const open = m.index + m[0].length - 1;
      let call;
      try {
        call = readCallArgs(clean, open);
      } catch {
        warnings.push(`Could not read the InitNode call for "${id}".`);
        continue;
      }
      re.lastIndex = call.end + 1;
      const a = call.args.map(decodeArg);
      const text = (arg, label) => {
        if (!arg || arg.kind === 'missing' || arg.kind === 'undefined') return '';
        if (arg.kind === 'string') return arg.value;
        warnings.push(`${id}: ${label} is not a plain string (${arg.source || arg.value}); kept as text.`);
        return String(arg.source || arg.value);
      };
      let icon = '';
      if (a[3] && a[3].kind === 'ident') icon = a[3].value;
      else if (a[3] && a[3].kind !== 'missing') warnings.push(`${id}: icon is not a sprite name.`);
      const cb = a[5];
      nodes.push({
        id,
        stat: text(a[0], 'stat id'),
        name: text(a[1], 'display name'),
        keyword: text(a[2], 'keyword'),
        icon,
        desc_suffix: text(a[4], 'description'),
        on_purchase_src: cb && cb.kind !== 'missing' && cb.kind !== 'undefined' ? cb.source || String(cb.value) : null
      });
    }
    return { nodes, warnings };
  }

  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else quoted = false;
        } else field += c;
        continue;
      }
      if (c === '"') quoted = true;
      else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\r') {
        /* skip */
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else field += c;
    }
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  const CSV_STRING_COLUMNS = ['currency', 'cheater_type', 'cheater_req'];

  // Rows with an empty node_key (notes, spacers) are skipped like the game does.
  function parseNodeCsv(text) {
    const rows = parseCsv(text);
    const warnings = [];
    if (!rows.length) return { columns: [], rows: [], warnings: ['CSV is empty.'] };
    const columns = rows[0].map((h) => h.trim());
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const id = (row[0] || '').trim();
      if (!id) continue;
      const values = {};
      for (let c = 1; c < columns.length; c++) {
        const col = columns[c];
        const raw = (row[c] ?? '').trim();
        if (CSV_STRING_COLUMNS.includes(col)) values[col] = raw;
        else {
          const num = raw === '' ? 0 : Number(raw);
          if (Number.isNaN(num)) {
            warnings.push(`CSV row "${id}": column "${col}" is not a number ("${raw}"); used 0.`);
            values[col] = 0;
          } else values[col] = num;
        }
      }
      out.push({ id, values });
    }
    return { columns, rows: out, warnings };
  }

  // Reads `global.<name> = [ ... ]` (or { ... }) as JSON.
  function parseGmlLiteral(src, name) {
    const clean = stripGmlComments(src);
    const re = new RegExp('global\\.' + name + '\\s*=\\s*([\\[{])');
    const m = re.exec(clean);
    if (!m) throw new Error(`global.${name} not found`);
    const open = m.index + m[0].length - 1;
    const close = findClosing(clean, open);
    if (close < 0) throw new Error(`global.${name} is not closed`);
    const body = clean.slice(open, close + 1).replace(/,(\s*[\]}])/g, '$1');
    return JSON.parse(body);
  }

  // Reads the keys and values of `global.base_stats = { ... }`.
  function parseBaseStats(src) {
    const clean = stripGmlComments(src);
    const m = /global\.base_stats\s*=\s*\{/.exec(clean);
    if (!m) return [];
    const open = m.index + m[0].length - 1;
    const close = findClosing(clean, open);
    const body = clean.slice(open + 1, close);
    const stats = [];
    const re = /([A-Za-z_]\w*)\s*:\s*([^,\n]+)/g;
    let e;
    while ((e = re.exec(body))) {
      const rawValue = e[2].trim();
      let value = rawValue;
      const div = rawValue.match(/^(-?[\d.]+)\s*\/\s*(-?[\d.]+)$/);
      if (div) value = Number(div[1]) / Number(div[2]);
      else if (rawValue !== '' && !Number.isNaN(Number(rawValue))) value = Number(rawValue);
      stats.push({ key: e[1], value });
    }
    return stats;
  }

  return { stripGmlComments, parseInitNodes, parseCsv, parseNodeCsv, parseGmlLiteral, parseBaseStats };
});
