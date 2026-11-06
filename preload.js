// Exposes a small, explicit file/settings API to the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.invoke('settings:set', s),
  deriveFromProject: (dir) => ipcRenderer.invoke('settings:derive', dir),

  pickFolder: (start) => ipcRenderer.invoke('dialog:pickFolder', start),
  pickFile: (start, filters) => ipcRenderer.invoke('dialog:pickFile', start, filters),
  pickSaveFile: (start) => ipcRenderer.invoke('dialog:saveFile', start),

  exists: (p) => ipcRenderer.invoke('fs:exists', p),
  readText: (p) => ipcRenderer.invoke('fs:readText', p),
  writeText: (p, text, opts) => ipcRenderer.invoke('fs:writeText', p, text, opts),
  join: (...parts) => ipcRenderer.invoke('fs:join', ...parts),

  scanSprites: (dir) => ipcRenderer.invoke('sprites:scan', dir),

  setDirty: (v) => ipcRenderer.send('app:setDirty', v),
  onMenuCommand: (fn) => ipcRenderer.on('menu:command', (_e, cmd) => fn(cmd))
});
