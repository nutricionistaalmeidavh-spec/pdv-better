import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('RELEASE-01: build NSIS de QA nunca tenta publicar nem exige token GitHub',()=>{
 const packageFile=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 const script=packageFile.scripts['dist:win'];
 assert.match(script,/electron-builder\s+--win\s+nsis\s+--x64/);
 assert.match(script,/--publish\s+never/,'sem publish never o CI de main tenta GitHub Release e exige GH_TOKEN');
 assert.equal(packageFile.build.publish?.provider,undefined,'a publicação nunca é implícita');
});
