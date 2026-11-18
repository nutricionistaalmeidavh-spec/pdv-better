import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {resolveUserDataDirectory} from '../electron/user-data.mjs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('marca oficial do instalador, atalho e janela é PDV Plus, sem trocar appId',()=>{
  const pkg=JSON.parse(source('package.json'));
  assert.equal(pkg.build.productName,'PDV Plus');
  assert.equal(pkg.build.appId,'dev.artisys.pdvbetter','appId deve permanecer estável para atualização');
  assert.match(pkg.build.win.artifactName,/^PDV-Plus-Setup-/);
  assert.match(source('index.html'),/<title>PDV Plus<\/title>/);
  assert.match(source('electron/main.cjs'),/resolveUserDataDirectory/);
  assert.match(source('.github/workflows/qa.yml'),/PDV Plus\.exe/);
});

test('telas, comprovantes, relatórios e tour exibem somente a marca comercial PDV Plus',()=>{
  const paths=[
    'src/App.tsx','src/Cashier.tsx','src/AuthGate.tsx','src/FirstAccess.tsx',
    'src/GuidedTour.tsx','src/Receipt.tsx','electron/printing.mjs',
    'shared/report.mjs','shared/peripherals.mjs','shared/item-report-export.mjs',
    'shared/guided-tour.mjs'
  ];
  for(const path of paths){
    const text=source(path);
    assert.match(text,/PDV Plus/,path+' deve apresentar o nome oficial');
    assert.doesNotMatch(text,/PDV SUPER/,path+' não pode continuar exibindo a marca anterior');
  }
});

test('atualização aproveita SQLite existente e instalações novas usam o diretório atual',()=>{
  const appData=join('C:','Users','Cliente','AppData','Roaming');
  const legacy=join(appData,'PDV SUPER');
  const current=join(appData,'PDV Plus');
  assert.equal(resolveUserDataDirectory(appData,current,path=>path===join(legacy,'pdv-better.sqlite')),legacy);
  assert.equal(resolveUserDataDirectory(appData,current,path=>path===join(legacy,'terminal-id.txt')),legacy);
  assert.equal(resolveUserDataDirectory(appData,current,()=>false),current);
});

test('publicação automática escuta o nome do workflow de QA revisado',()=>{
  const qa=source('.github/workflows/qa.yml');
  const publish=source('.github/workflows/publish-pdv-plus-updates.yml');
  assert.match(qa,/name: QA PDV Plus — Windows Desktop/);
  assert.match(publish,/workflows: \["QA PDV Plus — Windows Desktop"\]/);
  const pkg=JSON.parse(source('package.json'));
  assert.match(pkg.version,/^\d+\.\d+\.\d+$/,'versão deve seguir SemVer');
  assert.match(pkg.build.win.artifactName,/\$\{version\}/,'nome do instalador deve acompanhar a versão atual');
});
