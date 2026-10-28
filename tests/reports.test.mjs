import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportRows,reportCsv,reportHtml} from '../shared/report.mjs';
import {reportFields} from '../shared/contract.mjs';
test('todos os formatos partem dos mesmos campos canônicos',()=>{
  const data=Object.fromEntries(reportFields.map((f,i)=>[f.key,i*125]));
  const rows=reportRows(data);
  assert.equal(rows.length,reportFields.length);
  const csv=reportCsv(data),html=reportHtml(data);
  for(const row of rows){assert.ok(csv.includes(row.label));assert.ok(html.includes(row.label));}
  assert.ok(csv.startsWith('\ufeff'));
  assert.match(html,/Relatório gerencial não fiscal|Relatório gerencial não fiscal|Relatório acumulado/);
});
