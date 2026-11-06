// Issues tab: everything the validator found, grouped by severity. Click to jump.
'use strict';

const IssuesTab = {
  built: false,
  build() {
    const root = document.getElementById('tab-issues');
    this.summary = h('span', { class: 'muted' });
    this.list = h('div', { class: 'issues-list' });
    root.append(h('div', { class: 'toolbar' }, this.summary), this.list);
    this.built = true;
  },
  render() {
    if (!this.built) this.build();
    const issues = App._issues || App.issues();
    const errors = issues.filter((i) => i.level === 'error');
    const warns = issues.filter((i) => i.level === 'warn');
    this.summary.textContent = issues.length
      ? `${errors.length} error${errors.length === 1 ? '' : 's'} · ${warns.length} warning${warns.length === 1 ? '' : 's'} — saving still works; these are for you to review.`
      : 'No issues found.';
    const row = (i) => h('div', {
      class: 'issue ' + i.level + (i.target ? ' link' : ''),
      onclick: i.target ? () => App.navigate(i.target) : null
    }, h('span', { class: 'lvl' }, i.level === 'error' ? 'ERROR' : 'WARN'), h('span', null, i.msg));
    this.list.replaceChildren(...[
      errors.length ? h('div', { class: 'issues-group' }, h('h3', null, 'Errors'), errors.map(row)) : null,
      warns.length ? h('div', { class: 'issues-group' }, h('h3', null, 'Warnings'), warns.map(row)) : null
    ].filter(Boolean));
  }
};

App.tabs.issues = IssuesTab;
