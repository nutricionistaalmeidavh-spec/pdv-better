const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
let store;
async function start() {
  if (process.platform !== 'win32' && app.isPackaged) throw new Error('Distribuição homologada somente para Windows 10/11.');
  const { openCatalog } = await import('./db.mjs');
  const { apiChannels } = await import('../shared/contract.mjs');
  const folder = app.getPath('userData');
  fs.mkdirSync(folder, { recursive: true });
  store = openCatalog(path.join(folder, 'pdv-better.sqlite'));
  ipcMain.handle(apiChannels.list, (_evt, kind, search) => store.list(kind, search));
  ipcMain.handle(apiChannels.save, (_evt, kind, record) => store.save(kind, record));
  ipcMain.handle(apiChannels.archive, (_evt, kind, id) => store.archive(kind, id));
  ipcMain.handle(apiChannels.overview, () => store.overview());
  const window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 660,
    backgroundColor: '#f5f6fb', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true
    }
  });
  window.once('ready-to-show', () => window.show());
  const devUrl = process.env.PDV_DEV_URL || (app.isPackaged ? null : 'http://127.0.0.1:5173');
  if (devUrl) window.loadURL(devUrl);
  else window.loadFile(path.join(__dirname, '../dist/index.html'));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
}
app.whenReady().then(start).catch(error => { console.error(error); app.quit(); });
app.on('before-quit', () => { if (store) store.close(); });
app.on('window-all-closed', () => app.quit());
