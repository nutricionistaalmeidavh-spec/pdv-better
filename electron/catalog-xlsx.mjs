// Conversão local de Excel para o CSV canônico do catálogo; sem internet nem SQL.
import ExcelJS from 'exceljs';

const MAX_XLSX_BYTES=2*1024*1024;
const MAX_PRODUCTS=300;
const MAX_CSV_LENGTH=120000;
const headerAliases=new Map(Object.entries({
  nome:'nome',produto:'nome',nome_do_produto:'nome',
  codigo:'codigo',sku:'codigo',codigo_de_barras:'codigo',
  codigo_de_barras_sku:'codigo',codigo_sku:'codigo',
  unidade:'unidade',tipo_de_unidade:'unidade',
  preco:'preco',preco_de_venda:'preco',preco_venda:'preco',
  preco_de_venda_r:'preco',valor_de_venda:'preco',
  estoque:'estoque',quantidade:'estoque',saldo:'estoque',
  saldo_em_estoque:'estoque',quantidade_em_estoque:'estoque',
  custo:'custo',preco_de_custo:'custo',preco_custo:'custo',
  preco_de_custo_r:'custo',
  categoria:'categoria',categoria_id:'categoria',
  marca:'marca',produtor:'produtor',fabricante:'produtor',
  grupo_variacao:'grupo_variacao',familia_de_variantes:'grupo_variacao',
  variacao:'variacao',variante:'variacao',variante_tamanho_sabor:'variacao'
}));
const normalizedHeader=value=>String(value??'').trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
function cellText(cell,ref){
  const value=cell.value;
  if(value===null||value===undefined)return '';
  if(typeof value==='string')return value.trim();
  if(typeof value==='number'){
    if(!Number.isFinite(value))throw new Error('Excel: número inválido em '+ref+'.');
    return String(value);
  }
  if(value&&typeof value==='object'&&
    (Object.hasOwn(value,'formula')||Object.hasOwn(value,'sharedFormula')))
    throw new Error('Excel: fórmulas não são permitidas ('+ref+'). Substitua pela quantidade ou pelo valor.');
  if(value&&typeof value==='object'&&Array.isArray(value.richText))
    return value.richText.map(part=>part.text??'').join('').trim();
  throw new Error('Excel: tipo de célula não suportado em '+ref+'. Use texto ou número, sem fórmulas.');
}
function codeText(cell,ref){
  const value=cell.value;
  if(typeof value!=='number')return cellText(cell,ref);
  if(!Number.isSafeInteger(value)||value<0)
    throw new Error('Excel: código numérico inválido em '+ref+'. Formate códigos longos como Texto.');
  const zeros=String(cell.numFmt||'').match(/^0{2,20}$/);
  return zeros?String(value).padStart(zeros[0].length,'0'):String(value);
}
function decimalText(cell,kind,ref){
  const value=cell.value;
  if(typeof value==='number'){
    if(!Number.isFinite(value)||value<0)throw new Error('Excel: valor inválido em '+ref+'.');
    const places=kind==='estoque'?3:2;
    const n=value.toFixed(places);
    if(Math.abs(value-Number(n))>1e-8)throw new Error('Excel: valor em '+ref+
      ' excede '+places+' casas decimais.');
    return n;
  }
  const text=cellText(cell,ref).replace(/^R\$\s*/i,'').replace(/\s/g,'');
  // 1.234,56 é notação brasileira; 1234.56 é decimal do Excel.
  return /^[-+]?\d{1,3}(?:\.\d{3})+,\d{1,3}$/.test(text)
    ?text.replace(/\./g,'') : text;
}
const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';

export async function xlsxToCatalogCsv(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.byteLength===0||bytes.byteLength>MAX_XLSX_BYTES)
    throw new Error('Excel XLSX inválido ou maior que 2 MB. Divida a planilha.');
  const book=new ExcelJS.Workbook();
  try{
    await book.xlsx.load(Buffer.from(bytes));
  }catch(error){
    throw new Error('Não foi possível abrir o arquivo Excel XLSX. Confirme que é uma planilha .xlsx válida.');
  }
  const sheet=book.worksheets.find(worksheet=>worksheet.state==='visible'&&worksheet.actualRowCount>0);
  if(!sheet)throw new Error('Excel XLSX sem aba de produtos. Use a primeira aba visível.');
  if(sheet.actualRowCount>MAX_PRODUCTS+1)
    throw new Error('Excel XLSX excede 300 produtos por arquivo. Divida a planilha.');
  const data=[];
  sheet.eachRow({includeEmpty:false},(row,rowNumber)=>{
    if(row.values.slice(1).every(v=>v===null||v===undefined||v===''))return;
    data.push({row,rowNumber});
  });
  if(data.length<2)throw new Error('Excel XLSX sem cabeçalho e produtos.');
  const columns=[];
  const head=data[0];
  if(head.row.cellCount>30)throw new Error('Excel XLSX tem colunas demais.');
  for(let index=1;index<=head.row.cellCount;index++){
    const col=normalizedHeader(cellText(head.row.getCell(index),head.rowNumber+':'+index));
    if(!col){if(data.some(item=>item.row.getCell(index).value!==null))throw new Error('Excel: cabeçalho vazio na coluna '+index+'.');continue;}
    const canonical=headerAliases.get(col);
    if(!canonical)throw new Error('Excel: coluna não reconhecida: '+col+'. Use Nome, Código, Unidade, Preço e Estoque.');
    if(columns.includes(canonical))throw new Error('Excel: coluna duplicada: '+canonical+'.');
    columns.push(canonical);
  }
  for(const required of ['nome','codigo','unidade','preco','estoque'])
    if(!columns.includes(required))throw new Error('Excel: coluna obrigatória ausente: '+required+'.');
  if(data.length-1>MAX_PRODUCTS)
    throw new Error('Excel XLSX excede 300 produtos por arquivo. Divida a planilha.');
  const lines=[columns.map(quote).join(';')];
  for(const {row,rowNumber} of data.slice(1)){
    // Lê somente colunas declaradas: ignora o estilo e não executa macros ou fórmulas.
    const cells=columns.map((column,index)=>{
      const cell=row.getCell(index+1),ref=cell.address||('linha '+rowNumber);
      if(column==='codigo')return codeText(cell,ref);
      if(['preco','custo','estoque'].includes(column))return decimalText(cell,column,ref);
      const value=cellText(cell,ref);
      return column==='unidade'?value.toUpperCase():value;
    });
    lines.push(cells.map(quote).join(';'));
  }
  const csv=lines.join('\n')+'\n';
  if(csv.length>MAX_CSV_LENGTH)
    throw new Error('Excel excede o tamanho permitido para importação. Divida em arquivos menores.');
  return csv;
}
