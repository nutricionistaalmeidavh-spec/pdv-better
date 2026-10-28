// Auditoria visual do Electron real, sem mock de tela, persistindo dados ficticios no SQLite.
// Uso: npm install --no-save pdf-lib && node scripts/qa-all-screens.mjs
import { _electron as electron } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const output=join(process.cwd(),'qa-evidence');
const shots=join(output,'screenshots');
mkdirSync(shots,{recursive:true});
const userData=mkdtempSync(join(tmpdir(),'pdv-visual-qa-'));
const captures=[];
const failures=[];
let app;
const pwd='SenhaQA2026!';
const now=()=>new Date().toISOString();
const nav=(page,label)=>page.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name:label,exact:true});
const names=[
  ['dashboard','Visão geral'],['checkout','Frente de caixa'],['cash','Controle de caixa'],
  ['sales','Vendas'],['inventory','Estoque'],['finance','Financeiro'],['reports','Relatórios'],
  ['products','Produtos'],['categories','Categorias'],['customers','Clientes'],
  ['suppliers','Fornecedores'],['operators','Operadores'],['settings','Dispositivos e rede']
];
const basename=(value)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').toLowerCase();
let page;
async function capture(title, {selector=null}={}){
  if(selector)await page.locator(selector).waitFor({state:'visible',timeout:20000});
  await page.waitForTimeout(220);
  const id=String(captures.length+1).padStart(2,'0');
  const file=id+'-'+basename(title)+'.jpg';
  const buffer=await page.screenshot({type:'jpeg',quality:82,animations:'disabled',timeout:30000});
  writeFileSync(join(shots,file),buffer);
  captures.push({id,title,file,at:now(),bytes:buffer.length});
  console.log('QA_VISUAL '+id+' '+title);
}
async function go(label){
  await nav(page,label).click();
  await page.locator('.page-heading h1').first().waitFor({timeout:20000});
  await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name:label,exact:true}).waitFor();
  await page.waitForTimeout(260);
}
async function seed(){
  const result=await page.evaluate(async(password)=>{
    const api=window.pdv;
    const categories=[];
    for(const name of ['Bebidas','Mercearia','Higiene','Padaria','Laticínios','Congelados'])
      categories.push(await api.save('categories',{name}));
    const customers=[];
    for(let i=1;i<=18;i++){
      customers.push(await api.save('customers',{
        name:'Cliente Demonstração '+String(i).padStart(2,'0'),
        document:'999.999.'+String(i).padStart(3,'0')+'-00',
        phone:'(16) 90000-'+String(i).padStart(4,'0'),
        email:'cliente'+i+'@example.test'
      }));
    }
    for(let i=1;i<=12;i++)await api.save('suppliers',{
      name:'Fornecedor Fictício '+String(i).padStart(2,'0')+' Ltda',
      document:'99.999.999/0001-'+String(i).padStart(2,'0'),
      phone:'(16) 90011-'+String(i).padStart(4,'0'),
      email:'fornecedor'+i+'@example.test'
    });
    const operatorData=[
      ['Operador Caixa QA','Caixa'],['Gerente de Loja QA','Gerente'],
      ['Supervisora Administrativa QA','Administrador'],['Operador Reserva QA','Caixa']
    ];
    for(const [name,role] of operatorData){
      const op=await api.save('operators',{name,role});
      await api.authSetPassword({operatorId:op.id,password});
    }
    const productNames=[
      'Café Especial 500g','Arroz Integral 1kg','Feijão Carioca 1kg','Açúcar Cristal 1kg',
      'Leite Integral 1L','Pão de Forma 450g','Manteiga 200g','Iogurte Natural',
      'Refrigerante Cola 2L','Suco de Laranja 1L','Água Mineral 500ml','Água com Gás 500ml',
      'Sabonete Vegetal','Shampoo 350ml','Detergente Neutro','Papel Toalha',
      'Farinha de Trigo 1kg','Biscoito de Chocolate','Macarrão Espaguete','Molho de Tomate',
      'Queijo Muçarela 200g','Presunto Fatiado 200g','Sorvete Creme 1L','Pizza Congelada',
      'Café Torrado 250g','Granola Integral','Aveia em Flocos','Chocolate 70%'
    ];
    const products=[];
    for(let i=0;i<productNames.length;i++){
      const cents=450+i*175, cost=Math.max(100,Math.round(cents*0.57));
      products.push(await api.save('products',{
        name:productNames[i],code:'QA26'+String(i+1).padStart(8,'0'),
        category_id:categories[i%categories.length].id,
        unit:'UN',sale_price_cents:(cents/100).toFixed(2),
        cost_price_cents:(cost/100).toFixed(2),stock_milli:(35+i*4).toFixed(3)
      }));
    }
    await api.sessionOpen({openingCashCents:'250,00'});
    await api.cashMove({kind:'reinforcement',amountCents:'150,00',note:'Reforço de abertura QA'});
    await api.cashMove({kind:'withdrawal',amountCents:'35,00',note:'Sangria simulada QA'});
    const scenarios=[
      {items:[0,1,2],method:'cash',customer:0,discount:250},
      {items:[3,4,5],method:'pix',customer:1,discount:0},
      {items:[6,7,8],method:'card',customer:2,discount:100},
      {items:[9,10,11],method:'credit',customer:3,discount:0},
      {items:[12,13],method:'cash',customer:4,discount:0},
      {items:[14,15],method:'pix',customer:5,discount:0}
    ];
    const sales=[];
    for(let i=0;i<scenarios.length;i++){
      const entry=scenarios[i];
      const total=entry.items.reduce((sum,idx)=>sum+products[idx].sale_price_cents,0)-entry.discount;
      const sale=await api.checkout({
        key:'qa-visual-20261028-'+i,
        items:entry.items.map(idx=>({id:products[idx].id,quantityMilli:1000})),
        customerId:customers[entry.customer].id,
        discountCents:entry.discount,
        payments:[{method:entry.method,amountCents:(total/100).toFixed(2)}]
      });
      sales.push(sale);
    }
    await api.salesCancel(sales[sales.length-1].id);
    for(let i=1;i<=8;i++)await api.financeCreate({
      type:i%2?'payable':'receivable',
      description:['Aluguel da loja','Compra de estoque','Serviço de internet','Manutenção elétrica','Venda corporativa','Energia e água','Recebível de convênio','Material de limpeza'][i-1],
      amountCents:(75+i*57.25).toFixed(2),
      dueOn:'2026-11-'+String(5+i*2).padStart(2,'0')
    });
    return {categories:categories.length,customers:customers.length,suppliers:12,operators:operatorData.length,products:products.length,sales:sales.length,finance:8};
  },pwd);
  return result;
}
async function buildPDF(){
  const pdf=await PDFDocument.create();
  pdf.setTitle('PDV Better | QA Visual Completo');
  pdf.setSubject('Capturas do Electron real usando SQLite e dados ficticios');
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const cover=pdf.addPage([842,595]);
  cover.drawRectangle({x:0,y:0,width:842,height:595,color:rgb(0.058,0.074,0.125)});
  cover.drawText('PDV BETTER', {x:58,y:460,size:34,font:bold,color:rgb(1,1,1)});
  cover.drawText('AUDITORIA VISUAL | WINDOWS 10/11',{x:58,y:414,size:18,font,color:rgb(0.73,0.83,1)});
  cover.drawText('Electron real  -  SQLite temporario  -  Dados inteiramente ficticios',{x:58,y:374,size:13,font,color:rgb(0.91,0.94,1)});
  cover.drawText('Capturas: '+captures.length+'  |  Gerado em: '+now().replace(/[^\x20-\x7e]/g,''),{x:58,y:330,size:12,font,color:rgb(1,1,1)});
  cover.drawText('Origem: github.com/nutricionistaalmeidavh-spec/pdv-better',{x:58,y:292,size:11,font,color:rgb(0.85,0.9,1)});
  cover.drawText('Os prints sao evidencias visuais; perifericos fisicos, fiscal e rede externa', {x:58,y:95,size:11,font,color:rgb(1,1,1)});
  cover.drawText('nao foram homologados por estas capturas.', {x:58,y:79,size:11,font,color:rgb(1,1,1)});
  for(const item of captures){
    const p=pdf.addPage([842,595]);
    p.drawRectangle({x:0,y:0,width:842,height:595,color:rgb(0.97,0.98,0.99)});
    const normalized=item.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    p.drawText(item.id+'  '+normalized.slice(0,92),{x:30,y:560,size:16,font:bold,color:rgb(0.14,0.17,0.28)});
    const img=await pdf.embedJpg(new Uint8Array((await import('node:fs')).readFileSync(join(shots,item.file))));
    const scale=Math.min(782/img.width,510/img.height);
    p.drawImage(img,{x:(842-img.width*scale)/2,y:28+(510-img.height*scale)/2,width:img.width*scale,height:img.height*scale});
    p.drawText('PDV Better | Evidencia real | '+item.id+'/'+String(captures.length).padStart(2,'0'),{x:32,y:12,size:8,font,color:rgb(0.42,0.44,0.51)});
  }
  const bytes=await pdf.save({useObjectStreams:true});
  writeFileSync(join(output,'PDV-Better-QA-Todas-as-Telas.pdf'),bytes);
}
async function main(){
  app=await electron.launch({
    args:['.'],
    env:{...process.env,PDV_TEST_USER_DATA:userData,PDV_TEST_SMOKE:'1'},
    timeout:60000
  });
  page=await app.firstWindow();
  await page.setViewportSize({width:1440,height:900});
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  await page.getByRole('heading',{name:'PDV Better',exact:true}).waitFor({timeout:30000});
  await page.getByRole('button',{name:'Criar administrador'}).waitFor();
  await capture('Primeiro acesso - cadastrar administrador',{selector:'.auth-panel'});
  await page.getByRole('textbox',{name:'Nome do administrador'}).fill('Administrador Principal QA');
  await page.locator('.auth-form input[type=password]').nth(0).fill(pwd);
  await page.locator('.auth-form input[type=password]').nth(1).fill(pwd);
  await capture('Primeiro acesso - formulario preenchido');
  await page.getByRole('button',{name:'Criar administrador'}).click();
  await page.getByRole('heading',{name:'Bem-vindo ao PDV Better'}).waitFor();
  await go('Controle de caixa');
  await capture('Caixa fechado - abertura de turno');
  const seeds=await seed();
  console.log('DADOS FICTICIOS: '+JSON.stringify(seeds));
  await page.getByRole('button',{name:'Sair'}).click();
  await page.getByRole('button',{name:'Entrar no PDV'}).waitFor();
  await capture('Login de operador - lista de perfis');
  await page.locator('.auth-form input[type=password]').first().fill(pwd);
  await page.getByRole('button',{name:'Entrar no PDV'}).click();
  await page.getByRole('heading',{name:'Bem-vindo ao PDV Better'}).waitFor();
  const buttons=await page.getByRole('navigation',{name:'Navegação principal'}).locator('button.nav-item').allTextContents();
  for(const [,label] of names)if(!buttons.some(s=>s.trim()===label))throw new Error('Falta tela no menu administrativo: '+label);
  for(const [key,label] of names){
    await go(label);
    await capture('Menu - '+label,{selector:'.page-heading'});
    if(['products','categories','customers','suppliers','operators'].includes(key)){
      const singular={products:'produto',categories:'categoria',customers:'cliente',suppliers:'fornecedor',operators:'operador'}[key];
      await page.getByRole('button',{name:'Adicionar '+singular,exact:true}).click();
      await page.locator('[role="dialog"]').last().waitFor();
      await capture('Cadastro - adicionar '+singular+' - formulario');
      await page.locator('[role="dialog"]').last().getByRole('button',{name:'Cancelar'}).click();
      const edit=page.locator('.data-panel button[title="Editar cadastro"]').first();
      await edit.click();
      await capture('Cadastro - editar '+singular+' - dados existentes');
      await page.locator('[role="dialog"]').last().getByRole('button',{name:'Cancelar'}).click();
      if(key==='operators'){
        await page.getByRole('button',{name:'Definir senha'}).first().click();
        await capture('Perfis - definir senha de operador');
        await page.getByRole('dialog',{name:'Definir senha do operador'}).getByRole('button',{name:'Cancelar'}).click();
      }
    }
    if(key==='settings'){
      for(const t of ['Rede local','Periféricos','Backups']){
        await page.getByRole('tab',{name:t}).click();
        await capture('Configuracoes - '+t);
      }
    }
    if(key==='sales'){
      await page.getByRole('button',{name:'Comprovante'}).first().click();
      await page.getByRole('dialog',{name:'Comprovante não fiscal da venda'}).waitFor();
      await capture('Vendas - reimpressao de comprovante');
      await page.getByRole('dialog',{name:'Comprovante não fiscal da venda'}).getByRole('button',{name:'Concluir'}).click();
    }
  }
  await go('Frente de caixa');
  await page.locator('button.product-option').nth(0).click();
  await page.locator('button.product-option').nth(1).click();
  await capture('Frente de caixa - carrinho preenchido');
  await page.getByRole('button',{name:'Receber e concluir venda'}).click();
  await page.getByRole('dialog',{name:'Receber venda'}).waitFor();
  await page.getByRole('dialog',{name:'Receber venda'}).getByRole('combobox').first().selectOption({index:1});
  await capture('Frente de caixa - modal de pagamento');
  await page.getByRole('dialog',{name:'Receber venda'}).getByRole('button',{name:'Dividir pagamento'}).click();
  await capture('Frente de caixa - pagamento dividido');
  await page.getByRole('dialog',{name:'Receber venda'}).getByRole('button',{name:'Voltar ao carrinho'}).click();
  await go('Controle de caixa');
  await capture('Caixa aberto - sangria reforco e historico');
  await page.getByRole('button',{name:'Sair'}).click();
  await page.getByRole('button',{name:'Entrar no PDV'}).waitFor();
  for(const [label,role] of [['Operador Caixa QA','Caixa'],['Gerente de Loja QA','Gerente']]){
    const options=await page.locator('.auth-form select option').all();
    let value='';
    for(const op of options){const txt=await op.textContent();if(txt?.includes(label)){value=await op.getAttribute('value');break;}}
    if(!value)throw new Error('Perfil nao encontrado: '+role);
    await page.locator('.auth-form select').selectOption(value);
    await page.locator('.auth-form input[type=password]').first().fill(pwd);
    await page.getByRole('button',{name:'Entrar no PDV'}).click();
    await page.getByRole('heading',{name:'Bem-vindo ao PDV Better'}).waitFor();
    await capture('Perfil '+role+' - visao geral e permissoes');
    const navLabels=await page.getByRole('navigation',{name:'Navegação principal'}).locator('button.nav-item').allTextContents();
    if(role==='Caixa'&&navLabels.some(x=>/Financeiro|Operadores|Relatórios|Dispositivos e rede/.test(x)))throw new Error('Perfil Caixa visualiza menu restrito.');
    if(role==='Gerente'&&navLabels.some(x=>/Operadores|Dispositivos e rede/.test(x)))throw new Error('Perfil Gerente visualiza administracao restrita.');
    await page.getByRole('button',{name:'Sair'}).click();
    await page.getByRole('button',{name:'Entrar no PDV'}).waitFor();
  }
  if(pageErrors.length)throw new Error('Erros no renderer: '+pageErrors.join(' | '));
  const seen=new Set(captures.map(x=>x.title));
  for(const [,label] of names)if(!seen.has('Menu - '+label))throw new Error('Print ausente: '+label);
  for(const tab of ['Rede local','Periféricos','Backups'])if(!seen.has('Configuracoes - '+tab))throw new Error('Print de aba ausente: '+tab);
  writeFileSync(join(output,'manifest.json'),JSON.stringify({
    generatedAt:now(),repository:'nutricionistaalmeidavh-spec/pdv-better',branch:'qa/evidencias-visuais-pdf-20261028',
    source:'Electron real + SQLite temporario',fictitiousData:seeds,menuCoverage:names.map(x=>x[1]),
    screenshots:captures,rendererErrors:pageErrors,failures
  },null,2));
  await buildPDF();
  console.log('QA_VISUAL_OK '+captures.length+' capturas e PDF.');
}
try{await main();}
catch(e){
  failures.push(String(e.stack||e));
  writeFileSync(join(output,'ERROR.txt'),failures.join('\n'));
  writeFileSync(join(output,'manifest-parcial.json'),JSON.stringify({captures,failures,generatedAt:now()},null,2));
  console.error(e);
  process.exitCode=1;
}
finally{
  if(app)await app.close().catch(()=>{});
  rmSync(userData,{recursive:true,force:true});
}
