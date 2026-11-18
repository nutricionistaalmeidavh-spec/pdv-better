// QA físico virtual de etiqueta usando o Chromium do Electron real.
// O dispositivo PT260/driver não está presente no runner: este teste comprova
// o layout e a paginação, não a alimentação/corte físico do equipamento.
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const {join,resolve}=require('node:path');
const {pathToFileURL}=require('node:url');

const output=resolve(process.cwd(),'qa-artifacts','label-print');
const cases=[
  {id:'pt260-foto-50x30',profile:{labelProfile:'50x30'},product:{
    name:'Coca Cola 2 litros',code:'7894900700132',sale_price_cents:1749},needle:'Coca',price:'17,49'},
  {id:'bobina-58x30',profile:{labelProfile:'58x30'},product:{
    name:'Arroz branco 5 kg',code:'7891000000001',sale_price_cents:3290},needle:'Arroz',price:'32,90'},
  {id:'etiqueta-40x30',profile:{labelProfile:'40x30'},product:{
    name:'Sabonete neutro',code:'7891000000002',sale_price_cents:499},needle:'Sabonete',price:'4,99'},
  {id:'etiqueta-60x40',profile:{labelProfile:'60x40'},product:{
    name:'Café especial 500 g',code:'7891000000003',sale_price_cents:2590},needle:'Café',price:'25,90'},
  {id:'custom-45x28',profile:{labelProfile:'custom',labelWidthMm:45,labelHeightMm:28,labelMarginMm:2},product:{
    name:'Suco natural 1 litro',code:'7891000000004',sale_price_cents:1250},needle:'Suco',price:'12,50'},
  {id:'nome-longo-50x30',profile:{labelProfile:'50x30'},product:{
    name:'Produto de mercado com descrição extensa que não pode deslocar o preço para outra etiqueta '.repeat(3),
    code:'7891000000005',sale_price_cents:1749},needle:'Produto',price:'17,49'}
];
async function run(){
  const {renderPrintDocument,labelPageOptions}=await import(pathToFileURL(resolve('electron/printing.mjs')).href);
  const {normalizeLabelSettings}=await import(pathToFileURL(resolve('shared/label-layout.mjs')).href);
  mkdirSync(output,{recursive:true});
  const win=new BrowserWindow({show:false,width:700,height:500,
    webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
  const evidence=[];
  try{
    for(const scenario of cases){
      const size=normalizeLabelSettings(scenario.profile);
      const html=renderPrintDocument({kind:'label',product:scenario.product,labelSettings:scenario.profile});
      assert.match(html,/<div class="label-price">/);
      const nativeOptions=labelPageOptions(scenario.profile);
      assert.equal(nativeOptions.pageSize.width,Math.round(size.widthMm*1000));
      assert.equal(nativeOptions.pageSize.height,Math.round(size.heightMm*1000));
      assert.equal(nativeOptions.usePrinterDefaultPageSize,false);
      await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
      const layout=await win.webContents.executeJavaScript(`(()=>{
        const box=selector=>{const node=document.querySelector(selector),r=node.getBoundingClientRect(),style=getComputedStyle(node);return {
          x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,
          transform:style.transform,writingMode:style.writingMode,text:node.textContent
        }};
        return {page:box('.label'),name:box('.label-name'),code:box('.label-code'),price:box('.label-price')};
      })()`);
      assert.ok(layout.price.text.includes('R$'),'O preço precisa estar na etiqueta');
      assert.ok(layout.name.text.includes(scenario.needle),'Nome não renderizado');
      assert.ok(layout.price.y>layout.name.y,'Preço não pode preceder nome');
      assert.ok(layout.price.bottom<=layout.page.bottom+1,'Preço cortado fora da etiqueta');
      assert.ok(layout.price.right<=layout.page.right+1,'Preço fora da largura da etiqueta');
      for(const [part,rect] of Object.entries(layout)){
        assert.equal(rect.transform,'none',part+' girado via CSS');
        assert.equal(rect.writingMode,'horizontal-tb',part+' com orientação vertical');
      }
      const pdf=await win.webContents.printToPDF({
        printBackground:true,preferCSSPageSize:true,landscape:false,
        margins:{top:0,bottom:0,left:0,right:0},scale:1
      });
      assert.ok(pdf.length>500,'PDF da etiqueta não foi gerado');
      const pdfName=scenario.id+'.pdf';
      writeFileSync(join(output,pdfName),pdf);
      evidence.push({
        ...scenario,pdf:pdfName,widthMm:size.widthMm,heightMm:size.heightMm,
        marginMm:size.marginMm,layout,printOptions:nativeOptions,pdfBytes:pdf.length
      });
      console.log('LABEL_QA_RENDERED '+scenario.id+' '+size.widthMm+'x'+size.heightMm+' mm');
    }
    writeFileSync(join(output,'manifest.json'),JSON.stringify({scenarios:evidence,generatedAt:new Date().toISOString()},null,2));
  }finally{win.destroy();}
}
app.whenReady().then(run).then(()=>app.quit()).catch(error=>{
  console.error('LABEL_QA_RENDER_FAILED',error);
  app.exit(1);
});
