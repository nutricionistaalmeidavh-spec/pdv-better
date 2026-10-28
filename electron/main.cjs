const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
let store;
async function start() {
  if (process.platform !== 'win32' && app.isPackaged) throw new Error('Distribuição homologada somente para Windows 10/11.');
  const { openCatalog } = await import('./db.mjs');
  const { apiChannels } = await import('../shared/contract.mjs');
  if(process.env.PDV_TEST_SMOKE==='1' && process.env.PDV_TEST_USER_DATA) app.setPath('userData',path.resolve(process.env.PDV_TEST_USER_DATA));
  const folder = app.getPath('userData');
  fs.mkdirSync(folder, { recursive: true });
  store = openCatalog(path.join(folder, 'pdv-better.sqlite'));
  ipcMain.handle(apiChannels.list, (_evt, kind, search) => store.list(kind, search));
  ipcMain.handle(apiChannels.save, (_evt, kind, record) => store.save(kind, record));
  ipcMain.handle(apiChannels.archive, (_evt, kind, id) => store.archive(kind, id));
  ipcMain.handle(apiChannels.overview, () => store.overview());
  ipcMain.handle(apiChannels.sessionCurrent, (_event) => store.getCurrentSession());
  ipcMain.handle(apiChannels.sessionOpen, (_event, input) => store.openSession(input));
  ipcMain.handle(apiChannels.sessionClose, (_event, input) => store.closeSession(input));
  ipcMain.handle(apiChannels.cashMove, (_event, input) => store.moveCash(input));
  ipcMain.handle(apiChannels.checkout, (_event, input) => store.checkout(input));
  ipcMain.handle(apiChannels.salesList, (_event) => store.listSales());
  ipcMain.handle(apiChannels.salesCancel, (_event, id) => store.cancelSale(id));
  ipcMain.handle(apiChannels.stockMove, (_event, input) => store.moveStock(input));
  ipcMain.handle(apiChannels.stockHistory, (_event, id) => store.listStockMovements(id));
  ipcMain.handle(apiChannels.financeCreate, (_event, input) => store.createFinance(input));
  ipcMain.handle(apiChannels.financeList, (_event) => store.listFinance());
  ipcMain.handle(apiChannels.financeSettle, (_event, input) => store.settleFinance(input));
  ipcMain.handle(apiChannels.report, (_event) => store.report());
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
