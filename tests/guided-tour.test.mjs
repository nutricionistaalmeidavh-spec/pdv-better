import test from 'node:test';
import assert from 'node:assert/strict';
import {getTourSteps,tourStorageKey,hasCompletedTour,nextTourStepIndex,previousTourStepIndex} from '../shared/guided-tour.mjs';

test('tour do administrador apresenta introdução, operação, gestão e conclusão',()=>{
 const steps=getTourSteps('Administrador');
 assert.equal(steps[0].id,'welcome');
 assert.equal(steps.at(-1).id,'finish');
 assert.ok(steps.some(step=>step.view==='products'));
 assert.ok(steps.some(step=>step.view==='checkout'));
 assert.ok(steps.some(step=>step.view==='settings'));
 assert.equal(new Set(steps.map(x=>x.id)).size,steps.length);
 for(const step of steps){
   assert.ok(step.title?.length>3,step.id);
   assert.ok(step.description?.length>15,step.id);
   assert.ok(step.selector?.length>3,step.id);
 }
});
test('tour não revela opções vedadas ao operador Caixa ou Gerente',()=>{
 const cashier=getTourSteps('Caixa');
 for(const view of ['finance','reports','settings','operators','purchases']) assert.ok(!cashier.some(x=>x.view===view),view);
 assert.ok(cashier.some(x=>x.view==='checkout'));
 const manager=getTourSteps('Gerente');
 assert.ok(manager.some(x=>x.view==='finance'));
 assert.ok(manager.some(x=>x.view==='reports'));
 assert.ok(!manager.some(x=>x.view==='settings'));
});
test('persistência de tour é individual por usuário e versão',()=>{
 const first=tourStorageKey('a');
 const second=tourStorageKey('b');
 assert.notEqual(first,second);
 assert.match(first,/pdv-super:guided-tour:v\d+:a$/);
 assert.equal(hasCompletedTour(null),false);
 assert.equal(hasCompletedTour('dismissed'),true);
 assert.equal(hasCompletedTour('completed'),true);
 assert.equal(hasCompletedTour('in-progress'),false);
});
test('avançar e voltar respeita limite do total de etapas',()=>{
 assert.equal(nextTourStepIndex(0,3),1);
 assert.equal(nextTourStepIndex(2,3),2);
 assert.equal(previousTourStepIndex(1),0);
 assert.equal(previousTourStepIndex(0),0);
});
