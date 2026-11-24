import ExcelJS from 'exceljs';
import {MAX_TRANSFER_BYTES,MAX_TRANSFER_ROWS,parseCsv,transferColumns} from '../shared/data-transfer.mjs';
// Limita o tamanho descompactado antes de entregar o ZIP ao ExcelJS; não aceita ZIP64.
function checkZip(bytes){
 const end=bytes.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
 if(end<0||end+22>bytes.length)throw new Error('XLSX inválido.');
 const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),start=bytes.readUInt32LE(end+16);
 if(count>2000||start+size>end||bytes.readUInt16LE(end+4)!==0||bytes.readUInt16LE(end+6)!==0)throw new Error('XLSX excede os limites de segurança.');
 let p=start,total=0;
 for(let i=0;i<count;i++){
  if(p+46>start+size||bytes.readUInt32LE(p)!==0x02014b50)throw new Error('XLSX inválido.');
  total+=bytes.readUInt32LE(p+24);
  if(total>64*1024*1024)throw new Error('XLSX excede o limite descompactado de 64 MB.');
  p+=46+bytes.readUInt16LE(p+28)+bytes.readUInt16LE(p+30)+bytes.readUInt16LE(p+32);
 }
 if(p!==start+size)throw new Error('XLSX inválido.');
}
function cellText(cell){
 const v=cell.value;
 if(v==null)return '';
 if(typeof v==='string')return v;
 if(typeof v==='number'&&Number.isFinite(v)){
  if(Number.isSafeInteger(v)&&/^0{2,}$/.test(cell.numFmt||''))return String(v).padStart(cell.numFmt.length,'0');
  return String(v);
 }
 if(v&&Array.isArray(v.richText))return v.richText.map(x=>x.text).join('');
 throw new Error('Célula '+cell.address+': fórmulas ou tipo de dado não suportado. Use texto ou número.');
}
export async function readTransferFile(format,bytes){
 if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>MAX_TRANSFER_BYTES)throw new Error('Arquivo inválido ou maior que 10 MB.');
 if(format==='csv')return parseCsv(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(format!=='xlsx')throw new Error('Use XLSX ou CSV.');
 const buf=Buffer.from(bytes);checkZip(buf);
 const book=new ExcelJS.Workbook();await book.xlsx.load(buf);
 const sheet=book.worksheets.find(s=>s.state==='visible'&&s.actualRowCount);
 if(!sheet||sheet.rowCount>MAX_TRANSFER_ROWS+1||sheet.columnCount>30)throw new Error('XLSX vazio ou excede 10.000 registros / 30 colunas.');
 const width=sheet.getRow(1).cellCount,table=[];
 if(!width)throw new Error('Cabeçalho obrigatório na linha 1.');
 sheet.eachRow((row,n)=>{
  if(row.cellCount>width)throw new Error('Linha '+n+': dados fora do cabeçalho.');
  const cells=Array.from({length:width},(_,i)=>cellText(row.getCell(i+1)));
  if(cells.some(x=>x.trim()))table.push(cells);
 });
 return table;
}
function addTransferRow(sheet,cols,cells,index){
  const row=sheet.addRow(cells.map((v,i)=>{
   const text=String(v??'');const key=cols[i]?.key;
   if(index===0||!(key==='stock_milli'||key?.endsWith('_cents')))return text;
   const numeric=Number(text.replace(',','.'));
   // Excel guarda 15 dígitos significativos; acima disso preserve o texto exato.
   return text&&Number.isFinite(numeric)&&text.replace(/[^0-9]/g,'').replace(/^0+/,'').length<=15?numeric:text;
  }));
  row.eachCell((c,i)=>{const key=cols[i-1]?.key;c.numFmt=typeof c.value==='number'?(key==='stock_milli'?'0.000':'0.00'):'@';});
  if(index===0)row.font={bold:true};
  return row;
}
export async function writeTransferXlsx(kind,rows,filename){
 const cols=transferColumns(kind);
 const book=new ExcelJS.stream.xlsx.WorkbookWriter({filename,useStyles:true,useSharedStrings:false});
 const sheet=book.addWorksheet(kind,{views:[{state:'frozen',ySplit:1}]});
 sheet.columns=cols.map(()=>({width:24}));
 let index=0;
 for(const cells of rows){
  if(index>=1048576)throw new Error('O formato XLSX suporta até 1.048.575 registros por aba. Exporte em CSV para volumes maiores.');
  addTransferRow(sheet,cols,cells,index++).commit();
 }
 sheet.commit();await book.commit();
 return index-1;
}
export async function makeTransferXlsx(kind,table){
 const book=new ExcelJS.Workbook();const sheet=book.addWorksheet(kind);
 const cols=transferColumns(kind);
 for(const [index,cells] of table.entries())addTransferRow(sheet,cols,cells,index);
 sheet.views=[{state:'frozen',ySplit:1}];
 sheet.getRow(1).font={bold:true};
 sheet.columns.forEach(c=>{c.width=24;});
 return new Uint8Array(await book.xlsx.writeBuffer());
}
