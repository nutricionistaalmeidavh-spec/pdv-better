# P2 — Financeiro operacional e relatórios (2026-11-07)

## Escopo e invariantes
- Núcleo 100% offline, self-hosted, open source e R$ 0. Sem dependências pagas.
- Migração transacional aditiva SQLite v10 → v11, sem exclusão ou regravação do histórico.
- Kanban de contas é somente visualização: não dispara liquidação nem movimenta estoque/caixa.
- Recorrências de 1, 3, 6 ou 12 competências criam obrigações futuras. Não processam pagamentos automaticamente. O vencimento mensal preserva o dia desejado, limitado ao último dia do mês.
- Proteção contra duplo clique/reenvio pela chave de idempotência. Reenvios divergentes são rejeitados.
- Fluxo operacional realizado: vendas reais (exclui fiado como recebimento imediato), liquidações de recebíveis e pagáveis. Não é extrato bancário.
- Fluxo previsto considera saldos ainda abertos dos lançamentos financeiros e vencimentos. Sem data, só entra no total não filtrado e no Kanban.
- Margem bruta: valor líquido da venda menos custo histórico congelado por item, com aviso quando custo registrado = 0. Não significa lucro líquido.
- CSV, XLSX e PDF são exportados localmente; CSV e texto XLSX neutralizam fórmulas; nenhuma transmissão externa.
- Filtros favoritos usam preferências locais do dispositivo, sem sincronização e sem registrar o conteúdo de lançamentos.

## Operação
1. Abra **Financeiro**. Consulte os totais realizados e previstos e defina o intervalo de datas.
2. Filtre contas no **Kanban**; escolha o cartão para inspecionar origem, saldo e histórico.
3. Crie obrigações mensais em **Agendar contas recorrentes**. Confira o vencimento antes de confirmar.
4. Utilize a baixa parcial já existente para registrar o pagamento efetuado e seu método.
5. Exporte o relatório financeiro em CSV, XLSX ou PDF localmente para conferência.

## Validação para merge
- `npm test`, `npm run build`, smoke Electron real e QA F01–F54/J01–J07 nas VMs.
- Testes de fim de mês, reenvio idempotente, pagamento de fiado sem duplicidade, proteção CSV e margem do custo congelado em `tests/p2-financeiro.test.mjs`.
- Sem alterações em instalação, licença, telemetria, permissões ocultas ou secrets.
- Não instalar nem publicar antes dos checks verdes do HEAD.
