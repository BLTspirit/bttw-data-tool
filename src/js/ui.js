// Small DOM helpers: element builder, modals, toasts, tooltip, pickers.
'use strict';

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null) continue;
      if (v === false && !(k in el)) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const Toast = {
  show(msg, kind = 'ok', ms = 2600) {
    const el = h('div', { class: 'toast ' + kind }, msg);
    document.getElementById('toast-root').append(el);
    setTimeout(() => el.remove(), ms);
  }
};

const Modal = {
  // Opens a modal; resolves with the clicked button's value (or null on Escape/backdrop).
  open({ title, body, buttons = [{ label: 'Close', value: null }], wide = false, onMount }) {
    return new Promise((resolve) => {
      const root = document.getElementById('modal-root');
      let done = false;
      const close = (value) => {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKey, true);
        backdrop.remove();
        resolve(value);
      };
      const footer = h('footer', null, buttons.map((b) =>
        h('button', { class: (b.primary ? 'primary ' : '') + (b.danger ? 'danger' : ''), onclick: () => (b.onClick ? b.onClick(close) : close(b.value)) }, b.label)
      ));
      const modal = h('div', { class: 'modal' + (wide ? ' wide' : '') }, h('header', null, title), h('div', { class: 'body' }, body), footer);
      const backdrop = h('div', { class: 'backdrop', onmousedown: (e) => { if (e.target === backdrop) close(null); } }, modal);
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(null); }
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
          const primary = buttons.find((b) => b.primary);
          if (primary) { e.preventDefault(); primary.onClick ? primary.onClick(close) : close(primary.value); }
        }
      };
      document.addEventListener('keydown', onKey, true);
      root.append(backdrop);
      if (onMount) onMount(modal, close);
    });
  },

  confirm(title, message, okLabel = 'OK', danger = false) {
    return this.open({
      title,
      body: typeof message === 'string' ? h('p', null, message) : message,
      buttons: [{ label: 'Cancel', value: false }, { label: okLabel, value: true, primary: !danger, danger }]
    }).then((v) => !!v);
  },

  // validate(value) returns an error string or '' when the value is fine.
  prompt(title, label, initial = '', validate = () => '') {
    const input = h('input', { type: 'text', value: initial, spellcheck: false });
    const errEl = h('div', { class: 'err-text' });
    const body = h('div', null, h('p', { class: 'muted', style: { marginTop: 0 } }, label), input, errEl);
    return this.open({
      title,
      body,
      buttons: [
        { label: 'Cancel', value: null },
        {
          label: 'OK', primary: true,
          onClick: (close) => {
            const v = input.value.trim();
            const e = validate(v);
            if (e) { errEl.textContent = e; input.focus(); return; }
            close(v);
          }
        }
      ],
      onMount: () => { input.focus(); input.select(); }
    });
  }
};

const Tooltip = {
  el: null,
  show(x, y, content) {
    this.el = this.el || document.getElementById('tooltip');
    this.el.replaceChildren(content);
    this.el.hidden = false;
    const w = this.el.offsetWidth;
    const hgt = this.el.offsetHeight;
    this.el.style.left = Math.min(x + 14, window.innerWidth - w - 8) + 'px';
    this.el.style.top = Math.min(y + 14, window.innerHeight - hgt - 8) + 'px';
  },
  hide() {
    if (this.el) this.el.hidden = true;
  }
};

// <img> for a sprite name, or a dashed placeholder if it isn't in the sprite folder.
function spriteEl(name, cls = 'sprite') {
  const url = name && App.spriteUrl(name);
  if (url) return h('img', { class: cls, src: url, alt: name, draggable: false });
  return h('span', { class: cls + ' missing', title: name ? `${name} (not found)` : 'no icon' }, name ? '?' : '');
}

function nodeCard(node) {
  if (!node) return h('div', { class: 'node-card empty' }, 'Empty slot');
  return h('div', { class: 'node-card' },
    spriteEl(node.icon),
    h('div', { style: { minWidth: 0 } },
      h('div', { class: 't' }, node.name || '(no name)'),
      h('div', { class: 's' }, node.id),
      h('div', { class: 'd' }, Model.stripTags(Model.describe(node)))
    )
  );
}

const Pickers = {
  // Choose a node. Resolves with an id or null.
  node({ title = 'Choose a node', unplacedFirst = true } = {}) {
    const placed = Model.placements(App.data);
    const search = h('input', { type: 'text', placeholder: 'Search name, id, or stat…', spellcheck: false });
    const list = h('div', { class: 'node-list', style: { maxHeight: '56vh' } });
    let resolveClose;
    const render = () => {
      const q = search.value.trim().toLowerCase();
      let nodes = App.data.nodes.filter((n) => !q || [n.id, n.name, n.stat].some((s) => String(s).toLowerCase().includes(q)));
      if (unplacedFirst) nodes = [...nodes].sort((a, b) => (placed.has(a.id) ? 1 : 0) - (placed.has(b.id) ? 1 : 0));
      list.replaceChildren(...nodes.map((n) => {
        const p = placed.get(n.id);
        return h('div', { class: 'node-item', onclick: () => resolveClose(n.id) },
          spriteEl(n.icon),
          h('div', { class: 'n' }, n.name || '(no name)', ' ', h('small', null, n.id)),
          h('div', { class: 'where' }, p ? Model.describePlacement(p[0]) : 'unplaced')
        );
      }));
    };
    search.addEventListener('input', render);
    render();
    return Modal.open({
      title,
      wide: true,
      body: h('div', null, search, h('div', { style: { height: '8px' } }), list),
      buttons: [{ label: 'Cancel', value: null }],
      onMount: (_m, close) => { resolveClose = close; search.focus(); }
    });
  },

  // Choose a sprite. Resolves with a name, '' to clear, or null on cancel.
  icon(current) {
    const sprites = App.sprites;
    const search = h('input', { type: 'text', placeholder: 'Search sprites…', spellcheck: false, value: '' });
    const grid = h('div', { class: 'sprite-grid' });
    const note = h('p', { class: 'muted', style: { margin: '6px 0 0' } });
    let resolveClose;
    const render = () => {
      const q = search.value.trim().toLowerCase();
      const shown = sprites.filter((s) => !q || s.name.toLowerCase().includes(q)).slice(0, 400);
      note.textContent = sprites.length
        ? `${shown.length} of ${sprites.length} sprites`
        : 'No sprites loaded. Set the sprite folder in Settings.';
      grid.replaceChildren(...shown.map((s) =>
        h('div', { class: 'sprite-cell' + (s.name === current ? ' current' : ''), onclick: () => resolveClose(s.name), title: s.name },
          s.url ? h('img', { class: 'sprite', src: s.url, loading: 'lazy' }) : h('span', { class: 'sprite missing' }, '?'),
          h('span', null, s.name))
      ));
    };
    search.addEventListener('input', render);
    render();
    return Modal.open({
      title: 'Choose an icon',
      wide: true,
      body: h('div', null, search, note, grid),
      buttons: [{ label: 'Clear icon', value: '' }, { label: 'Cancel', value: null }],
      onMount: (_m, close) => { resolveClose = close; search.focus(); }
    });
  }
};
