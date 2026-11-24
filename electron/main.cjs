const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
let store, runtime;
async function start() {
  if (process.platform !== 'win32' && app.isPackaged) throw new Error('Distribuição homologada somente para Windows 10/11.');
  const { openCatalog } = await import('./db.mjs');
  const { apiChannels } = await import('../shared/contract.mjs');
  const { reportRows, reportCsv, reportHtml } = await import('../shared/report.mjs');
  const {buildCatalogExport,catalogCsv,catalogHtml,catalogSpreadsheetRows} = await import('../shared/catalog-export.mjs');
  const { renderItemReportWorker } = await import('./report-worker-client.mjs');
  const { createBatchLabel } = await import('../shared/batch-label.mjs');
  const { renderPhysicalBatchLabel } = require('./physical-label.cjs');
  const { safeStorage } = require('electron');
  const { createRuntime } = await import('./runtime.mjs');
  const { applyPendingRestore,verifyDatabase,scheduleRestore } = await import('./backup.mjs');
  const {recoverLocalAdministrator} = await import('./recovery.mjs');
  const { renderPrintDocument,labelPageOptions } = await import('./printing.mjs');
  const {normalizeLabelSettings} = await import('../shared/label-layout.mjs');
  const {openPrintQueue} = await import('./print-queue.mjs');
  const {createUpdateManager} = await import('./auto-update.mjs');
  const {allowed} = await import('../shared/access.mjs');
  const {autoUpdater} = require('electron-updater');
  const { sendTcp, readScale } = await import('./peripherals.mjs');
  const { listScalePorts, readSerialScale } = await import('./serial-scale.mjs');
  const { normalizeScaleConfig, buildScaleExport } = await import('../shared/scale-integration.mjs');
  const { makeReceipt,drawerPulse,assertDeviceAddress } = await import('../shared/peripherals.mjs');
  if(process.env.PDV_TEST_SMOKE==='1' && process.env.PDV_TEST_USER_DATA) {
    const smokeDir=path.resolve(process.env.PDV_TEST_USER_DATA);
    fs.mkdirSync(smokeDir,{recursive:true});
    app.setPath('userData',smokeDir);
  } else {
    // Instalacoes anteriores gravaram o SQLite sob "PDV SUPER". Nao mover ou perder esse banco.
    const {resolveUserDataDirectory} = await import('./user-data.mjs');
    const dataFolder=resolveUserDataDirectory(app.getPath('appData'),app.getPath('userData'),fs.existsSync);
    fs.mkdirSync(dataFolder,{recursive:true});
    app.setPath('userData',dataFolder);
  }
  const folder = app.getPath('userData');
  fs.mkdirSync(folder, { recursive: true });
  let printQueue=null,printQueueError=null;
  try{printQueue=openPrintQueue(folder);}catch(error){
    printQueueError=error;
    console.error('Fila de impressão inválida; vendas continuam locais:',error.message);
  }
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
  ipcMain.handle(apiChannels.authRecoverLocal,(event,input)=>{
    if(event.sender!==window.webContents)throw new Error('Origem não autorizada para recuperação.');
    return recoverLocalAdministrator({store,folder,mode:runtime.status().mode,input});
  });
  ipcMain.handle(apiChannels.sessionsList,()=>domain('listOpenSessions'));
  ipcMain.handle(apiChannels.list, (_evt, kind, search, options) => domain('list',kind, search, options));
  ipcMain.handle(apiChannels.save, (_evt, kind, record) => domain('save',kind, record));
  ipcMain.handle(apiChannels.archive, (_evt, kind, id) => domain('archive',kind, id));
  ipcMain.handle(apiChannels.catalogCsvPreview,(_evt,input)=>domain('previewCatalogCsv',input));
  ipcMain.handle(apiChannels.catalogCsvImport,(_evt,input)=>domain('importCatalogCsv',input));
  ipcMain.handle(apiChannels.catalogXlsxConvert,async(_evt,bytes)=>{
    runtime.authorize('previewCatalogCsv');
    const {xlsxToCatalogCsv}=await import('./catalog-xlsx.mjs');
    return xlsxToCatalogCsv(bytes);
  });

  // Arquivos são lidos e gravados na máquina do usuário; banco remoto nunca recebe caminhos locais.
  const {readTransferFile,makeTransferXlsx}=await import('./data-transfer-file.mjs');
  const {transferColumns,writeCsv}=await import('../shared/data-transfer.mjs');
  function ensureTransferLocal(method){
    runtime.authorize(method);
    if(runtime.isRemote())throw new Error('Importação e exportação em lote: execute no computador servidor do PDV.');
  }
  ipcMain.handle(apiChannels.dataTransferPreview,async(_evt,input)=>{
    ensureTransferLocal('previewDataTransfer');
    const {kind,format,bytes,reason}=input||{};
    transferColumns(kind);
    const table=await readTransferFile(format,bytes);
    const preview=await domain('previewDataTransfer',{kind,table,reason});
    return preview;
  });
  ipcMain.handle(apiChannels.dataTransferImport,async(_evt,input)=>{
    ensureTransferLocal('importDataTransfer');
    const {kind,format,bytes,reason,token}=input||{};
    transferColumns(kind);
    const table=await readTransferFile(format,bytes);
    return domain('importDataTransfer',{kind,table,reason,token});
  });
  ipcMain.handle(apiChannels.dataTransferExport,async(_evt,input)=>{
    ensureTransferLocal('exportDataTransfer');
    const {kind,format,template}=input||{};
    const cols=transferColumns(kind);
    if(!['csv','xlsx'].includes(format))throw new Error('Use XLSX ou CSV.');
    const selected=await dialog.showSaveDialog(window,{title:template?'Salvar modelo de importação':'Exportar cadastros',defaultPath:'PDV-Plus-'+kind+(template?'-modelo':'')+'.'+format,filters:[{name:format.toUpperCase(),extensions:[format]}]});
    if(selected.canceled||!selected.filePath)return {cancelled:true};
    const report=template?{count:0,table:[cols.map(c=>c.label)]}:await domain('exportDataTransfer',kind);
    const data=format==='csv'?writeCsv(report.table):await makeTransferXlsx(kind,report.table);
    fs.writeFileSync(selected.filePath,data);
    return {cancelled:false,count:report.count};
  });

  ipcMain.handle(apiChannels.catalogExport,async(_event,format)=>{
    runtime.authorize('catalogExport');
    if(!['pdf','csv','xlsx'].includes(format))throw new Error('Formato de exportação de produtos inválido.');
    const selected=await dialog.showSaveDialog(window,{
      title:'Exportar catálogo completo de produtos',
      defaultPath:'PDV-Plus-Produtos.'+format,
      filters:[{name:format.toUpperCase(),extensions:[format]}]
    });
    if(selected.canceled||!selected.filePath)return {cancelled:true};
    // Não usar a página de 75 itens nem transferir fotos: a consulta slim traz TODOS os ativos.
    const [products,categories,profile]=await Promise.all([
      domain('list','products','',{slim:true}),
      domain('list','categories'),
      domain('getStoreProfile')
    ]);
    const report=buildCatalogExport(products,categories,profile,new Date());
    if(format==='csv'){
      fs.writeFileSync(selected.filePath,catalogCsv(report),'utf8');
    }else if(format==='xlsx'){
      const ExcelJS=require('exceljs');
      const book=new ExcelJS.Workbook();
      const sheet=book.addWorksheet('Produtos');
      const {columns,rows,totals}=catalogSpreadsheetRows(report);
      sheet.columns=columns.map((col,index)=>({
        header:col.label,key:col.key,width:[42,23,25,12,15,20,20,27,27][index]
      }));
      sheet.views=[{state:'frozen',ySplit:1}];
      sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
      sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF243E63'}};
      for(const row of rows)sheet.addRow(row);
      for(const index of [6,7,8,9])sheet.getColumn(index).numFmt='#,##0.00';
      sheet.getColumn(5).numFmt='#,##0.000';
      sheet.autoFilter={from:'A1',to:'I'+Math.max(1,rows.length+1)};
      const footer=sheet.addRow({name:'TOTAL ('+report.count+' produtos)',
        saleStockValue:totals.saleStockValue,costStockValue:totals.costStockValue});
      footer.font={bold:true};
      const summary=book.addWorksheet('Resumo');
      summary.columns=[{header:'Informação',key:'label',width:35},{header:'Valor',key:'value',width:45}];
      summary.addRow({label:'Estabelecimento',value:report.storeName});
      summary.addRow({label:'Emitido em',value:report.issuedAt});
      summary.addRow({label:'Produtos ativos',value:report.count});
      summary.addRow({label:'Valor de venda do estoque (R$)',value:totals.saleStockValue});
      summary.addRow({label:'Valor de custo do estoque (R$)',value:totals.costStockValue});
      summary.getColumn(2).numFmt='#,##0.00';
      await book.xlsx.writeFile(selected.filePath);
    }else{
      // Arquivo HTML temporário evita o limite de tamanho de URLs data: em catálogos grandes.
      const tempFolder=fs.mkdtempSync(path.join(app.getPath('temp'),'pdv-plus-catalog-'));
      const htmlFile=path.join(tempFolder,'catalogo.html');
      const printWindow=new BrowserWindow({show:false,webPreferences:{
        nodeIntegration:false,contextIsolation:true,sandbox:true
      }});
      try{
        fs.writeFileSync(htmlFile,catalogHtml(report),{encoding:'utf8',mode:0o600});
        await printWindow.loadFile(htmlFile);
        const pdf=await printWindow.webContents.printToPDF({
          pageSize:'A4',landscape:true,printBackground:true
        });
        fs.writeFileSync(selected.filePath,pdf);
      }finally{
        if(!printWindow.isDestroyed())printWindow.destroy();
        fs.rmSync(tempFolder,{recursive:true,force:true});
      }
    }
    return {cancelled:false,format,count:report.count};
  });

  ipcMain.handle(apiChannels.overview, () => domain('overview'));
  ipcMain.handle(apiChannels.storeProfileGet, () => domain('getStoreProfile'));
  ipcMain.handle(apiChannels.storeProfileSet, (_evt,input) => domain('saveStoreProfile',input));
  ipcMain.handle(apiChannels.sessionPage,(_event,options)=>domain('getCurrentSessionPage',options));
  ipcMain.handle(apiChannels.sessionCurrent, (_event) => domain('getCurrentSession'));
  ipcMain.handle(apiChannels.sessionOpen, (_event, input) => domain('openSession',input));
  ipcMain.handle(apiChannels.sessionClose, (_event, input) => domain('closeSession',input));
  ipcMain.handle(apiChannels.cashMove, (_event, input) => domain('moveCash',input));
  ipcMain.handle(apiChannels.checkout, (_event, input) => domain('checkout',input));
  ipcMain.handle(apiChannels.quoteSale, (_event, input) => domain('quoteSale',input));
  ipcMain.handle(apiChannels.salesList, (_event, options) => options ? domain('listSales',options) : domain('listSales'));
  ipcMain.handle(apiChannels.saleGet, (_event, id) => domain('getSale',id));
  ipcMain.handle(apiChannels.salesCancel, (_event, id) => domain('cancelSale',id));
  ipcMain.handle(apiChannels.stockMove, (_event, input) => domain('moveStock',input));
  ipcMain.handle(apiChannels.stockHistory, (_event, id, options) => options ? domain('listStockMovements',id??null,options) : domain('listStockMovements',id));
  ipcMain.handle(apiChannels.batchReceive, (_event, input) => domain('receiveBatch',input));
  ipcMain.handle(apiChannels.batchesList, (_event, id) => domain('listBatches',id));
  ipcMain.handle(apiChannels.promotionSet, (_event, input) => domain('setPromotion',input));
  ipcMain.handle(apiChannels.promotionsList, (_event, id) => domain('listPromotions',id));
  ipcMain.handle(apiChannels.bundleSet, (_event, input) => domain('setBundlePromotion',input));
  ipcMain.handle(apiChannels.bundleList, () => domain('listBundlePromotions'));
  ipcMain.handle(apiChannels.bundleArchive, (_event, id) => domain('archiveBundlePromotion',id));
  ipcMain.handle(apiChannels.purchaseCreate,(_event,input)=>domain('createPurchase',input));
  ipcMain.handle(apiChannels.purchaseReceive,(_event,id)=>domain('receivePurchase',id));
  ipcMain.handle(apiChannels.purchaseList,(_event,options)=>options ? domain('listPurchases',options) : domain('listPurchases'));
  ipcMain.handle(apiChannels.financeSchedule,(_event,input)=>domain('createFinanceSchedule',input));
  ipcMain.handle(apiChannels.financeOverview,(_event,input)=>domain('financeOverview',input||{}));
  ipcMain.handle(apiChannels.financeCreate, (_event, input) => domain('createFinance',input));
  ipcMain.handle(apiChannels.financeList, (_event, options) => options ? domain('listFinance',options) : domain('listFinance'));
  ipcMain.handle(apiChannels.financeSettle, (_event, input) => domain('settleFinance',input));
  ipcMain.handle(apiChannels.report, (_event) => domain('report'));
  ipcMain.handle(apiChannels.reportItems, (_event, filters) => domain('reportItems',filters));
  ipcMain.handle(apiChannels.reportCompare, (_event, input) => domain('compareReportPeriods',input));
  const window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 660,
    backgroundColor: '#f5f6fb', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true
    }
  });
  // O binário é substituído pelo NSIS; o SQLite continua no diretório userData.
  // A versão anterior permanece funcional se não houver rede ou se o backup falhar.
  const updaterManager=createUpdateManager({
    app,updater:autoUpdater,
    notify:status=>{if(!window.isDestroyed()&&!window.webContents.isDestroyed())
      window.webContents.send(apiChannels.updateEvent,status);},
    listOpenSessions:()=>runtime.call('listOpenSessions'),
    backup:async()=>{
      if(runtime.isRemote())return; // O SQLite canônico fica no servidor LAN.
      const backupPath=path.join(folder,'pre-update-'+app.getVersion()+'-'+Date.now()+'.sqlite');
      await store.backupTo(backupPath);
      verifyDatabase(backupPath);
    }
  });
  ipcMain.handle(apiChannels.updateStatus,()=>{
    runtime.authorize('updateStatus');
    return {...updaterManager.status(),canInstall:allowed(runtime.currentUser()?.role,'updateInstall')};
  });
  ipcMain.handle(apiChannels.updateCheck,()=>{
    runtime.authorize('updateCheck');
    return updaterManager.check();
  });
  ipcMain.handle(apiChannels.updateInstall,()=>{
    runtime.authorize('updateInstall');
    return updaterManager.install();
  });
  updaterManager.start();
  window.once('closed',()=>updaterManager.stop());
  ipcMain.handle(apiChannels.reportExport, async (_evt,format) => {
    runtime.authorize('reportExport');
    if(!['pdf','csv','xlsx'].includes(format)) throw new Error('Formato não suportado.');
    const selected=await dialog.showSaveDialog(window,{
      title:'Exportar relatório gerencial',
      defaultPath:'PDV-Plus-Relatorio.'+format,
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

  ipcMain.handle(apiChannels.financeExport,async(_event,input)=>{
    runtime.authorize('financeExport');
    const format=input?.format;
    if(!['csv','xlsx','pdf'].includes(format))throw new Error('Formato financeiro inválido.');
    const data=await domain('financeOverview',input?.filters||{});
    const selected=await dialog.showSaveDialog(window,{
      title:'Exportar fluxo financeiro operacional',
      defaultPath:'PDV-Plus-Fluxo-Financeiro.'+format,
      filters:[{name:format.toUpperCase(),extensions:[format]}]
    });
    if(selected.canceled||!selected.filePath)return {cancelled:true};
    const rows=[...data.timeline,...data.forecasts.map(x=>({...x,kind:'previsto '+x.kind}))];
    if(format==='csv'){
      const {financeCsv}=await import('../shared/finance-export.mjs');
      fs.writeFileSync(selected.filePath,financeCsv({rows}),'utf8');
    }else if(format==='xlsx'){
      const ExcelJS=require('exceljs');
      const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Fluxo operacional');
      sheet.columns=[
        {header:'Data',key:'date',width:14},{header:'Tipo',key:'kind',width:20},
        {header:'Descrição',key:'description',width:40},{header:'Categoria',key:'category',width:23},
        {header:'Meio',key:'method',width:20},{header:'Valor (R$)',key:'amount',width:18}
      ];
      sheet.autoFilter={from:'A1',to:'F'+(rows.length+1)};
      sheet.getRow(1).font={bold:true};
      const safe=v=>/^\s*[=+@-]/.test(String(v||''))?"'"+String(v):String(v||'');
      for(const x of rows){
        const record=sheet.addRow({date:x.date,kind:safe(x.kind),description:safe(x.description),
          category:safe(x.category),method:safe(x.method),amount:x.amount_cents/100});
        record.getCell(6).numFmt='#,##0.00';
      }
      await book.xlsx.writeFile(selected.filePath);
    }else{
      const escape=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
      const tr=x=>'<tr>'+[x.date,x.kind,x.description,x.category,x.method,(x.amount_cents/100).toFixed(2)]
        .map(v=>'<td>'+escape(v)+'</td>').join('')+'</tr>';
      const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>'+
        'body{font:11px system-ui;color:#222}h1{font-size:20px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px;text-align:left}'+
        'tr{break-inside:avoid}thead{display:table-header-group}footer{margin-top:20px}'+
        '</style></head><body><h1>PDV Plus — Fluxo operacional</h1>'+
        '<p>Realizado: entradas R$ '+(data.realized_in_cents/100).toFixed(2)+
        ' · saídas R$ '+(data.realized_out_cents/100).toFixed(2)+'</p>'+
        '<table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Meio</th><th>R$</th></tr></thead><tbody>'+
        rows.map(tr).join('')+'</tbody></table><footer>Relatório gerencial, não fiscal. Valores manuais não são extrato bancário.</footer></body></html>';
      const reportWindow=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
      try{
        await reportWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
        const pdf=await reportWindow.webContents.printToPDF({pageSize:'A4',printBackground:true});
        fs.writeFileSync(selected.filePath,pdf);
      }finally{if(!reportWindow.isDestroyed())reportWindow.destroy();}
    }
    return {cancelled:false,format,rows:rows.length};
  });
  ipcMain.handle(apiChannels.reportItemsExport, async (_event,input)=>{
    runtime.authorize('reportItems');
    const format=input?.format;
    if(!['csv','pdf','xlsx'].includes(format))throw new Error('Formato de exportação inválido.');
    const details=await domain('reportItems',input?.filters||{});
    const selected=await dialog.showSaveDialog(window,{
      title:'Exportar relatório detalhado por item',
      defaultPath:'PDV-Plus-Itens.'+format,
      filters:[{name:format.toUpperCase(),extensions:[format]}]
    });
    if(selected.canceled||!selected.filePath)return {cancelled:true};
    if(format==='csv'){
      const data=await renderItemReportWorker('csv',details);
      fs.writeFileSync(selected.filePath,data,'utf8');
    }
    if(format==='xlsx'){
      const bytes=await renderItemReportWorker('xlsx',details);
      fs.writeFileSync(selected.filePath,Buffer.from(bytes));
    }
    if(format==='pdf'){
      const html=await renderItemReportWorker('html',details);
      const printWindow=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
      try{
        await printWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
        const pdf=await printWindow.webContents.printToPDF({pageSize:'A4',landscape:true,printBackground:true});
        fs.writeFileSync(selected.filePath,pdf);
      }finally{if(!printWindow.isDestroyed())printWindow.destroy();}
    }
    return {cancelled:false,format};
  });
  const deviceFile=path.join(folder,'device-config.json');
  const readDevice=()=>{
    const defaults={printerHost:'',printerPort:9100,scaleHost:'',scalePort:4001,scaleTransport:'tcp',scaleBrand:'generic-streaming',scaleLabelMode:'DEFAULT_PRICE',scaleSerialPort:'',scaleBaudRate:9600,scaleRequestCommand:'ENQ',labelProfile:'50x30',labelWidthMm:50,labelHeightMm:30,labelMarginMm:3};
    try{return {...defaults,...JSON.parse(fs.readFileSync(deviceFile,'utf8'))};}
    catch{return defaults;}
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
    const merged={...readDevice(),...input};
    const label=normalizeLabelSettings(merged);
    const config={...normalizeScaleConfig({...merged,
      printerHost:printer?.host||'',printerPort:printer?.port||9100,
      scaleHost:scale?.host||'',scalePort:scale?.port||4001}),
      labelProfile:label.labelProfile,labelWidthMm:label.widthMm,
      labelHeightMm:label.heightMm,labelMarginMm:label.marginMm};
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
    const prefs=normalizeScaleConfig(readDevice());
    if(prefs.scaleTransport==='serial')return readSerialScale(prefs);
    const target=deviceTarget(prefs.scaleHost,prefs.scalePort);
    if(!target)throw new Error('Configure primeiro a balança TCP nas configurações.');
    return readScale(target);
  });
  ipcMain.handle(apiChannels.scaleProfile,()=>{
    runtime.authorize('scaleProfile');
    return {scaleLabelMode:normalizeScaleConfig(readDevice()).scaleLabelMode};
  });
  ipcMain.handle(apiChannels.scalePorts,async()=>{
    runtime.authorize('scalePorts');
    return listScalePorts();
  });
  ipcMain.handle(apiChannels.scaleExport,async(_evt,brand)=>{
    runtime.authorize('scaleExport');
    const products=await domain('list','products','',{slim:true});
    const exported=buildScaleExport(products,brand);
    const selection=await dialog.showSaveDialog(window,{
      title:'Exportar carga de produtos da balança',
      defaultPath:exported.fileName,
      filters:[{name:'Arquivo da balança',extensions:['txt']}]
    });
    if(selection.canceled||!selection.filePath)return {cancelled:true};
    fs.writeFileSync(selection.filePath,exported.content,{encoding:'latin1',flag:'w'});
    return {cancelled:false,fileName:exported.fileName,count:exported.count,skipped:exported.skipped};
  });
  async function performPrint(input){
    const kind=input?.kind;
    if(kind==='receipt-tcp'){
      const prefs=readDevice(),target=deviceTarget(prefs.printerHost,prefs.printerPort);
      if(!target)throw new Error('Impressora ESC/POS TCP não configurada.');
      const sale=await domain('getSale',String(input.saleId||''));
      if(sale.is_training)throw new Error('Simulação de treinamento não pode gerar comprovante de venda.');
      return sendTcp(target,makeReceipt(sale));
    }
    if(!['receipt','label','batch-label'].includes(kind))throw new Error('Tipo de impressão inválido.');
    const record=kind==='receipt'
      ? await domain('getSale',String(input.saleId||''))
      : (await domain('list','products')).find(p=>p.id===input.productId);
    if(!record)throw new Error('Registro não encontrado para impressão.');
    if(kind==='receipt'&&record.is_training)throw new Error('Simulação de treinamento não pode gerar comprovante de venda.');
    let document;
    const labelSettings=kind==='label'?normalizeLabelSettings(readDevice()):null;
    if(kind==='batch-label'){
      const batch=(await domain('listBatches',record.id)).find(b=>b.id===input.batchId);
      if(!batch)throw new Error('Lote da etiqueta não encontrado.');
      if(!record.code)throw new Error('Produto sem SKU; cadastre o código antes de imprimir lote.');
      const payload=createBatchLabel(record.code,batch.code);
      document=renderPhysicalBatchLabel({payload,product:record,batch});
    }else document=renderPrintDocument(kind==='receipt'?{kind,sale:record}:{kind,product:record,labelSettings});
    const requested=String(input.printer||'');
    if(requested) {
      const names=(await window.webContents.getPrintersAsync()).map(p=>p.name);
      if(!names.includes(requested))throw new Error('Impressora não está instalada no Windows.');
    }
    const printWindow=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
    try{
      await printWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(document));
      return await new Promise((resolve,reject)=>printWindow.webContents.print({
        silent:!!requested,deviceName:requested,printBackground:false,
        ...(kind==='label'?labelPageOptions(labelSettings):{usePrinterDefaultPageSize:true})
      },(ok,reason)=>ok?resolve({printed:true}):reject(new Error('Impressão não concluída: '+reason))));
    }finally{if(!printWindow.isDestroyed())printWindow.destroy();}
  }
  ipcMain.handle(apiChannels.devicePrint,async(_evt,input)=>{
    runtime.authorize('devicePrint');
    try{return await performPrint(input);}
    catch(error){
      if(!printQueue||!['receipt','receipt-tcp','label','batch-label'].includes(input?.kind))throw error;
      let job;
      try{
        job=printQueue.enqueue(input);
        printQueue.markFailed(job.id,error);
      }catch(queueError){
        throw new Error('Impressão falhou, mas o registro na fila também falhou: '+String(queueError.message||queueError),{cause:error});
      }
      throw new Error('Impressora não concluiu o envio: '+String(error?.message||error).slice(0,130)+'. Tentativa registrada na fila local ('+job.id.slice(0,8)+'). Confira o dispositivo antes de reenviar.',{cause:error});
    }
  });
  ipcMain.handle(apiChannels.printQueueList,()=>{
    runtime.authorize('printQueueList');
    if(!printQueue)throw printQueueError||new Error('Fila de impressão indisponível.');
    return printQueue.list();
  });
  ipcMain.handle(apiChannels.printQueueRetry,async(_evt,id)=>{
    runtime.authorize('printQueueRetry');
    if(!printQueue)throw printQueueError||new Error('Fila de impressão indisponível.');
    return printQueue.retry(String(id||''),performPrint);
  });
  ipcMain.handle(apiChannels.printQueuePurge,()=>{
    runtime.authorize('printQueuePurge');
    if(!printQueue)throw printQueueError||new Error('Fila de impressão indisponível.');
    return printQueue.purgePrinted();
  });
  ipcMain.handle(apiChannels.backupCreate,async()=>{
    runtime.authorize('backupCreate');
    if(runtime.isRemote())throw new Error('O backup deve ser feito no computador servidor do banco.');
    const selected=await dialog.showSaveDialog(window,{title:'Salvar backup SQLite',defaultPath:'PDV-Plus-Backup.sqlite',
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
