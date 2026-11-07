// QA funcional do onboarding real no Electron e SQLite isolado.
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright';
import {getTourSteps,tourStorageKey} from '../shared/guided-tour.mjs';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const dir=mkdtempSync(join(tmpdir(),'pdv-guided-tour-'));
const out='qa-artifacts';
mkdirSync(out,{recursive:true});
let app,page;
const pwd='TourQA2026!';
try{
  app=await electron.launch({
    args:['.'],env:{...process.env,PDV_TEST_USER_DATA:dir,PDV_TEST_SMOKE:'1'},timeout:60000
  });
  page=await app.firstWindow();
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('heading',{name:'PDV SUPER',exact:true}).waitFor();
  await page.getByRole('textbox',{name:'Nome do administrador'}).fill('Administrador Tour QA');
  await page.locator('.auth-form input[type=password]').nth(0).fill(pwd);
  await page.locator('.auth-form input[type=password]').nth(1).fill(pwd);
  await page.getByRole('button',{name:'Criar administrador'}).click();
  await page.getByRole('heading',{name:'Bem-vindo ao PDV SUPER'}).waitFor();
  const invite=page.locator('.guided-tour-invite');
  await invite.waitFor({state:'visible',timeout:15000});
  await page.screenshot({path:join(out,'tour-convite.png')});
  await invite.getByRole('button',{name:'Começar tour'}).click();
  const dlg=page.getByRole('dialog',{name:'Tour guiado do PDV SUPER'});
  await dlg.waitFor();
  const steps=getTourSteps('Administrador');
  for(let i=0;i<steps.length;i++){
    await dlg.getByRole('heading',{name:steps[i].title,exact:true}).waitFor();
    await page.locator(steps[i].selector).waitFor({state:'visible',timeout:20000});
    await page.locator('.guided-tour-spotlight').waitFor({state:'visible',timeout:10000});
    if(i===2)await page.screenshot({path:join(out,'tour-produtos.png')});
    if(i===steps.length-1)break;
    await dlg.getByRole('button',{name:'Próximo'}).click();
  }
  await dlg.getByRole('button',{name:'Concluir'}).click();
  await dlg.waitFor({state:'hidden'});
  const stored=await page.evaluate(key=>localStorage.getItem(key),tourStorageKey(
    (await page.evaluate(async()=>window.pdv.authStatus())).operators[0].id
  ));
  assert.equal(stored,'completed','tour concluído deve persistir por operador');
  await page.getByRole('button',{name:'Tour guiado'}).click();
  await dlg.waitFor();
  await dlg.getByRole('button',{name:'Próximo'}).click();
  await dlg.getByRole('button',{name:'Voltar'}).click();
  await dlg.getByRole('heading',{name:steps[0].title}).waitFor();
  await page.keyboard.press('Escape');
  await dlg.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Sair',exact:true}).click();
  await page.getByRole('button',{name:'Entrar no PDV'}).waitFor();
  await page.locator('.auth-form input[type=password]').first().fill(pwd);
  await page.getByRole('button',{name:'Entrar no PDV'}).click();
  await page.getByRole('heading',{name:'Bem-vindo ao PDV SUPER'}).waitFor();
  assert.equal(await invite.count(),0,'tour pulado não reabre após novo login');
  console.log('QA_TOUR_OK: convite, spotlight em todos os passos, persistência, voltar e reabrir.');
}catch(error){
  console.error('QA_TOUR_FAIL',error);
  if(page)await page.screenshot({path:join(out,'tour-falha.png')}).catch(()=>{});
  process.exitCode=1;
}finally{
  await app?.close().catch(()=>{});
  rmSync(dir,{recursive:true,force:true});
}
