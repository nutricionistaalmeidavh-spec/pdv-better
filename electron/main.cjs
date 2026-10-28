const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
let store, runtime;
async function start() {
  if (process.platform !== 'win32' && app.isPackaged) throw new Error('Distribuição homologada somente para Windows 10/11.');
  const { openCatalog } = await import('./db.mjs');
  const { apiChannels } = await import('../shared/contract.mjs');
  const { reportRows, reportCsv, reportHtml } = await import('../shared/report.mjs');
  const { safeStorage } = require('electron');
  const { createRuntime } = await import('./runtime.mjs');
  const { applyPendingRestore,verifyDatabase,scheduleRestore } = await import('./backup.mjs');
  const { renderPrintDocument } = await import('./printing.mjs');
  const { sendTcp, readScale } = await import('./peripherals.mjs');
  const { makeReceipt,drawerPulse,assertDeviceAddress } = await import('../shared/peripherals.mjs');
  if(process.env.PDV_TEST_SMOKE==='1' && process.env.PDV_TEST_USER_DATA) {
    const smokeDir=path.resolve(process.env.PDV_TEST_USER_DATA);
    fs.mkdirSync(smokeDir,{recursive:true});
    app.setPath('userData',smokeDir);
  }
  const folder = app.getPath('userData');
  fs.mkdirSync(folder, { recursive: true });
  const databaseFile=path.join(folder,'pdv-better.sqlite');
  applyPendingRestore(databaseFile);
  const terminalFile=path.join(folder,'terminal-id.txt');
  const terminalId=fs.existsSync(terminalFile)?fs.readFileSync(terminalFile,'utf8').trim():require('node:crypto').randomUUID();
  if(!fs.existsSync(terminalFile))fs.writeFileSync(terminalFile,terminalId,{mode:0o600});
  store = openCatalog(databaseFile,{terminalId});
  runtime = await createRuntime({store,folder,safeStorage});
  const domain=(method,...args)=>runtime.call(method,...args);
  ipcMain.handle(apiChannels.authStatus,()=>runtime.authStatus());
  ipcMain.handle(apiChannels.authBootstrap,(_evt,input)=>runtime.bootstrap(input));
  ipcMain.handle(apiChannels.authLogin,(_evt,input)=>runtime.login(input));
  ipcMain.handle(apiChannels.authLogout,()=>runtime.logout());
  ipcMain.handle(apiChannels.authSetPassword,(_evt,input)=>domain('setPassword',input));
  ipcMain.handle(apiChannels.sessionsList,()=>domain('listOpenSessions'));
  ipcMain.handle(apiChannels.list, (_evt, kind, search) => domain('list',kind, search));
  ipcMain.handle(apiChannels.save, (_evt, kind, record) => domain('save',kind, record));
  ipcMain.handle(apiChannels.archive, (_evt, kind, id) => domain('archive',kind, id));
  ipcMain.handle(apiChannels.overview, () => domain('overview'));
  ipcMain.handle(apiChannels.sessionCurrent, (_event) => domain('getCurrentSession'));
  ipcMain.handle(apiChannels.sessionOpen, (_event, input) => domain('openSession',input));
  ipcMain.handle(apiChannels.sessionClose, (_event, input) => domain('closeSession',input));
  ipcMain.handle(apiChannels.cashMove, (_event, input) => domain('moveCash',input));
  ipcMain.handle(apiChannels.checkout, (_event, input) => domain('checkout',input));
  ipcMain.handle(apiChannels.salesList, (_event) => domain('listSales'));
  ipcMain.handle(apiChannels.saleGet, (_event, id) => domain('getSale',id));
  ipcMain.handle(apiChannels.salesCancel, (_event, id) => domain('cancelSale',id));
  ipcMain.handle(apiChannels.stockMove, (_event, input) => domain('moveStock',input));
  ipcMain.handle(apiChannels.stockHistory, (_event, id) => domain('listStockMovements',id));
  ipcMain.handle(apiChannels.financeCreate, (_event, input) => domain('createFinance',input));
  ipcMain.handle(apiChannels.financeList, (_event) => domain('listFinance'));
  ipcMain.handle(apiChannels.financeSettle, (_event, input) => domain('settleFinance',input));
  ipcMain.handle(apiChannels.report, (_event) => domain('report'));
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
    runtime.authorize('reportExport');
    if(!['pdf','csv','xlsx'].includes(format)) throw new Error('Formato não suportado.');
    const selected=await dialog.showSaveDialog(window,{
      title:'Exportar relatório gerencial',
      defaultPath:'PDV-Better-Relatorio.'+format,
      filters:[{name:format.toUpperCase(),extensions:[format]}]
    });
    if(selected.canceled || !selected.filePath)return {cancelled:true};
    const data=await domain('report');
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
  const deviceFile=path.join(folder,'device-config.json');
  const readDevice=()=>{
    try{return JSON.parse(fs.readFileSync(deviceFile,'utf8'));}
    catch{return {printerHost:'',printerPort:9100,scaleHost:'',scalePort:4001};}
  };
  const deviceTarget=(host,port)=>host?assertDeviceAddress(host,port):null;
  ipcMain.handle(apiChannels.lanStatus,()=>runtime.status());
  ipcMain.handle(apiChannels.lanHost,(_evt,options)=>{runtime.authorize('lanHost');return runtime.host(options);});
  ipcMain.handle(apiChannels.lanJoin,(_evt,input)=>{if(runtime.currentUser())runtime.authorize('lanJoin');return runtime.join(input);});
  ipcMain.handle(apiChannels.lanLocal,()=>{if(runtime.currentUser())runtime.authorize('lanLocal');else if(!runtime.isRemote())throw new Error('Acesso restrito ao administrador.');return runtime.local();});
  ipcMain.handle(apiChannels.deviceGet,()=>{runtime.authorize('deviceGet');return readDevice();});
  ipcMain.handle(apiChannels.deviceSet,(_evt,input)=>{
    runtime.authorize('deviceSet');
    const printer=deviceTarget(String(input?.printerHost||'').trim(),input?.printerPort||9100);
    const scale=deviceTarget(String(input?.scaleHost||'').trim(),input?.scalePort||4001);
    const config={printerHost:printer?.host||'',printerPort:printer?.port||9100,
      scaleHost:scale?.host||'',scalePort:scale?.port||4001};
    fs.writeFileSync(deviceFile,JSON.stringify(config),{mode:0o600});
    return config;
  });
  ipcMain.handle(apiChannels.devicePrinters,async()=>{
    runtime.authorize('devicePrinters');
    const printers=await window.webContents.getPrintersAsync();
    return printers.map(p=>({name:p.name,displayName:p.displayName||p.name,isDefault:!!p.isDefault}));
  });
  ipcMain.handle(apiChannels.drawerOpen,async()=>{
    runtime.authorize('drawerOpen');
    const prefs=readDevice();
    const target=deviceTarget(prefs.printerHost,prefs.printerPort);
    if(!target)throw new Error('Configure primeiro uma impressora ESC/POS TCP com gaveta conectada.');
    return sendTcp(target,drawerPulse());
  });
  ipcMain.handle(apiChannels.scaleRead,async()=>{
    runtime.authorize('scaleRead');
    const prefs=readDevice(),target=deviceTarget(prefs.scaleHost,prefs.scalePort);
    if(!target)throw new Error('Configure primeiro a balança TCP nas configurações.');
    return readScale(target);
  });
  ipcMain.handle(apiChannels.devicePrint,async(_evt,input)=>{
    runtime.authorize('devicePrint');
    const kind=input?.kind;
    if(kind==='receipt-tcp'){
      const prefs=readDevice(),target=deviceTarget(prefs.printerHost,prefs.printerPort);
      if(!target)throw new Error('Impressora ESC/POS TCP não configurada.');
      const sale=await domain('getSale',String(input.saleId||''));
      return sendTcp(target,makeReceipt(sale));
    }
    if(!['receipt','label'].includes(kind))throw new Error('Tipo de impressão inválido.');
    const record=kind==='receipt'
      ? await domain('getSale',String(input.saleId||''))
      : (await domain('list','products')).find(p=>p.id===input.productId);
    if(!record)throw new Error('Registro não encontrado para impressão.');
    const document=renderPrintDocument(kind==='receipt'?{kind,sale:record}:{kind,product:record});
    const requested=String(input.printer||'');
    if(requested) {
      const names=(await window.webContents.getPrintersAsync()).map(p=>p.name);
      if(!names.includes(requested))throw new Error('Impressora não está instalada no Windows.');
    }
    const printWindow=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
    try{
      await printWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(document));
      return await new Promise((resolve,reject)=>printWindow.webContents.print({
        silent:!!requested,deviceName:requested,printBackground:false,usePrinterDefaultPageSize:true
      },(ok,reason)=>ok?resolve({printed:true}):reject(new Error('Impressão não concluída: '+reason))));
    }finally{if(!printWindow.isDestroyed())printWindow.destroy();}
  });
  ipcMain.handle(apiChannels.backupCreate,async()=>{
    runtime.authorize('backupCreate');
    if(runtime.isRemote())throw new Error('O backup deve ser feito no computador servidor do banco.');
    const selected=await dialog.showSaveDialog(window,{title:'Salvar backup SQLite',defaultPath:'PDV-Better-Backup.sqlite',
      filters:[{name:'Backup SQLite',extensions:['sqlite']}]});
    if(selected.canceled||!selected.filePath)return {cancelled:true};
    if(path.resolve(selected.filePath)===path.resolve(databaseFile))throw new Error('O backup não pode substituir o banco em uso.');
    await store.backupTo(selected.filePath);
    verifyDatabase(selected.filePath);
    return {created:true,path:selected.filePath};
  });
  ipcMain.handle(apiChannels.backupRestore,async()=>{
    runtime.authorize('backupRestore');
    if(runtime.isRemote())throw new Error('Restauração disponível apenas no computador servidor.');
    if(store.listOpenSessions().length)throw new Error('Feche todos os caixas e terminais antes de restaurar o backup.');
    const selected=await dialog.showOpenDialog(window,{title:'Selecionar backup para restaurar',
      properties:['openFile'],filters:[{name:'Backup SQLite',extensions:['sqlite','db']}]});
    if(selected.canceled||!selected.filePaths?.length)return {cancelled:true};
    const result=scheduleRestore(selected.filePaths[0],databaseFile);
    // A substituição do arquivo ocorre antes de abrir qualquer conexão, no próximo início.
    setImmediate(()=>{app.relaunch();app.quit();});
    return {...result,restarting:true};
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
app.on('before-quit', () => { if (store) store.close(); if(runtime)void runtime.stop(); });
app.on('window-all-closed', () => app.quit());
