// Checks the importers against a GameMaker project without changing anything.
// Usage: npm test -- <path to your GameMaker project folder>
const fs = require('fs'); const path = require('path');
const P = require('../src/js/parsers'); const M = require('../src/js/model');
const dir = process.argv[2];
if (!dir) { console.log('Usage: npm test -- <path to your GameMaker project folder>'); process.exit(1); }
const rd = (...p) => fs.readFileSync(path.join(dir, ...p), 'utf8');
const init = P.parseInitNodes(rd('scripts/scr_init_nodes/scr_init_nodes.gml'));
const csv = P.parseNodeCsv(rd('datafiles/upgr_dat/upgr.csv'));
const ddSrc = rd('scripts/scr_init_disc_data/scr_init_disc_data.gml');
const hierarchy = P.parseGmlLiteral(ddSrc, 'disc_hierarchy');
const clustering = P.parseGmlLiteral(ddSrc, 'orbital_clustering');
const discFiles = {};
hierarchy.forEach((orbs, z) => { const n = orbs.reduce((a, b) => a + b, 0); for (let i = 0; i < n; i++) { const f = path.join(dir, 'datafiles/nodes_dat', `disc_${z}_${i}.json`); discFiles[`${z}_${i}`] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; } });
const stats = P.parseBaseStats(rd('scripts/scr_init_base_stats/scr_init_base_stats.gml'));
const res = M.importData({ initNodes: init.nodes, csv, hierarchy, clustering, discFiles });
console.log('InitNodes:', init.nodes.length, 'warnings:', init.warnings);
console.log('CSV rows:', csv.rows.length, 'cols:', csv.columns.join(','), 'warnings:', csv.warnings);
console.log('hierarchy', JSON.stringify(hierarchy), 'clustering', JSON.stringify(clustering));
console.log('base stats:', stats.length, stats.find(s => s.key === 'buster_rate'));
console.log('nodes:', res.data.nodes.length, 'callbacks:', res.callbacks.map(c => c.id).join(', '));
console.log('LOG:\n ' + res.log.join('\n '));
const issues = M.validate(res.data, { statNames: new Set(stats.map(s => s.key)) });
console.log('issues:', issues.length, 'errors:', issues.filter(i => i.level === 'error').map(i => i.msg));
// Round-trip: op/value back to columns must equal the CSV for every row
let mismatch = 0;
for (const row of csv.rows) { const n = res.data.nodes.find(x => x.id === row.id); const c = M.columnsFromOp(n); for (const k of M.OP_COLUMNS) if (c[k] !== row.values[k]) { mismatch++; console.log('MISMATCH', row.id, k, c[k], row.values[k]); } }
console.log('op round-trip mismatches:', mismatch);
const text = M.stringify(M.normalize(res.data));
const back = M.load(text);
console.log('stringify/load stable:', M.stringify(back) === text);
console.log(res.data.nodes.find(n => n.id === 'wall_hp_0'));
console.log(M.describe(res.data.nodes.find(n => n.id === 'wall_hp_0')));
