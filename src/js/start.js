// Page startup: load settings, sprites, stats and game_data.json, then wire controls.
'use strict';

(async function start() {
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => App.showTab(b.dataset.tab)));
  document.getElementById('btn-save').addEventListener('click', () => App.save());
  document.getElementById('btn-reload').addEventListener('click', () => App.reload());

  const isTyping = () => {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  };

  window.api.onMenuCommand((cmd) => {
    if (cmd === 'save') App.save();
    else if (cmd === 'reload') App.reload();
    else if (cmd === 'undo') { if (isTyping()) document.execCommand('undo'); else App.undo(); }
    else if (cmd === 'redo') { if (isTyping()) document.execCommand('redo'); else App.redo(); }
  });
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 's') {
      e.preventDefault();
      App.save();
    } else if ((key === 'z' && !e.shiftKey) && !isTyping()) {
      e.preventDefault();
      App.undo();
    } else if ((key === 'y' || (key === 'z' && e.shiftKey)) && !isTyping()) {
      e.preventDefault();
      App.redo();
    }
  });

  // Pick up stats added to or removed from the base stats script while the tool was in the background.
  window.addEventListener('focus', () => App.refreshStatsQuietly());

  await App.loadSettings();
  await Promise.all([App.refreshSprites(), App.refreshStats()]);
  let loaded = false;
  if (App.settings.dataFile && (await window.api.exists(App.settings.dataFile))) loaded = await App.loadFromDisk({ quiet: true });
  App.setDirty(false);
  const configured = App.settings.spritesDir || App.settings.dataFile || App.settings.projectDir;
  App.showTab(loaded || configured ? 'nodes' : 'settings');
  if (!configured) Toast.show('Welcome. Start by setting your project folder and sprite folder.', 'ok', 6000);
})();
