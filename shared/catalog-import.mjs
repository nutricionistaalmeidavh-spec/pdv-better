// CSV UTF-8 local, sem dependências externas. Cabeçalho em português.
const columns={nome:'name',codigo:'code',unidade:'unit',preco:'sale_price_cents',
 estoque:'stock_milli',custo:'cost_price_cents',categoria:'category_id',
 marca:'brand',produtor:'producer',grupo_variacao:'variant_group',variacao:'variant_label'};
const clean=s=>String(s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .replace(/[\s-]+/g,'_');
export function parseCatalogCsv(input){
 const csv=String(input??'').replace(/^\ufeff/,'');
 if(csv.length>120000)throw new Error('CSV excede 120 mil caracteres. Divida o arquivo.');
 if(!csv.trim())throw new Error('CSV vazio.');
 const rows=[],row=[];
 let field='',quoted=false,justClosed=false;
 for(let i=0;i<csv.length;i++){
  const ch=csv[i];
  if(quoted){
   if(ch==='"'&&csv[i+1]==='"'){field+='"';i++;}
   else if(ch==='"'){quoted=false;justClosed=true;}
   else field+=ch;
  }else if(ch==='"'&&!field&&!justClosed){quoted=true;}
  else if(ch===';'||ch==='\n'||ch==='\r'){
   row.push(field.trim());field='';justClosed=false;
   if(ch!==';'){
    if(row.some(x=>x!==''))rows.push(row.slice());
    row.length=0;if(ch==='\r'&&csv[i+1]==='\n')i++;
   }
  }else{
   if(justClosed&&ch!==' ')throw new Error('CSV: caracteres inválidos após aspas.');
   field+=ch;
  }
  if(field.length>500)throw new Error('CSV: campo excede limite.');
 }
 if(quoted)throw new Error('CSV com aspas não fechadas.');
 row.push(field.trim());if(row.some(x=>x!==''))rows.push(row);
 if(rows.length<2)throw new Error('CSV sem linhas de produtos.');
 if(rows.length>301)throw new Error('CSV excede 300 produtos.');
 const headers=rows.shift().map(clean);
 if(new Set(headers).size!==headers.length)throw new Error('Cabeçalho CSV duplicado.');
 for(const need of ['nome','codigo','unidade','preco','estoque'])
   if(!headers.includes(need))throw new Error('CSV sem coluna obrigatória: '+need);
 for(const header of headers)if(!columns[header])throw new Error('Coluna CSV não suportada: '+header);
 const seen=new Set();
 return rows.map((cells,i)=>{
  if(cells.length!==headers.length)throw new Error('CSV: quantidade de colunas inválida na linha '+(i+2));
  const data=Object.fromEntries(headers.map((h,j)=>[columns[h],cells[j]]));
  if(!data.code||!data.code.trim())throw new Error('Código é obrigatório na linha '+(i+2));
  data.code=data.code.toUpperCase();
  if(seen.has(data.code))throw new Error('Código duplicado no CSV: '+data.code);
  seen.add(data.code);
  return data;
 });
}
