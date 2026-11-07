# Jornadas, escopo e rastreabilidade de QA

A fonte de verdade funcional é [fluxos.json](./fluxos.json). O arquivo [jornadas.md](./jornadas.md) é uma apresentação gerada automaticamente com **tela inicial → ação → validações → resultado → recuperação**, módulo, ID de QA e situação da funcionalidade.

- `presente-no-marco-a`: parte ou integralidade no código da main, sem afirmar cobertura de interface ou hardware.
- `em-desenvolvimento-pr-2`: implementação associada ao Marco B ainda não mesclado na main.
- `planejado`: requisito ainda não implementado.
- `pendente-jornada`: teste correspondente ainda NÃO foi criado. `existingBackendEvidence` registra apenas provas parciais reais do Marco A.

As áreas de mesas, comandas e garçom são **parte do escopo mantido**, ainda não implementadas.

## Como trabalhar

1. Localize o fluxo por `FL-XX-YY` em [jornadas.md](./jornadas.md).
2. Use `QA-XX-YY` como ID estável do teste e o caminho indicado no JSON para um teste real; teste o resultado esperado **e** a recuperação de erro.
3. Ao concluir a implementação, atualize `implementation` e o registro de cobertura somente depois de validar o teste no CI. Não assuma que esta matriz executa testes E2E.
4. Regere a visualização com `node scripts/render-qa-jornadas.mjs` e valide com `npm test`; um teste confere paridade JSON ↔ Markdown.

**Dependências:** Node.js 22 já usado no projeto, `node:test`, SQLite local e CI do GitHub Actions existente. Zero novo serviço pago, zero telemetria obrigatória.

## Regras transversais de aceite

- Persistência durável e transações atômicas com rollback em caso de erro.
- Dinheiro em centavos inteiros, quantidades em milésimos e IDs estáveis.
- Operação offline obrigatória; LAN e sincronização externa apenas quando explicitamente configuradas.
- Nada de duplicar modelo, regras de domínio ou estado persistente fora das fontes canônicas.
- Dados fictícios em QA; nenhuma credencial ou autorização fiscal simulada como real.
- Hardware fiscal, impressoras e rede local exigem evidência no ambiente real além de testes de código.
