// Electron main process: window, settings, and file access for the renderer.
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { pathToFileURL } = require('url');

// Lets tests point settings at a throwaway folder.
if (process.env.BTTW_USER_DATA) app.setPath('userData', process.env.BTTW_USER_DATA);

let win = null;
let dirty = false;

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_SETTINGS = {
  projectDir: '',
  spritesDir: '',
  dataFile: '',
  gmlScript: '',
  nodesScript: '',
  csvFile: '',
  discsDir: '',
  discDataScript: '',
  baseStatsScript: ''
};

function readSettings() {
  try {
    const raw = fs.readFileSync(settingsFile(), 'utf8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(s) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify({ ...DEFAULT_SETTINGS, ...s }, null, 2));
}

// Standard paths inside a GameMaker project, used by "Fill paths from project folder".
function deriveFromProject(projectDir) {
  const p = (...parts) => path.join(projectDir, ...parts);
  return {
    spritesDir: p('sprites'),
    dataFile: p('data_src', 'game_data.json'),
    gmlScript: p('scripts', 'scr_game_data', 'scr_game_data.gml'),
    baseStatsScript: p('scripts', 'scr_init_base_stats', 'scr_init_base_stats.gml')
  };
}

// Each GameMaker sprite lives in sprites/<name>/ with a <name>.yy file that
// names its frames by GUID; the composite image of a frame is <guid>.png.
async function scanSprites(dir) {
  if (!dir) return { ok: false, error: 'No sprite folder set', sprites: [] };
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (e) {
    return { ok: false, error: e.message, sprites: [] };
  }
  const sprites = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const folder = path.join(dir, ent.name);
    let png = null;
    try {
      const yy = await fsp.readFile(path.join(folder, ent.name + '.yy'), 'utf8');
      const m = yy.match(/"frames"\s*:\s*\[\s*\{[^}]*?"(?:%Name|name)"\s*:\s*"([^"]+)"/);
      if (m) {
        const candidate = path.join(folder, m[1] + '.png');
        if (fs.existsSync(candidate)) png = candidate;
      }
    } catch { /* no .yy, fall through */ }
    if (!png) {
      try {
        const files = await fsp.readdir(folder);
        const first = files.find((f) => f.toLowerCase().endsWith('.png'));
        if (first) png = path.join(folder, first);
      } catch { /* ignore */ }
    }
    let url = null;
    if (png) {
      const stat = await fsp.stat(png).catch(() => null);
      url = pathToFileURL(png).href + (stat ? '?v=' + Math.floor(stat.mtimeMs) : '');
    }
    sprites.push({ name: ent.name, url });
  }
  sprites.sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, sprites };
}

function registerIpc() {
  ipcMain.handle('settings:get', () => readSettings());
  ipcMain.handle('settings:set', (_e, s) => { writeSettings(s); return readSettings(); });
  ipcMain.handle('settings:derive', (_e, projectDir) => deriveFromProject(projectDir));

  ipcMain.handle('dialog:pickFolder', async (_e, startPath) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: startPath || undefined });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:pickFile', async (_e, startPath, filters) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], defaultPath: startPath || undefined, filters: filters || [] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:saveFile', async (_e, startPath) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: startPath || 'game_data.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    return r.canceled ? null : r.filePath;
  });

  ipcMain.handle('fs:exists', (_e, p) => !!p && fs.existsSync(p));
  ipcMain.handle('fs:readText', async (_e, p) => {
    try { return { ok: true, text: await fsp.readFile(p, 'utf8') }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  // Writes via a temp file and, unless told not to, keeps the previous version as .bak.
  ipcMain.handle('fs:writeText', async (_e, p, text, opts = {}) => {
    try {
      await fsp.mkdir(path.dirname(p), { recursive: true });
      if (opts.backup !== false && fs.existsSync(p)) await fsp.copyFile(p, p + '.bak');
      const tmp = p + '.tmp';
      await fsp.writeFile(tmp, text, 'utf8');
      for (let attempt = 0; ; attempt++) {
        try {
          await fsp.rename(tmp, p);
          break;
        } catch (e) {
          if (attempt >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
          await new Promise((r) => setTimeout(r, 150));
        }
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('fs:join', (_e, ...parts) => path.join(...parts));

  ipcMain.handle('sprites:scan', (_e, dir) => scanSprites(dir));

  ipcMain.on('app:setDirty', (_e, value) => {
    dirty = !!value;
    if (win) win.setTitle('BTTW Data Tool' + (dirty ? ' •' : ''));
  });
}

function buildMenu() {
  const send = (cmd) => () => win && win.webContents.send('menu:command', cmd);
  // Shortcuts are handled in the page (so typing in a cell keeps native undo); the menu only shows them.
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Save', accelerator: 'CmdOrCtrl+S', registerAccelerator: false, click: send('save') },
        { label: 'Reload from disk', click: send('reload') },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', registerAccelerator: false, click: send('undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Y', registerAccelerator: false, click: send('redo') },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { type: 'separator' }, { role: 'toggleDevTools' }]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1100,
    minHeight: 650,
    backgroundColor: '#161616',
    title: 'BTTW Data Tool',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  win.on('close', (e) => {
    if (!dirty) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Discard changes', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: 'You have unsaved changes.',
      detail: 'Close without saving game_data.json?'
    });
    if (choice === 1) e.preventDefault();
  });
}

app.whenReady().then(() => {
  registerIpc();
  buildMenu();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
