// Executado pelo GitHub Actions com binário Electron real (fonte e instalador NSIS).
// Exerce cadastro, venda e persistência sem mock do IPC nem capturas de referência.
import { _electron as electron } from 'playwright';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ownDir=!process.env.PDV_TEST_USER_DATA;
const userData=process.env.PDV_TEST_USER_DATA || mkdtempSync(join(tmpdir(),'pdv-better-e2e-'));
const executable=process.env.PDV_TEST_APP_EXECUTABLE;
const args=executable?[]:['.'];
let app;
async function launch(){
  return electron.launch({
    ...(executable?{executablePath:executable}:{}),
    args,
    env:{...process.env,PDV_TEST_USER_DATA:userData,PDV_TEST_SMOKE:'1'},
    timeout:45000
  });
}
const navigation=(page,label)=>page.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name:label,exact:true});
const wait=async(page)=>{
  page.on('console', msg=>console.log('Renderer console:',msg.type(),msg.text()));
  page.on('pageerror', error=>console.error('Renderer exception:',error.message));
  try{await page.getByRole('heading',{name:'Bem-vindo ao PDV Better'}).waitFor({timeout:30000});}
  catch(error){
    console.error('Janela atual:',page.url());
    console.error('Conteúdo visível:',(await page.locator('body').innerText().catch(()=>'' )).slice(0,1400));
    throw error;
  }
};
try{
  app=await launch();
  let page=await app.firstWindow();
  await wait(page);
  await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name:'Categorias',exact:true}).click();
  await page.getByRole('button',{name:/Adicionar categoria/i}).click();
  await page.getByRole('textbox',{name:'Nome da categoria'}).fill('Bebidas');
  await page.getByRole('button',{name:'Salvar cadastro'}).click();
  await page.getByRole('cell',{name:'Bebidas'}).waitFor();
  await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name:'Produtos',exact:true}).click();
  await page.getByRole('button',{name:/Adicionar produto/i}).click();
  await page.getByRole('textbox',{name:'Nome do produto'}).fill('Café Smoke');
  await page.getByRole('textbox',{name:/Código de barras/i}).fill('SMOKE1001');
  await page.getByRole('textbox',{name:/Preço de venda/i}).fill('12,50');
  await page.getByRole('textbox',{name:/Saldo em estoque/i}).fill('10,000');
  await page.getByRole('combobox',{name:'Categoria'}).selectOption({label:'Bebidas'});
  await page.getByRole('button',{name:'Salvar cadastro'}).click();
  await page.getByRole('cell',{name:'Café Smoke'}).waitFor();
  await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name:'Frente de caixa',exact:true}).click();
  await page.getByRole('button',{name:'Ir para abertura de caixa'}).click();
  await page.getByRole('button',{name:'Abrir caixa'}).click();
  await page.getByRole('status').filter({hasText:'Caixa aberto para vendas.'}).waitFor();
  await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name:'Frente de caixa',exact:true}).click();
  await page.getByRole('button',{name:/Café Smoke/}).click();
  await page.getByRole('button',{name:'Receber e concluir venda'}).click();
  await page.getByRole('textbox',{name:'Valor de pagamento 1'}).fill('12,50');
  await page.getByRole('button',{name:'Confirmar e concluir venda'}).click();
  await page.getByRole('status').filter({hasText:'concluída'}).waitFor({timeout:30000});
  await page.getByRole('dialog',{name:'Comprovante não fiscal da venda'}).getByRole('button',{name:'Concluir'}).click();
  await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name:'Vendas',exact:true}).click();
  await page.getByText('Concluída').first().waitFor();
  await app.close();app=null;
  if(!existsSync(join(userData,'pdv-better.sqlite')))throw Error('SQLite não foi criado no disco');
  app=await launch();
  page=await app.firstWindow();
  await wait(page);
  await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name:'Produtos',exact:true}).click();
  await page.getByRole('cell',{name:'Café Smoke'}).waitFor();
  await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name:'Vendas',exact:true}).click();
  await page.getByText('Concluída').first().waitFor();
  await page.getByRole('button',{name:'Comprovante'}).first().click();
  await page.getByRole('dialog',{name:'Comprovante não fiscal da venda'}).waitFor();
  await page.getByRole('dialog',{name:'Comprovante não fiscal da venda'}).getByRole('button',{name:'Concluir'}).click();
  console.log('SMOKE OK: Electron, IPC, cadastros, caixa, venda e dados persistidos após reinício');
}finally{
  if(app)await app.close();
  if(ownDir)rmSync(userData,{recursive:true,force:true});
}
