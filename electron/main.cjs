const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
let store;
async function start() {
  if (process.platform !== 'win32' && app.isPackaged) throw new Error('Distribuição homologada somente para Windows 10/11.');
  const { openCatalog } = await import('./db.mjs');
  const { apiChannels } = await import('../shared/contract.mjs');
  const { reportRows, reportCsv, reportHtml } = await import('../shared/report.mjs');
  if(process.env.PDV_TEST_SMOKE==='1' && process.env.PDV_TEST_USER_DATA) {
    const smokeDir=path.resolve(process.env.PDV_TEST_USER_DATA);
    fs.mkdirSync(smokeDir,{recursive:true});
    app.setPath('userData',smokeDir);
  }
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
  ipcMain.handle(apiChannels.reportExport, async (_evt,format) => {
    if(!['pdf','csv','xlsx'].includes(format)) throw new Error('Formato não suportado.');
    const selected=await dialog.showSaveDialog(window,{
      title:'Exportar relatório gerencial',
      defaultPath:'PDV-Better-Relatorio.'+format,
      filters:[{name:format.toUpperCase(),extensions:[format]}]
    });
    if(selected.canceled || !selected.filePath)return {cancelled:true};
    const data=store.report();
    if(format==='csv')fs.writeFileSync(selected.filePath,reportCsv(data),'utf8');
    if(format==='xlsx'){
      const ExcelJS=require('exceljs');
      const book=new ExcelJS.Workbook();
      const sheet=book.addWorksheet('Resumo');
      sheet.columns=[{header:'Indicador',key:'label',width:44},{header:'Valor',key:'value',width:24}];
      sheet.getRow(1).font={bold:true};
      for(const row of reportRows(data)){
        const inserted=sheet.addRow({label:row.label,value:row.type==='money'?row.raw/100:row.raw});
        if(row.type==='money')inserted.getCell(2).numFmt='#,##0.00';
      }
      await book.xlsx.writeFile(selected.filePath);
    }
    if(format==='pdf'){
      const printWindow=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
      try {
        await printWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(reportHtml(data)));
        const buffer=await printWindow.webContents.printToPDF({pageSize:'A4',printBackground:true});
        fs.writeFileSync(selected.filePath,buffer);
      } finally {printWindow.destroy();}
    }
    return {cancelled:false,format};
  });
  window.once('ready-to-show', () => window.show());
  const builtPage=path.join(__dirname,'../dist/index.html');
  const devUrl = process.env.PDV_DEV_URL || (app.isPackaged || fs.existsSync(builtPage) ? null : 'http://127.0.0.1:5173');
  if (devUrl) window.loadURL(devUrl);
  else window.loadFile(path.join(__dirname, '../dist/index.html'));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
}
app.whenReady().then(start).catch(error => { console.error(error); app.quit(); });
app.on('before-quit', () => { if (store) store.close(); });
app.on('window-all-closed', () => app.quit());
