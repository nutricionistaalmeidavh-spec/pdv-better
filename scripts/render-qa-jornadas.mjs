// Arquivo de exibição derivado: docs/qa/fluxos.json é a fonte canônica.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const file = new URL('docs/qa/fluxos.json', root);
const target = new URL('docs/qa/jornadas.md', root);

export function renderJourneys(data) {
  const result = [
    '# Jornadas funcionais e matriz de QA — PDV Better',
    '',
    '> Gerado automaticamente de `docs/qa/fluxos.json`. Não editar este Markdown manualmente.',
    '',
    'Escopo: Windows 10/11 x64; SQLite local; R$ 0 no núcleo; serviço remoto somente opcional.',
    '',
    '**Legenda de implementação:** presente-no-marco-a = existente em parte ou integralmente na main; em-desenvolvimento-pr-2 = ainda não incorporado à main; planejado = futuro. **Cobertura:** todos os testes de jornada estão pendentes; evidência de backend, quando indicada, NÃO substitui teste E2E.',
    '',
    '## Índice',
    '',
    ...data.modules.map(m => '- [' + m.id + ' — ' + m.name + '](#' + m.id.toLowerCase() + ')'),
    '',
  ];
  for (const module of data.modules) {
    result.push('<a id="' + module.id.toLowerCase() + '"></a>', '', '## ' + module.id + ' — ' + module.name, '', '**Tela do módulo:** ' + module.screen, '');
    for (const f of module.flows) {
      result.push('### ' + f.id + ' — ' + f.title, '',
        '- **Tela inicial:** ' + f.screen,
        '- **Ação:** ' + f.action,
        '- **Validações:** ' + f.validations,
        '- **Resultado esperado:** ' + f.result,
        '- **Recuperação do erro:** ' + f.recovery,
        '- **Situação:** ' + f.implementation,
        '- **QA automatizado vinculado:** ' + f.qa.id + ' (' + f.qa.kind + ') — `' + f.qa.plannedTest + '` — ' + f.qa.coverage,
        ...(f.qa.existingBackendEvidence ? ['- **Evidência parcial de backend:** `' + f.qa.existingBackendEvidence + '` (não prova jornada ponta a ponta)'] : []),
        '');
    }
  }
  result.push('## Critério de conclusão', '', 'Marcar um fluxo como coberto apenas quando o arquivo real do teste de jornada existir, executar o cenário positivo e o de recuperação e passar no CI. Para emissão fiscal, hardware e rede local, registrar também testes reais no ambiente adequado.', '');
  return result.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(target, renderJourneys(JSON.parse(readFileSync(file, 'utf8'))));
  process.stdout.write('Jornadas atualizadas a partir da fonte canônica.\n');
}
