# PDV Better — Port seletivo P0/P1 do PDV Nexus
Data: 2026-11-07 · PR #24 · branch `feat/p0-p1-compras-financeiro-caixa-20261107`

## Limites de arquitetura
- Núcleo **R$ 0**, funcionamento local/offline, código aberto e self-hosted.
- **Sem** telemetria, licenciamento, APIs pagas obrigatórias, gateways de cobrança, emissão fiscal, upgrades automáticos ou mudança de canal de publicação.
- **Não** substituir SQLite por snapshot JSON do Nexus. O Better continua com banco canônico único e transações `BEGIN IMMEDIATE`.
- Manter o design Graphite Glass e o escopo atual Windows 10/11; não copiar indiscriminadamente o runtime legado Windows 7/8.

## P0: compras, custos, financeiro e fechamento
| Fluxo | Regra no banco | Interface |
| --- | --- | --- |
| Compra em rascunho | `commercial_purchases` e `commercial_purchase_lines`; sem estoque ou contas | Compras > Nova compra |
| Recebimento | Transação única que altera estoque, custo médio ponderado, histórico de entrada e conta a pagar | Compras > Conferir e receber |
| Recebimento duplicado | Falha antes de qualquer movimento | Botão desabilitado para recebidas |
| Custo histórico | Venda já finalizada preserva `sale_items.unit_cost_cents` | Relatórios existentes |
| Baixas parciais | `finance_settlements`, saldo restante derivado, baixa limitada ao saldo | Financeiro > Dar baixa |
| Histórico legado | Baixas antigas já liquidadas entram no ledger **sem repetir efeito no caixa** | Financeiro |
| Estorno do fiado recebido | Bloqueia cancelamento da venda se qualquer parcela já foi recebida | Vendas |
| Conferência cega | Contagens por dinheiro/Pix/crédito/débito/cartão legado, diferenças armazenadas em `cash_count_checks` | Controle de caixa > Revisar fechamento |
| Autorização do fechamento | Senha de gerente/administrador ativo verificada no backend, com limite de tentativas | Modal de revisão do fechamento |

## P1: operações mais simples
- Acesso a Compras no menu, separado de Financeiro.
- Cadastro rápido de cliente durante o recebimento da venda, sem descartar o carrinho.
- Cadastro de produto quando a pesquisa do caixa não retorna resultados.
- Guia inicial com cadastro, abertura de caixa e primeira venda.
- F2 não troca de tela enquanto o operador edita campos ou usa modal.
- Pagamentos por produto: quantidade exata por meio e valor conciliado em centavos, com registro da quantidade em `sale_item_payments.quantity_milli`. Histórico anterior mantém o campo nulo sem inventar distribuição.

## Migração e preservação
- SQLite v9 → v10, aditiva, transacional e idempotente; banco v10 impede abertura por aplicativos anteriores.
- Nenhuma compra histórica é fabricada a partir de ajustes de estoque antigos.
- Registros `financial_entries.status='settled'` recebem uma linha **histórica** de liquidação, sem criar novamente movimento de caixa.
- Compras confirmadas **não** usam automaticamente lotes físicos; entradas de lote FEFO continuam disponíveis em Estoque. A vinculação compra/lote físico exige homologação adicional.
- Nenhuma migração apaga vendas, lotes, estoque, contas, usuários ou configurações.

## Matriz de testes
- `tests/p0-p1-nexus-commercial.test.mjs`: rascunho/recebimento único, custo médio, rollback de produto inativo, baixas parciais e saldo, estorno bloqueado, contagem Pix/débito, autorização gerencial e divisão de quantidade por pagamento.
- `npm test` e `npm run build` no Windows; usar o workflow `qa.yml` e o laboratório `virtual-windows-lab.yml`.
- QA automatizado em Windows **não** homologa impressoras reais, balanças, scanner USB, implantação fiscal ou condições de queda de energia na loja.

## Limites conhecidos
- O fechamento registra valores Pix/cartão da sessão de vendas, não extratos bancários ou confirmação automática de adquirentes.
- Pagamentos recebidos por Pix/cartão continuam registros manuais.
- Para uma venda com um único meio de pagamento, não há necessidade de dividir quantidades; o histórico anterior não é reinterpretado.
- Reversão de compra já recebida, devolução a fornecedor e conciliação bancária são evoluções separadas, não operações silenciosas.
