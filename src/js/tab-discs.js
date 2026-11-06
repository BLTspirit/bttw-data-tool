// Discs tab: zone/orbital/disc tree, a canvas disc editor, and an inspector.
'use strict';

const GEO = {
  R0: 46,          // center circle radius
  W: 62,           // ring thickness
  G: 7,            // radial gap between rings
  SECTOR_GAP: 10,  // gap between sectors (px at scale 1)
  SLOT_GAP: 4,     // gap between slots in the same ring
  START: -Math.PI / 2 // sectors start at 12 o'clock
};

// Sectors, and slots within a ring, run counter-clockwise like the in-game discs.
// Geometry is worked out clockwise, then mirrored left-to-right with mir().
const mir = (a) => Math.PI - a;

const COLORS = {
  cellFill: '#2b2b2b', cellStroke: '#5c5c5c',
  emptyFill: '#1c1c1c', emptyStroke: '#8a3f3a',
  hoverFill: '#363636',
  selFill: '#3c2a48', selStroke: '#c06ae8',
  dropStroke: '#5fd37b', badStroke: '#e2a93e',
  spoke: '#6f6a62', text: '#9a9a9a'
};

const DiscsTab = {
  built: false,
  hover: null,
  dropTarget: null,
  drag: null,
  unplacedQuery: '',

  build() {
    const root = document.getElementById('tab-discs');
    this.treeEl = h('div', { class: 'disc-tree' });
    this.titleEl = h('div', { style: { fontWeight: 600 } });
    this.stageTools = h('div', { class: 'toolbar' }, this.titleEl, h('div', { class: 'spacer' }),
      h('button', { onclick: () => this.addSector() }, '+ Sector'));
    this.canvas = h('canvas');
    this.hint = h('div', { class: 'canvas-hint' }, 'Click a slot or the center to edit it · drag a slot onto another to swap · drag nodes in from the right · Delete clears a slot');
    this.emptyEl = h('div', { class: 'empty-state', hidden: true });
    this.canvasWrap = h('div', { class: 'canvas-wrap' }, this.canvas, this.hint);
    this.stage = h('div', { class: 'disc-stage' }, this.stageTools, this.canvasWrap, this.emptyEl);
    this.inspEl = h('div', { class: 'inspector' });
    root.append(this.treeEl, this.stage, this.inspEl);
    this.ctx = this.canvas.getContext('2d');

    new ResizeObserver(() => this.draw()).observe(this.canvasWrap);
    const c = this.canvas;
    c.addEventListener('mousemove', (e) => this.onMouseMove(e));
    c.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    c.addEventListener('mouseleave', () => { this.hover = null; Tooltip.hide(); this.draw(); });
    c.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const hit = this.hitTest(e);
      if (!sameTarget(hit, this.dropTarget)) { this.dropTarget = hit; this.draw(); }
    });
    c.addEventListener('dragleave', () => { this.dropTarget = null; this.draw(); });
    c.addEventListener('drop', (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      const hit = this.hitTest(e);
      this.dropTarget = null;
      if (id && hit) {
        App.sel.part = hit;
        this.assign(id, hit);
      } else this.draw();
    });
    this.built = true;
  },

  render() {
    if (!this.built) this.build();
    this.renderTree();
    this.renderStage();
    this.renderInspector();
  },

  // ---------------- tree ----------------
  renderTree() {
    const sel = App.sel;
    const zones = App.data.zones;
    const act = (label, title, fn, cls = '') => h('button', {
      class: 'small ' + cls, title,
      onclick: (e) => { e.stopPropagation(); fn(); }
    }, label);

    const out = zones.map((zone, z) => h('div', { class: 'tree-zone' },
      h('div', { class: 'tree-zone-head', onclick: () => App.navigate({ type: 'zone', z }) },
        h('span', { class: 'spacer' }, `Zone ${z + 1}`),
        h('span', { class: 'tree-actions' },
          act('+ Orbital', 'Add an orbital to the end of this zone', () => this.addOrbital(z, zone.orbitals.length - 1)),
          act('✕', 'Delete zone', () => this.deleteZone(z), 'danger'))),
      zone.orbitals.map((orb, o) => [
        h('div', {
          class: 'tree-orb-head' + (sel.z === z && sel.o === o && sel.part && sel.part.type === 'orbital' ? ' selected' : ''),
          onclick: () => App.navigate({ type: 'orbital', z, o })
        },
          h('span', { class: 'spacer' }, `Orbital ${o}`, orb.cluster_dir != null ? ` · cluster ${orb.cluster_dir}°` : ''),
          h('span', { class: 'tree-actions' },
            act('+ Disc', 'Add a disc to this orbital', () => this.addDisc(z, o)),
            act('↑', 'Move orbital up', () => this.moveOrbital(z, o, -1)),
            act('↓', 'Move orbital down', () => this.moveOrbital(z, o, 1)),
            act('✕', 'Delete orbital', () => this.deleteOrbital(z, o), 'danger'))),
        orb.discs.map((disc, d) => {
          const isSel = sel.z === z && sel.o === o && sel.d === d && !(sel.part && sel.part.type === 'orbital');
          const center = App.node(disc.center);
          return h('div', { class: 'tree-disc' + (isSel ? ' selected' : ''), onclick: () => App.navigate({ type: 'disc', z, o, d }) },
            h('span', { class: 'label' }, disc.id, ' ', h('small', null, center ? center.name : disc.center ? disc.center : '(no center)')),
            h('span', { class: 'tree-actions' },
              act('↑', 'Move disc up (crosses into the previous orbital at the top)', () => this.moveDisc(z, o, d, -1)),
              act('↓', 'Move disc down (crosses into the next orbital at the bottom)', () => this.moveDisc(z, o, d, 1)),
              act('⧉', 'Duplicate layout (empty slots)', () => this.duplicateDisc(z, o, d)),
              act('✕', 'Delete disc', () => this.deleteDisc(z, o, d), 'danger')));
        })
      ])
    ));
    out.push(h('div', { class: 'tree-foot' }, h('button', { class: 'small', onclick: () => this.addZone() }, '+ Zone')));
    this.treeEl.replaceChildren(...out);
    const selected = this.treeEl.querySelector('.selected');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  },

  // ---------------- stage ----------------
  renderStage() {
    const disc = App.disc();
    const hasDisc = !!disc && App.sel.d >= 0;
    this.canvasWrap.hidden = !hasDisc;
    this.stageTools.hidden = !hasDisc;
    this.emptyEl.hidden = hasDisc;
    if (!hasDisc) {
      this.emptyEl.replaceChildren(...[
        h('h2', null, App.data.zones.length ? 'Select a disc' : 'No discs yet'),
        h('p', null, App.data.zones.length ? 'Pick a disc on the left, or add one with + Disc on an orbital.' : 'Add a zone to start a layout.'),
        App.data.zones.length ? null : h('button', { onclick: () => this.addZone() }, '+ Zone')].filter(Boolean));
      return;
    }
    const counts = discCounts(disc);
    this.titleEl.replaceChildren(`${disc.id}`, h('span', { class: 'muted', style: { fontWeight: 400, marginLeft: '10px' } },
      `Zone ${App.sel.z + 1} · Orbital ${App.sel.o} · ${disc.sectors.length} sector${disc.sectors.length === 1 ? '' : 's'} · ${counts.filled} of ${counts.slots} slots filled · center ${disc.center ? 'set' : 'empty'}`));
    this.draw();
  },

  layout() {
    const disc = App.disc();
    const w = this.canvasWrap.clientWidth;
    const hgt = this.canvasWrap.clientHeight;
    const maxRings = Math.max(1, ...(disc ? disc.sectors.map((s) => s.rings.length) : [1]));
    const outer = GEO.R0 + GEO.G + maxRings * (GEO.W + GEO.G) + 18;
    const scale = Math.min(2.2, (Math.min(w, hgt) / 2 - 24) / outer);
    return { w, h: hgt, cx: w / 2, cy: hgt / 2 - 6, scale: Math.max(0.2, scale), maxRings, outer };
  },

  ringRadii(r) {
    const r0 = GEO.R0 + GEO.G + r * (GEO.W + GEO.G);
    return [r0, r0 + GEO.W];
  },

  draw() {
    if (!this.built || App.tab !== 'discs') return;
    const disc = App.disc();
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const L = this.layout();
    if (c.width !== Math.round(L.w * dpr) || c.height !== Math.round(L.h * dpr)) {
      c.width = Math.round(L.w * dpr);
      c.height = Math.round(L.h * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L.w, L.h);
    if (!disc || App.sel.d < 0) return;
    this.L = L;
    const S = L.scale;
    const n = disc.sectors.length;

    // spokes along sector boundaries, like the in-game discs
    if (n > 1) {
      ctx.strokeStyle = COLORS.spoke;
      ctx.fillStyle = COLORS.spoke;
      ctx.lineWidth = 3;
      for (let s = 0; s < n; s++) {
        const a = mir(GEO.START + (s * 2 * Math.PI) / n);
        const rIn = (GEO.R0 + 4) * S;
        const rOut = (L.outer - 6) * S;
        ctx.beginPath();
        ctx.moveTo(L.cx + Math.cos(a) * rIn, L.cy + Math.sin(a) * rIn);
        ctx.lineTo(L.cx + Math.cos(a) * rOut, L.cy + Math.sin(a) * rOut);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(L.cx + Math.cos(a) * rOut, L.cy + Math.sin(a) * rOut, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const secAng = (2 * Math.PI) / Math.max(1, n);
    disc.sectors.forEach((sec, s) => {
      sec.rings.forEach((ring, r) => {
        const [r0, r1] = this.ringRadii(r);
        const count = ring.nodes.length;
        if (!count) return;
        const slotAng = secAng / count;
        ring.nodes.forEach((id, k) => {
          const a0 = GEO.START + s * secAng + k * slotAng;
          const a1 = a0 + slotAng;
          const gs = (k === 0 ? GEO.SECTOR_GAP : GEO.SLOT_GAP) / 2;
          const ge = (k === count - 1 ? GEO.SECTOR_GAP : GEO.SLOT_GAP) / 2;
          const part = { type: 'slot', s, r, k };
          this.drawCell(L, r0, r1, a0, a1, gs, ge, id, part, n === 1 && count === 1);
        });
      });
    });

    // center
    const part = { type: 'center' };
    const isSel = sameTarget(App.sel.part, part);
    const isHover = sameTarget(this.hover, part);
    const isDrop = sameTarget(this.dropTarget, part) || (this.drag && this.drag.moved && sameTarget(this.drag.over, part));
    ctx.beginPath();
    ctx.arc(L.cx, L.cy, GEO.R0 * S, 0, Math.PI * 2);
    ctx.fillStyle = isSel ? COLORS.selFill : isHover ? COLORS.hoverFill : disc.center ? COLORS.cellFill : COLORS.emptyFill;
    ctx.fill();
    ctx.lineWidth = isSel || isDrop ? 3 : 2;
    ctx.setLineDash(disc.center ? [] : [6, 4]);
    ctx.strokeStyle = isDrop ? COLORS.dropStroke : isSel ? COLORS.selStroke : disc.center && !App.node(disc.center) ? COLORS.badStroke : disc.center ? COLORS.cellStroke : COLORS.emptyStroke;
    ctx.stroke();
    ctx.setLineDash([]);
    this.drawContent(L.cx, L.cy, Math.min(GEO.R0 * 1.1 * S, 56), disc.center);
  },

  drawCell(L, r0, r1, a0, a1, gs, ge, id, part, full) {
    const ctx = this.ctx;
    const S = L.scale;
    const R0 = r0 * S;
    const R1 = r1 * S;
    ctx.beginPath();
    if (full) {
      ctx.arc(L.cx, L.cy, R1, 0, Math.PI * 2);
      ctx.moveTo(L.cx + R0, L.cy);
      ctx.arc(L.cx, L.cy, R0, Math.PI * 2, 0, true);
    } else {
      ctx.arc(L.cx, L.cy, R1, mir(a0 + gs / r1), mir(a1 - ge / r1), true);
      ctx.arc(L.cx, L.cy, R0, mir(a1 - ge / r0), mir(a0 + gs / r0), false);
      ctx.closePath();
    }
    const isSel = sameTarget(App.sel.part, part);
    const isHover = sameTarget(this.hover, part);
    const isDrop = sameTarget(this.dropTarget, part) || (this.drag && this.drag.moved && sameTarget(this.drag.over, part));
    const node = App.node(id);
    ctx.fillStyle = isSel ? COLORS.selFill : isHover ? COLORS.hoverFill : id ? COLORS.cellFill : COLORS.emptyFill;
    ctx.fill('evenodd');
    ctx.lineWidth = isSel || isDrop ? 3 : 1.5;
    ctx.setLineDash(id ? [] : [6, 4]);
    ctx.strokeStyle = isDrop ? COLORS.dropStroke : isSel ? COLORS.selStroke : id && !node ? COLORS.badStroke : id ? COLORS.cellStroke : COLORS.emptyStroke;
    ctx.stroke();
    ctx.setLineDash([]);

    const am = mir((a0 + a1) / 2);
    const rm = ((r0 + r1) / 2) * S;
    const arcLen = full ? 999 : (a1 - a0) * rm;
    const size = Math.min((r1 - r0) * S * 0.62, arcLen * 0.62, 52);
    const x = L.cx + (full ? 0 : Math.cos(am) * rm);
    const y = L.cy + (full ? -rm : Math.sin(am) * rm);
    this.drawContent(x, y, size, id);
  },

  // Draws a node's icon, or a short label if the sprite isn't available.
  drawContent(x, y, size, id) {
    const ctx = this.ctx;
    if (!id) {
      ctx.fillStyle = '#555';
      ctx.font = `${Math.round(size * 0.5)}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+', x, y);
      return;
    }
    const node = App.node(id);
    const img = node && App.image(node.icon);
    if (img) {
      const k = size / Math.max(img.naturalWidth, img.naturalHeight);
      const w = img.naturalWidth * k;
      const hh = img.naturalHeight * k;
      ctx.drawImage(img, x - w / 2, y - hh / 2, w, hh);
      return;
    }
    ctx.fillStyle = node ? COLORS.text : COLORS.badStroke;
    ctx.font = `600 ${Math.max(9, Math.round(size * 0.24))}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = node ? (node.name || node.id) : '?' + id;
    ctx.fillText(label.length > 12 ? label.slice(0, 11) + '…' : label, x, y);
  },

  // Converts a mouse position to { type: 'center' } or { type: 'slot', s, r, k }.
  hitTest(e) {
    const disc = App.disc();
    if (!disc || !this.L) return null;
    const rect = this.canvas.getBoundingClientRect();
    const L = this.L;
    const dx = (e.clientX - rect.left - L.cx) / L.scale;
    const dy = (e.clientY - rect.top - L.cy) / L.scale;
    const d = Math.hypot(dx, dy);
    if (d <= GEO.R0) return { type: 'center' };
    const n = disc.sectors.length;
    if (!n) return null;
    const rr = d - GEO.R0 - GEO.G;
    if (rr < 0) return null;
    const r = Math.floor(rr / (GEO.W + GEO.G));
    if (rr - r * (GEO.W + GEO.G) > GEO.W) return null;
    let rel = mir(Math.atan2(dy, dx)) - GEO.START;
    rel = ((rel % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const secAng = (2 * Math.PI) / n;
    const s = Math.min(n - 1, Math.floor(rel / secAng));
    const ring = disc.sectors[s].rings[r];
    if (!ring || !ring.nodes.length) return null;
    const k = Math.min(ring.nodes.length - 1, Math.floor((rel - s * secAng) / (secAng / ring.nodes.length)));
    return { type: 'slot', s, r, k };
  },

  onMouseMove(e) {
    const hit = this.hitTest(e);
    if (this.drag) {
      if (!this.drag.moved && Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) > 5) this.drag.moved = true;
      if (this.drag.moved) {
        this.drag.over = hit;
        this.canvas.style.cursor = 'grabbing';
        Tooltip.hide();
        this.draw();
        return;
      }
    }
    if (!sameTarget(hit, this.hover)) {
      this.hover = hit;
      this.canvas.style.cursor = hit ? 'pointer' : 'default';
      this.draw();
    }
    if (hit) {
      const id = getAt(App.disc(), hit);
      const node = App.node(id);
      const where = hit.type === 'center' ? 'Center' : `Sector ${hit.s + 1} · Ring ${hit.r + 1} · Slot ${hit.k + 1}`;
      Tooltip.show(e.clientX, e.clientY, node
        ? h('div', null, h('div', { class: 't' }, node.name || '(no name)'), h('div', { class: 's' }, node.id), h('div', { class: 'd' }, Model.stripTags(Model.describe(node))), h('div', { class: 's' }, where))
        : h('div', null, h('div', { class: 't' }, id ? `Unknown node "${id}"` : 'Empty slot'), h('div', { class: 's' }, where)));
    } else Tooltip.hide();
  },

  onMouseDown(e) {
    if (e.button !== 0) return;
    const hit = this.hitTest(e);
    App.sel.part = hit;
    this.drag = hit ? { from: hit, x: e.clientX, y: e.clientY, moved: false, over: null } : null;
    this.renderInspector();
    this.draw();
  },

  onMouseUp() {
    const drag = this.drag;
    this.drag = null;
    this.canvas.style.cursor = this.hover ? 'pointer' : 'default';
    if (!drag || !drag.moved) return;
    if (drag.over && !sameTarget(drag.over, drag.from)) {
      const from = drag.from;
      const to = drag.over;
      App.mutate(() => {
        const disc = App.disc();
        const a = getAt(disc, from);
        const b = getAt(disc, to);
        setAt(disc, from, b);
        setAt(disc, to, a);
      }, { render: false });
      App.sel.part = to;
      this.render();
    } else this.draw();
  },

  // ---------------- inspector ----------------
  renderInspector() {
    const disc = App.disc();
    const sel = App.sel;
    const sections = [];
    const zone = App.data.zones[sel.z];
    const orb = zone && zone.orbitals[sel.o];

    if (sel.part && sel.part.type === 'orbital' && orb) {
      sections.push(this.orbitalSection(orb));
    } else if (disc) {
      sections.push(this.discSection(disc));
      if (sel.part && sel.part.type === 'center') sections.push(this.centerSection(disc));
      if (sel.part && sel.part.type === 'slot') sections.push(...this.slotSections(disc, sel.part));
      if (!sel.part) sections.push(this.sectorsOverview(disc));
    }
    sections.push(this.unplacedSection());
    this.inspEl.replaceChildren(...sections);
  },

  discSection(disc) {
    const idInput = h('input', {
      value: disc.id, class: 'mono', spellcheck: false,
      onchange: () => {
        const v = idInput.value.trim();
        const err = discIdError(v, disc.id);
        if (err) { Toast.show(err, 'error'); idInput.value = disc.id; return; }
        App.mutate(() => { disc.id = v; });
      }
    });
    return h('div', { class: 'insp-section' },
      h('h3', null, 'Disc'),
      h('div', { class: 'insp-row' }, h('label', null, 'Disc id'), idInput),
      h('div', { class: 'btn-row' },
        h('button', { class: 'small', onclick: () => this.addSector() }, '+ Sector'),
        h('button', { class: 'small', onclick: () => { App.sel.part = { type: 'center' }; this.render(); } }, 'Edit center')));
  },

  centerSection(disc) {
    return h('div', { class: 'insp-section' },
      h('h3', null, 'Center node'),
      nodeCard(App.node(disc.center) || (disc.center ? { id: disc.center, name: 'Unknown node', icon: '' } : null)),
      h('div', { class: 'btn-row' },
        h('button', { class: 'small', onclick: () => this.chooseFor({ type: 'center' }) }, 'Choose…'),
        h('button', { class: 'small', disabled: !disc.center, onclick: () => this.clearSelected() }, 'Clear'),
        disc.center ? null : h('button', { class: 'small', title: 'Create a new dummy node and put it here', onclick: () => this.addDummyAt({ type: 'center' }) }, 'New dummy here'),
        disc.center && App.node(disc.center) ? h('button', { class: 'small', onclick: () => App.navigate({ type: 'node', id: disc.center }) }, 'Edit node') : null));
  },

  slotSections(disc, p) {
    const ring = disc.sectors[p.s].rings[p.r];
    const id = ring.nodes[p.k];
    const node = App.node(id);
    const b = (label, fn, opts = {}) => h('button', { class: 'small' + (opts.danger ? ' danger' : ''), disabled: !!opts.disabled, title: opts.title, onclick: fn }, label);
    return [
      h('div', { class: 'insp-section' },
        h('h3', null, `Slot · Sector ${p.s + 1} · Ring ${p.r + 1} · Slot ${p.k + 1}`),
        nodeCard(node || (id ? { id, name: 'Unknown node', icon: '' } : null)),
        h('div', { class: 'btn-row' },
          b('Choose…', () => this.chooseFor(p)),
          b('Clear', () => this.clearSelected(), { disabled: !id }),
          id ? null : b('New dummy here', () => this.addDummyAt(p), { title: 'Create a new dummy node and put it here' }),
          node ? b('Edit node', () => App.navigate({ type: 'node', id })) : null)),
      h('div', { class: 'insp-section' },
        h('h3', null, `Ring ${p.r + 1} of sector ${p.s + 1} · ${ring.nodes.length} slot${ring.nodes.length > 1 ? 's' : ''}`),
        h('div', { class: 'btn-row' },
          b('+ Slot before', () => this.insertSlot(p, 0)),
          b('+ Slot after', () => this.insertSlot(p, 1)),
          b('◀', () => this.moveSlot(p, -1), { disabled: p.k === 0, title: 'Move slot clockwise (earlier in the ring)' }),
          b('▶', () => this.moveSlot(p, 1), { disabled: p.k === ring.nodes.length - 1, title: 'Move slot counter-clockwise (later in the ring)' })),
        h('div', { class: 'btn-row' },
          b('Remove slot', () => this.removeSlot(p), { danger: true }),
          b('Remove ring', () => this.removeRing(p.s, p.r), { danger: true }))),
      h('div', { class: 'insp-section' },
        h('h3', null, `Sector ${p.s + 1} of ${disc.sectors.length} · ${disc.sectors[p.s].rings.length} ring${disc.sectors[p.s].rings.length > 1 ? 's' : ''}`),
        h('div', { class: 'btn-row' },
          b('+ Ring outside', () => this.addRing(p.s)),
          b('◀ Move', () => this.moveSector(p.s, -1), { disabled: p.s === 0, title: 'Move sector clockwise (earlier in the disc)' }),
          b('Move ▶', () => this.moveSector(p.s, 1), { disabled: p.s === disc.sectors.length - 1, title: 'Move sector counter-clockwise (later in the disc)' })),
        h('div', { class: 'btn-row' },
          b('+ Sector after', () => this.addSector(p.s + 1)),
          b('Remove sector', () => this.removeSector(p.s), { danger: true })))
    ];
  },

  sectorsOverview(disc) {
    return h('div', { class: 'insp-section' },
      h('h3', null, 'Sectors'),
      disc.sectors.length ? null : h('p', { class: 'muted' }, 'No sectors. Add one with + Sector.'),
      disc.sectors.map((sec, s) => h('div', { class: 'insp-row' },
        h('span', { style: { flex: 1 } }, `Sector ${s + 1}`, h('span', { class: 'muted' }, ` · ${sec.rings.map((r) => r.nodes.length).join(' / ') || 'no rings'}`)),
        h('button', { class: 'small', onclick: () => this.addRing(s) }, '+ Ring'),
        h('button', { class: 'small danger', onclick: () => this.removeSector(s) }, '✕'))),
      h('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '12px' } }, 'Numbers are slots per ring, inner to outer. Click a slot on the disc to edit it.'));
  },

  orbitalSection(orb) {
    const { z, o } = App.sel;
    const input = h('input', {
      value: orb.cluster_dir ?? '', placeholder: 'evenly spaced', inputmode: 'decimal', class: 'mono',
      onchange: () => {
        const raw = input.value.trim();
        let v = null;
        if (raw !== '') {
          v = Number(raw);
          if (Number.isNaN(v)) { Toast.show('Cluster direction must be a number of degrees', 'error'); input.value = orb.cluster_dir ?? ''; return; }
          if (v === 0) { Toast.show('The game reads 0 as "not clustered"; use 360 instead', 'warn', 4000); v = 360; }
        }
        App.mutate(() => { orb.cluster_dir = v; });
      }
    });
    return h('div', { class: 'insp-section' },
      h('h3', null, `Zone ${z + 1} · Orbital ${o}`),
      h('div', { class: 'insp-row' }, h('label', null, 'Cluster dir'), input),
      h('p', { class: 'muted', style: { fontSize: '12px', marginTop: 0 } }, 'Blank spaces this orbital\'s discs evenly. A number clusters them around that direction in degrees.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'small', onclick: () => this.addDisc(z, o) }, '+ Disc'),
        h('button', { class: 'small', onclick: () => this.addOrbital(z, o) }, '+ Orbital after'),
        h('button', { class: 'small danger', onclick: () => this.deleteOrbital(z, o) }, 'Delete orbital')));
  },

  unplacedSection() {
    const placed = Model.placements(App.data);
    const search = h('input', { type: 'search', placeholder: 'Search unplaced nodes…', value: this.unplacedQuery, spellcheck: false });
    const list = h('div', { class: 'node-list' });
    const renderList = () => {
      const q = this.unplacedQuery.trim().toLowerCase();
      const nodes = App.data.nodes.filter((n) => !placed.has(n.id) && (!q || [n.id, n.name, n.stat].some((s) => String(s).toLowerCase().includes(q))));
      list.replaceChildren(...(nodes.length ? nodes.map((n) => h('div', {
        class: 'node-item', draggable: true, title: 'Click to put in the selected slot, or drag onto the disc',
        ondragstart: (e) => { e.dataTransfer.setData('text/plain', n.id); e.dataTransfer.effectAllowed = 'move'; Tooltip.hide(); },
        onclick: () => {
          const part = App.sel.part;
          if (!part || part.type === 'orbital') return Toast.show('Select a slot or the center first', 'warn');
          this.assign(n.id, part);
        }
      }, spriteEl(n.icon), h('div', { class: 'n' }, n.name || '(no name)', ' ', h('small', null, n.id)))) : [h('p', { class: 'muted' }, q ? 'No matches.' : 'Every node is placed.')]));
    };
    search.addEventListener('input', () => { this.unplacedQuery = search.value; renderList(); });
    renderList();
    const count = App.data.nodes.filter((n) => !placed.has(n.id)).length;
    return h('div', { class: 'insp-section unplaced' }, h('h3', null, `Unplaced nodes (${count})`), search, list);
  },

  // ---------------- actions ----------------
  async chooseFor(part) {
    const id = await Pickers.node({ title: part.type === 'center' ? 'Choose the center node' : 'Choose a node for this slot' });
    if (!id) return;
    App.sel.part = part;
    this.assign(id, part);
  },

  // Puts a node at a spot; offers to move it if it's already placed elsewhere.
  async assign(id, part) {
    const disc = App.disc();
    if (!disc) return;
    const here = { z: App.sel.z, o: App.sel.o, d: App.sel.d };
    const others = (Model.placements(App.data).get(id) || []).filter((p) =>
      !(p.z === here.z && p.o === here.o && p.d === here.d && sameTarget(p.type === 'center' ? { type: 'center' } : { type: 'slot', s: p.s, r: p.r, k: p.k }, part)));
    if (others.length) {
      const ok = await Modal.confirm('Move node?', `"${id}" is already placed at ${others.map(Model.describePlacement).join(', ')}. Move it here?`, 'Move here');
      if (!ok) return;
    }
    App.mutate((data) => {
      for (const p of others) {
        const dd = data.zones[p.z].orbitals[p.o].discs[p.d];
        setAt(dd, p.type === 'center' ? { type: 'center' } : { type: 'slot', s: p.s, r: p.r, k: p.k }, null);
      }
      setAt(disc, part, id);
    });
  },

  // Creates the next dummy_N node and puts it straight into an empty slot or center.
  addDummyAt(part) {
    const disc = App.disc();
    if (!disc || getAt(disc, part)) return;
    const id = Model.nextInSeries(App.data.nodes.map((n) => n.id), 'dummy');
    App.mutate((data) => {
      data.nodes.push(Model.dummyNode(id));
      setAt(disc, part, id);
    });
    Toast.show(`Added ${id}`);
  },

  clearSelected() {
    const disc = App.disc();
    const part = App.sel.part;
    if (!disc || !part || part.type === 'orbital' || !getAt(disc, part)) return;
    App.mutate(() => setAt(disc, part, null));
  },

  addSector(index) {
    const disc = App.disc();
    if (!disc) return;
    const at = index === undefined ? disc.sectors.length : index;
    App.mutate(() => disc.sectors.splice(at, 0, { rings: [{ nodes: [null] }] }), { render: false });
    App.sel.part = { type: 'slot', s: at, r: 0, k: 0 };
    this.render();
  },

  async removeSector(s) {
    const disc = App.disc();
    const filled = disc.sectors[s].rings.reduce((a, r) => a + r.nodes.filter(Boolean).length, 0);
    if (filled && !(await Modal.confirm('Remove sector?', `Sector ${s + 1} holds ${filled} node${filled > 1 ? 's' : ''}; they become unplaced.`, 'Remove', true))) return;
    App.mutate(() => disc.sectors.splice(s, 1), { render: false });
    App.sel.part = null;
    this.render();
  },

  moveSector(s, dir) {
    const disc = App.disc();
    const t = s + dir;
    if (t < 0 || t >= disc.sectors.length) return;
    App.mutate(() => { [disc.sectors[s], disc.sectors[t]] = [disc.sectors[t], disc.sectors[s]]; }, { render: false });
    const p = App.sel.part;
    if (p && p.type === 'slot') p.s = t;
    this.render();
  },

  addRing(s) {
    const disc = App.disc();
    const sec = disc.sectors[s];
    App.mutate(() => sec.rings.push({ nodes: [null] }), { render: false });
    App.sel.part = { type: 'slot', s, r: sec.rings.length - 1, k: 0 };
    this.render();
  },

  async removeRing(s, r) {
    const disc = App.disc();
    const ring = disc.sectors[s].rings[r];
    const filled = ring.nodes.filter(Boolean).length;
    if (filled && !(await Modal.confirm('Remove ring?', `This ring holds ${filled} node${filled > 1 ? 's' : ''}; they become unplaced.`, 'Remove', true))) return;
    App.mutate(() => disc.sectors[s].rings.splice(r, 1), { render: false });
    App.sel.part = null;
    this.render();
  },

  insertSlot(p, offset) {
    const disc = App.disc();
    const ring = disc.sectors[p.s].rings[p.r];
    const at = p.k + offset;
    App.mutate(() => ring.nodes.splice(at, 0, null), { render: false });
    App.sel.part = { type: 'slot', s: p.s, r: p.r, k: at };
    this.render();
  },

  moveSlot(p, dir) {
    const ring = App.disc().sectors[p.s].rings[p.r];
    const t = p.k + dir;
    if (t < 0 || t >= ring.nodes.length) return;
    App.mutate(() => { [ring.nodes[p.k], ring.nodes[t]] = [ring.nodes[t], ring.nodes[p.k]]; }, { render: false });
    App.sel.part = { ...p, k: t };
    this.render();
  },

  async removeSlot(p) {
    const ring = App.disc().sectors[p.s].rings[p.r];
    if (ring.nodes.length === 1) return this.removeRing(p.s, p.r);
    if (ring.nodes[p.k] && !(await Modal.confirm('Remove slot?', `"${ring.nodes[p.k]}" becomes unplaced.`, 'Remove', true))) return;
    App.mutate(() => ring.nodes.splice(p.k, 1), { render: false });
    App.sel.part = { ...p, k: Math.min(p.k, ring.nodes.length - 1) };
    this.render();
  },

  addZone() {
    let z;
    App.mutate((data) => {
      z = data.zones.length;
      data.zones.push({ orbitals: [{ cluster_dir: null, discs: [Model.newDisc(Model.nextDiscId(data, z))] }] });
    }, { render: false });
    App.navigate({ type: 'disc', z, o: 0, d: 0 });
  },

  async deleteZone(z) {
    const zone = App.data.zones[z];
    const discs = zone.orbitals.reduce((a, o) => a + o.discs.length, 0);
    if (!(await Modal.confirm('Delete zone?', `Zone ${z + 1} has ${discs} disc${discs === 1 ? '' : 's'}. Their nodes become unplaced.`, 'Delete zone', true))) return;
    App.mutate((data) => data.zones.splice(z, 1), { render: false });
    App.sel = { z: Math.max(0, z - 1), o: 0, d: 0, part: null };
    App.render();
  },

  addOrbital(z, after) {
    const at = after + 1;
    App.mutate((data) => {
      data.zones[z].orbitals.splice(at, 0, { cluster_dir: null, discs: [Model.newDisc(Model.nextDiscId(data, z))] });
    }, { render: false });
    App.navigate({ type: 'disc', z, o: at, d: 0 });
  },

  moveOrbital(z, o, dir) {
    const orbs = App.data.zones[z].orbitals;
    const t = o + dir;
    if (t < 0 || t >= orbs.length) return;
    App.mutate(() => { [orbs[o], orbs[t]] = [orbs[t], orbs[o]]; }, { render: false });
    if (App.sel.z === z && App.sel.o === o) App.sel.o = t;
    App.render();
  },

  async deleteOrbital(z, o) {
    const orb = App.data.zones[z].orbitals[o];
    if (orb.discs.length && !(await Modal.confirm('Delete orbital?', `Orbital ${o} has ${orb.discs.length} disc${orb.discs.length === 1 ? '' : 's'}. Their nodes become unplaced.`, 'Delete orbital', true))) return;
    App.mutate((data) => data.zones[z].orbitals.splice(o, 1), { render: false });
    App.sel = { z, o: Math.max(0, o - 1), d: 0, part: null };
    App.render();
  },

  addDisc(z, o) {
    let d;
    App.mutate((data) => {
      const discs = data.zones[z].orbitals[o].discs;
      discs.push(Model.newDisc(Model.nextDiscId(data, z)));
      d = discs.length - 1;
    }, { render: false });
    App.navigate({ type: 'disc', z, o, d });
  },

  // Moves a disc within its orbital, crossing into the neighbouring orbital at the ends.
  moveDisc(z, o, d, dir) {
    const orbs = App.data.zones[z].orbitals;
    const discs = orbs[o].discs;
    const t = d + dir;
    let target;
    if (t >= 0 && t < discs.length) {
      App.mutate(() => { [discs[d], discs[t]] = [discs[t], discs[d]]; }, { render: false });
      target = { z, o, d: t };
    } else {
      const no = o + dir;
      if (no < 0 || no >= orbs.length) return;
      App.mutate(() => {
        const [disc] = discs.splice(d, 1);
        if (dir < 0) orbs[no].discs.push(disc);
        else orbs[no].discs.unshift(disc);
      }, { render: false });
      target = { z, o: no, d: dir < 0 ? orbs[no].discs.length - 1 : 0 };
    }
    App.navigate({ type: 'disc', ...target });
  },

  duplicateDisc(z, o, d) {
    App.mutate((data) => {
      const src = data.zones[z].orbitals[o].discs[d];
      const copy = {
        id: Model.nextDiscId(data, z),
        center: null,
        sectors: src.sectors.map((sec) => ({ rings: sec.rings.map((ring) => ({ nodes: ring.nodes.map(() => null) })) }))
      };
      data.zones[z].orbitals[o].discs.splice(d + 1, 0, copy);
    }, { render: false });
    App.navigate({ type: 'disc', z, o, d: d + 1 });
  },

  async deleteDisc(z, o, d) {
    const disc = App.data.zones[z].orbitals[o].discs[d];
    const filled = discCounts(disc).filled + (disc.center ? 1 : 0);
    if (filled && !(await Modal.confirm('Delete disc?', `${disc.id} holds ${filled} node${filled > 1 ? 's' : ''}; they become unplaced.`, 'Delete disc', true))) return;
    App.mutate((data) => data.zones[z].orbitals[o].discs.splice(d, 1), { render: false });
    App.sel = { z, o, d: Math.max(0, d - 1), part: null };
    App.render();
  },

  onKey(e) {
    if (App.tab !== 'discs') return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (document.querySelector('#modal-root .backdrop')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.clearSelected();
    } else if (e.key === 'Escape') {
      App.sel.part = null;
      this.render();
    }
  }
};

// ---------- helpers ----------
function sameTarget(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === 'slot') return a.s === b.s && a.r === b.r && a.k === b.k;
  return true;
}

function getAt(disc, part) {
  if (!disc || !part) return null;
  if (part.type === 'center') return disc.center;
  if (part.type === 'slot') {
    const ring = disc.sectors[part.s] && disc.sectors[part.s].rings[part.r];
    return ring ? ring.nodes[part.k] : null;
  }
  return null;
}

function setAt(disc, part, value) {
  if (part.type === 'center') disc.center = value || null;
  else if (part.type === 'slot') disc.sectors[part.s].rings[part.r].nodes[part.k] = value || null;
}

function discCounts(disc) {
  let slots = 0;
  let filled = 0;
  for (const sec of disc.sectors) for (const ring of sec.rings) for (const id of ring.nodes) { slots++; if (id) filled++; }
  return { slots, filled };
}

function discIdError(v, current) {
  if (!v) return 'Disc id cannot be empty';
  if (!/^\w+$/.test(v)) return 'Use letters, digits and underscores';
  let taken = false;
  App.data.zones.forEach((z) => z.orbitals.forEach((o) => o.discs.forEach((d) => { if (d.id === v && d.id !== current) taken = true; })));
  return taken ? `"${v}" is already used` : '';
}

document.addEventListener('keydown', (e) => DiscsTab.onKey(e));
App.tabs.discs = DiscsTab;
