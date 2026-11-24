import {entities} from './contract.mjs';
export const transferKinds=['products','inventory','customers','suppliers','categories'];
export const MAX_TRANSFER_ROWS=10000;
export const MAX_TRANSFER_BYTES=10*1024*1024;
const labels={id:'ID',name:'Nome',code:'Código',brand:'Marca',producer:'Produtor',variant_group:'Grupo de variação',variant_label:'Variação',category_id:'Categoria',unit:'Unidade',sale_price_cents:'Preço',cost_price_cents:'Custo',stock_milli:'Estoque',document:'CPF / CNPJ',phone:'Telefone',email:'E-mail'};
export function transferColumns(kind){
 if(!transferKinds.includes(kind))throw new Error('Cadastro não suportado para planilhas.');
 const keys=kind==='inventory'?['code','stock_milli']:['id',...entities[kind].fields.filter(f=>f.type!=='image').map(f=>f.key)];
 return keys.map(key=>({key,label:labels[key]}));
}
const clean=v=>String(v).trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const aliases={sku:'code',codigo_de_barras:'code',codigo_de_barras_sku:'code',produto:'name',nome_do_produto:'name',nome_da_categoria:'name',razao_social_nome:'name',razao_social:'name',cpf:'document',cnpj:'document',cnpj_cpf:'document',documento:'document',email:'email',celular:'phone',saldo:'stock_milli',quantidade:'stock_milli',saldo_em_estoque:'stock_milli',preco_de_venda:'sale_price_cents',preco_de_venda_r:'sale_price_cents',preco_de_custo:'cost_price_cents',preco_de_custo_r:'cost_price_cents',familia_de_variantes:'variant_group',variante:'variant_label'};
export function transferRecords(kind,table){
 const cols=transferColumns(kind);
 if(!Array.isArray(table)||table.length<2||table.length>MAX_TRANSFER_ROWS+1)throw new Error('Informe de 1 a 10.000 registros por arquivo.');
 if(!Array.isArray(table[0])||table[0].length>30)throw new Error('Cabeçalho inválido.');
 const headers=table[0].map(h=>{const key=clean(h);const col=cols.find(c=>clean(c.label)===key||c.key===key||c.key===aliases[key]);if(!col)throw new Error('Coluna não reconhecida: '+h);return col.key;});
 if(new Set(headers).size!==headers.length)throw new Error('Coluna duplicada.');
 for(const k of kind==='inventory'?['code','stock_milli']:kind==='products'?['name','code','unit','sale_price_cents']:['name'])if(!headers.includes(k))throw new Error('Coluna obrigatória: '+labels[k]);
 return table.slice(1).map((row,i)=>{
  if(!Array.isArray(row)||row.length!==headers.length||row.some(x=>typeof x!=='string'||x.length>500))throw new Error('Linha '+(i+2)+': células ou quantidade de colunas inválidas.');
  return Object.fromEntries(headers.map((h,j)=>[h,row[j].trim()]));
 });
}
function delimiter(csv){
 let q=false,commas=0,semis=0;
 for(let i=0;i<csv.length;i++){const c=csv[i];if(c==='"'){if(q&&csv[i+1]==='"')i++;else q=!q;}else if(!q){if(c==='\r'||c==='\n')break;if(c===',')commas++;if(c===';')semis++;}}
 return semis>=commas?';':',';
}
const danger=/^[\s]*[=+\-@]/;
const protect=v=>{const s=String(v??'');return danger.test(s)||s.startsWith("'")?"'"+s:s;};
const unprotect=s=>s.startsWith("''")||(s.startsWith("'")&&danger.test(s.slice(1)))?s.slice(1):s;
export function parseCsv(input){
 if(typeof input!=='string'||input.length>MAX_TRANSFER_BYTES)throw new Error('CSV inválido ou maior que 10 MB.');
 const csv=input.replace(/^\uFEFF/,'');const sep=delimiter(csv);
 const rows=[];let row=[],field='',quoted=false,closed=false;
 const push=()=>{row.push(unprotect(field));field='';closed=false;if(row.length>30)throw new Error('CSV com colunas demais.');};
 const finish=()=>{push();if(row.some(x=>x.trim()))rows.push(row);row=[];if(rows.length>MAX_TRANSFER_ROWS+1)throw new Error('CSV excede 10.000 registros.');};
 for(let i=0;i<csv.length;i++){
  const c=csv[i];
  if(quoted){if(c==='"'&&csv[i+1]==='"'){field+='"';i++;}else if(c==='"'){quoted=false;closed=true;}else field+=c;}
  else if(c===sep)push();
  else if(c==='\n'||c==='\r'){finish();if(c==='\r'&&csv[i+1]==='\n')i++;}
  else if(c==='"'&&!field&&!closed)quoted=true;
  else if(closed||c==='"')throw new Error('CSV com aspas inválidas.');
  else field+=c;
  if(field.length>500)throw new Error('CSV: célula excede 500 caracteres.');
 }
 if(quoted)throw new Error('CSV com aspas não fechadas.');
 finish();return rows;
}
export function writeCsv(table){return '\uFEFF'+table.map(row=>row.map(v=>'"'+protect(v).replaceAll('"','""')+'"').join(';')).join('\r\n')+'\r\n';}
