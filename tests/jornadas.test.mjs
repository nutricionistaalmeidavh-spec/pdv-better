import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { renderJourneys } from '../scripts/render-qa-jornadas.mjs';

const data = JSON.parse(readFileSync(new URL('../docs/qa/fluxos.json', import.meta.url), 'utf8'));
const flows = data.modules.flatMap(module => module.flows);
test('matriz canônica possui 22 módulos e todas as jornadas completas', () => {
  assert.equal(data.modules.length, 22);
  assert.ok(flows.length >= 90);
  assert.equal(new Set(flows.map(flow => flow.id)).size, flows.length);
  assert.equal(new Set(flows.map(flow => flow.qa.id)).size, flows.length);
  for (const m of data.modules) {
    assert.match(m.id, /^MOD-\d{2}$/);
    assert.ok(m.name && m.screen && m.flows.length);
    for (const f of m.flows) {
      assert.match(f.id, /^FL-\d{2}-\d{2}$/);
      assert.equal(f.qa.id, f.id.replace('FL-', 'QA-'));
      for (const key of ['title','screen','action','validations','result','recovery','implementation']) {
        assert.ok(typeof f[key] === 'string' && f[key].trim(), f.id + ' sem ' + key);
      }
      assert.ok(['presente-no-marco-a','em-desenvolvimento-pr-2','planejado'].includes(f.implementation));
      assert.ok(['unitario','integracao','e2e','hardware'].includes(f.qa.kind));
      assert.equal(f.qa.plannedTest, 'tests/journeys/' + f.qa.id + '.test.mjs');
      assert.equal(f.qa.coverage, 'pendente-jornada');
      if (f.qa.existingBackendEvidence) {
        assert.equal(f.qa.existingBackendEvidence, 'tests/catalog.test.mjs');
        assert.ok(existsSync(new URL('../' + f.qa.existingBackendEvidence, import.meta.url)));
      }
    }
  }
});
test('fluxos de mesas, comandas e garçom permanecem no escopo', () => {
  const m = data.modules.find(m => m.id === 'MOD-13');
  assert.match(m.name, /Mesas, comandas e garçom/);
  assert.equal(m.flows.length, 5);
  assert.ok(m.flows.some(f => f.action.includes('Garçom')));
});
test('jornadas de integração não são declaradas cobertas sem teste real', () => {
  assert.ok(flows.some(f => f.implementation === 'em-desenvolvimento-pr-2'));
  assert.ok(flows.some(f => f.implementation === 'planejado'));
  assert.ok(flows.some(f => f.qa.coverage === 'pendente-jornada'));
  for (const flow of flows) {
    const exists = existsSync(new URL('../' + flow.qa.plannedTest, import.meta.url));
    assert.ok(['pendente-jornada','coberto-jornada'].includes(flow.qa.coverage));
    assert.equal(flow.qa.coverage === 'coberto-jornada', exists, flow.id + ': divergência entre teste e cobertura');
  }
});
test('Markdown publicado corresponde integralmente à fonte de verdade', () => {
  const doc = readFileSync(new URL('../docs/qa/jornadas.md', import.meta.url), 'utf8');
  assert.equal(doc, renderJourneys(data));
});
