// Teste fim a fim: atualização em cima do SQLite e recuperação sem e-mail, no Electron real.
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyDatabase} from '../electron/backup.mjs';

const folder=mkdtempSync(join(tmpdir(),'pdv-recovery-e2e-'));
const executable=process.env.PDV_TEST_APP_EXECUTABLE;
let app;
async function launch(){
 return electron.launch({
   ...(executable?{executablePath:executable}:{}),
   args:executable?[]:['.'],
   env:{...process.env,PDV_TEST_SMOKE:'1',PDV_TEST_USER_DATA:folder},
   timeout:60000
 });
}
try{
 app=await launch();
 let page=await app.firstWindow();
 await page.getByRole('textbox',{name:'Nome do administrador'}).fill('Dono QA');
 await page.locator('.auth-form input[type=password]').nth(0).fill('SenhaOriginal2026!');
 await page.locator('.auth-form input[type=password]').nth(1).fill('SenhaOriginal2026!');
 await page.getByRole('button',{name:'Criar administrador'}).click();
 await page.getByRole('heading',{name:'Bem-vindo ao PDV Plus'}).waitFor({timeout:30000});
 const before=await page.evaluate(async()=>{
   const product=await window.pdv.save('products',{
     name:'Produto preservado pela recuperação',unit:'UN',sale_price_cents:'15,00',stock_milli:'3'
   });
   return product.id;
 });
 await app.close();app=null;

 app=await launch();
 page=await app.firstWindow();
 await page.getByRole('button',{name:'Entrar no PDV'}).waitFor({timeout:30000});
 await page.getByRole('button',{name:'Esqueci minha senha'}).click();
 await page.getByText(/A recuperação só funciona no computador/).waitFor();
 await page.getByLabel('Nova senha',{exact:true}).fill('SenhaNova2026!');
 await page.getByLabel('Repita a nova senha').fill('SenhaNova2026!');
 await page.getByLabel('Digite REDEFINIR para confirmar').fill('REDEFINIR');
 await page.getByRole('button',{name:'Criar backup e redefinir senha'}).click();
 await page.getByRole('status').filter({hasText:'Senha redefinida'}).waitFor({timeout:30000});
 await page.locator('.auth-form input[type=password]').first().fill('SenhaOriginal2026!');
 await page.getByRole('button',{name:'Entrar no PDV'}).click();
 await page.getByRole('alert').filter({hasText:'Credenciais inválidas'}).waitFor();
 await page.locator('.auth-form input[type=password]').first().fill('SenhaNova2026!');
 await page.getByRole('button',{name:'Entrar no PDV'}).click();
 await page.getByRole('heading',{name:'Bem-vindo ao PDV Plus'}).waitFor({timeout:30000});
 assert.equal((await page.evaluate(async id=>(await window.pdv.list('products')).some(p=>p.id===id),before)),true);
 const backups=readdirSync(folder).filter(name=>name.startsWith('PDV-Plus-Antes-Recuperacao-')&&name.endsWith('.sqlite'));
 assert.equal(backups.length,1);
 assert.equal(verifyDatabase(join(folder,backups[0])).integrity,'ok');
 console.log('RECOVERY_E2E_OK: senha alterada, hash antigo inválido, produto preservado e backup íntegro.');
}finally{
 await app?.close().catch(()=>{});
 rmSync(folder,{recursive:true,force:true});
}
