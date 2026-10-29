import {parentPort} from 'node:worker_threads';
import {itemReportCsv,itemReportHtml,itemReportSheetRows} from '../shared/item-report-export.mjs';
if(parentPort)parentPort.on('message',async input=>{
 try{
  const {format,report}=input||{};
  if(!['csv','html','xlsx'].includes(format))throw new Error('Formato de relatório inválido.');
  let data;
  if(format==='csv')data=itemReportCsv(report);
  if(format==='html')data=itemReportHtml(report);
  if(format==='xlsx'){
   const ExcelJS=(await import('exceljs')).default;
   const book=new ExcelJS.Workbook();
   const sheet=book.addWorksheet('Itens vendidos');
   const exportData=itemReportSheetRows(report);
   sheet.columns=exportData.columns.map(c=>({header:c.label,key:c.key,width:c.key==='product_name'?34:22}));
   sheet.getRow(1).font={bold:true};
   for(const row of exportData.rows)sheet.addRow(row);
   sheet.views=[{state:'frozen',ySplit:1}];
   data=await book.xlsx.writeBuffer();
  }
  parentPort.postMessage({ok:true,data});
 }catch(error){
  parentPort.postMessage({ok:false,error:String(error?.message||error).slice(0,300)});
 }
});
