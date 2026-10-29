# Entrega P0/P1 — robustez operacional baseada no PDV Nexus

## Fontes e segurança
- Referência: PDVNexus main 6a1932be; destino: PDV Better / PDV Plus, sobre a PR de auditoria #15.
- Nenhuma dependência de telemetria, licença, Cloudflare, gateway ou serviço pago.
- Dados comerciais ficam no SQLite local ou no host LAN escolhido pelo estabelecimento.
- O aplicativo preserva a experiência Graphite Glass; cálculo monetário em centavos inteiros.

## Persistência/SQLite (P0)
- electron/sqlite-errors.mjs centraliza SQLITE_BUSY, SQLITE_LOCKED, SQLITE_FULL / ENOSPC e corrupção.
- openCatalog verifica integridade com quick_check, aceita timeout configurável em testes e encerra a conexão quando a abertura falha.
- atomic protege BEGIN IMMEDIATE, COMMIT e ROLLBACK, traduzindo erros sem reiniciar em banco vazio.
- Cenários NEX-R01–R05: lock na gravação, arquivo ilegível, reabertura íntegra, falta de espaço em disco (contrato de erro) e lock durante checkout.
- Não há fallback silencioso para outra base comercial.

## Migração v5
- v4 -> v5, transação única e idempotente: product_batches, sale_batch_allocations e product_promotions.
- promotion_discount_cents preserva o abatimento por produto sem adulterar o valor bruto.
- PRAGMA user_version impede downgrade acidental por aplicativos antigos.
- NEX-MIG-01 exercita migração idempotente, esquema e preservação de saldo.

## FEFO + lotes
- Entrada de lote aumenta saldo rastreado e canônico com movimento auditável.
- Mesmo código de lote com validade diferente é bloqueado; validade igual permite somar quantidades.
- Venda genérica prioriza lotes válidos por validade; saldo não rastreado permanece separado.
- Venda com lote específico nunca substitui silenciosamente por outro lote.
- Cancelamento restaura lotes consumidos exatamente.
- Ajuste manual não pode deixar saldo geral abaixo do total de lotes rastreados.
- A interface permite registrar lote e selecionar lote no recebimento, sem exigir periférico.
- Limite: leitura automática de etiqueta física Code 128 pelo scanner HID ainda não integrada; escolha manual disponível.

## Promoções
- Combos por quantidade para produtos UN, desconto automático por SKU.
- Programação dinâmica escolhe custo mínimo entre unitário e faixas.
- quoteSale faz prévia canônica e checkout revalida no banco.
- Desconto promocional e manual entram no histórico e totais.
- Limite: grupos promocionais entre SKUs diferentes e variantes permanecem pendentes.

## Relatório por item
- Detalhamento inclui produto, quantidade, bruto, desconto, líquido, data, operador, terminal e pagamento.
- Rateio de centavos determinístico com inteiros e conciliação.
- Cancelamentos consultáveis separadamente, sem inflar faturamento.
- Pagamento misto não é inventado por item: mixed_unallocated.
- Filtros por período, produto e operador no domínio; período/produto na interface.
- Limite: exportação CSV/PDF/XLSX por item e atribuição explícita de meio a produto ainda pendentes; o exportador atual segue agregado.

## Permissões, bridge e QA
- shared/access.mjs: cotação e leitura de lotes para Caixa; ajustes, promoções e relatórios restritos à Gerência/Administração.
- shared/contract.mjs: novos canais IPC, preload restrito e RPC LAN autenticado.
- Testes: tests/nexus-sqlite-recovery.test.mjs, tests/nexus-batches.test.mjs, tests/nexus-promotions.test.mjs e tests/nexus-item-reports.test.mjs.
- npm test e npm run build; no Windows: test:desktop, jornadas F01–F54, E01–E12, J01–J07 e NSIS instalado.
- PR em rascunho até CI verde, sem merge ou release prematuro.
