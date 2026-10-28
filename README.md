# PDV Better — Marco B (Windows 10/11)

Sistema de ponto de venda local da ArtiSys inspirado no PDVNexus, com contrato canônico compartilhado e armazenamento SQLite.

## Funcionalidades incluídas
- Aplicativo desktop Electron + React.
- Cadastro e edição de produtos, categorias, clientes, fornecedores e operadores.
- Pesquisa por nome e código de produto; leitura de código de barras no campo de pesquisa (teclado HID).
- Frente de caixa com confirmação de pagamento manual, troco, desconto, fiado, histórico e idempotência de vendas.
- Abertura, movimentações e fechamento de caixa com diferenças auditáveis.
- Estoque com entradas, ajustes, lotes futuros e reversões vinculadas à venda.
- Financeiro com contas a pagar/receber, liquidação, relatórios acumulados e exportação local em PDF, CSV e XLSX.
- SQLite local, sem internet, login nem serviço pago obrigatório.
- Desativação lógica de registros e validações do domínio.

**Marco B:** vendas reais com baixa de estoque transacional, caixa, pagamentos mistos, fiado, sangria, reforço, contas a pagar/receber, relatórios, cancelamentos seguros e trilha de movimentos. Pix e cartão exigem confirmação manual. **Não emite documentos fiscais e não executa cobranças externas.**

## Requisitos
Windows 10/11 x64, Node.js 22 para desenvolvimento e npm.

## Desenvolvimento
    npm install
    npm run dev

## Validar
    npm test
    npm run build
    npm run test:desktop

## Instalador NSIS Windows x64
    npm run dist:win

GitHub Actions: QA Marco A para validação de pull requests; instalador por execução manual (workflow_dispatch). Não há integração obrigatória com Cloudflare ou outro serviço de terceiros.

## Arquitetura
- shared/contract.mjs: fonte de verdade do modelo, campos, formas de pagamento e canais IPC.
- shared/commerce.mjs: regras de pagamentos, estoque e financeiro.
- electron/commerce.mjs: operações transacionais, migração SQLite v2, auditoria e relatórios.
- shared/domain.mjs: validação e lógica de cálculo monetário.
- electron/db.mjs: banco canônico SQLite; migração com PRAGMA user_version.
- electron/main.cjs e electron/preload.mjs: ponte IPC canônica; o build gera preload.cjs isolado por sandbox.
- src: interface React consumindo o mesmo contrato.
- tests: regras reais de domínio e banco em memória.
- docs/00-canonical.md: fontes e limites do Marco A.
- docs/01-marco-b.md: fluxos canônicos, invariantes, estornos e homologação Windows.

Não adicione regras de preços, quantidades, cadastros ou canais IPC duplicadas à UI. Para ampliar o modelo, edite o contrato canônico e seus testes.
