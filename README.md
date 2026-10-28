# PDV Better — Marco A (Windows 10/11)

Sistema de ponto de venda local da ArtiSys inspirado no PDVNexus, com contrato canônico compartilhado e armazenamento SQLite.

## Funcionalidades incluídas
- Aplicativo desktop Electron + React.
- Cadastro e edição de produtos, categorias, clientes, fornecedores e operadores.
- Pesquisa por nome e código de produto; leitura de código de barras no campo de pesquisa (teclado HID).
- Prévia da frente de caixa com itens, quantidades, preço unitário e total.
- SQLite local, sem internet, login nem serviço pago obrigatório.
- Desativação lógica de registros e validações do domínio.

**Importante:** Marco A não salva vendas, não recebe pagamentos, não emite documentos fiscais nem faz baixa de estoque. O carrinho é temporário. Para operação comercial completa, são necessárias as fases seguintes.

## Requisitos
Windows 10/11 x64, Node.js 22 para desenvolvimento e npm.

## Desenvolvimento
    npm install
    npm run dev

## Validar
    npm test
    npm run build

## Instalador NSIS Windows x64
    npm run dist:win

GitHub Actions: QA Marco A para validação de pull requests; instalador por execução manual (workflow_dispatch). Não há integração obrigatória com Cloudflare ou outro serviço de terceiros.

## Arquitetura
- shared/contract.mjs: fonte de verdade do modelo, campos e canais IPC.
- shared/domain.mjs: validação e lógica de cálculo monetário.
- electron/db.mjs: banco canônico SQLite; migração com PRAGMA user_version.
- electron/main.cjs e electron/preload.mjs: ponte IPC canônica; o build gera preload.cjs isolado por sandbox.
- src: interface React consumindo o mesmo contrato.
- tests: regras reais de domínio e banco em memória.
- docs/00-canonical.md: estados, invariantes, escopo e critérios de aceite.

Não adicione regras de preços, quantidades, cadastros ou canais IPC duplicadas à UI. Para ampliar o modelo, edite o contrato canônico e seus testes.
