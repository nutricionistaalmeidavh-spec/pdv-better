# PDV Better — Marco D (Windows 10/11)

Sistema de ponto de venda local da ArtiSys inspirado no PDVNexus, com contrato canônico compartilhado e armazenamento SQLite.

## Funcionalidades incluídas
- Aplicativo desktop Electron + React.
- Cadastro e edição de produtos, categorias, clientes, fornecedores e operadores.
- Pesquisa por nome e código de produto; leitura de código de barras no campo de pesquisa (teclado HID).
- Frente de caixa com confirmação de pagamento manual, troco, desconto, fiado, histórico, comprovante não fiscal para impressão e idempotência de vendas.
- Abertura, movimentações e fechamento de caixa com diferenças auditáveis.
- Estoque com entradas, ajustes, lotes futuros e reversões vinculadas à venda.
- Financeiro com contas a pagar/receber, liquidação, relatórios acumulados e exportação local em PDF, CSV e XLSX.
- SQLite local, sem internet, login nem serviço pago obrigatório.
- Desativação lógica de registros e validações do domínio.

**Marco B:** vendas reais com baixa de estoque transacional, caixa, pagamentos mistos, fiado, sangria, reforço, contas a pagar/receber, relatórios, cancelamentos seguros e trilha de movimentos. Pix e cartão exigem confirmação manual. **Não emite documentos fiscais e não executa cobranças externas.**

## Marco C — Operação instalada
- Periféricos: leitor HID, etiquetas/recibos no Windows, ESC/POS TCP, gaveta e balança TCP.
- Servidor LAN opcional com token, banco SQLite central e terminais que operam no mesmo banco sem sincronização duplicada.
- Backup SQLite íntegro e restauração com retenção do banco anterior e reinício seguro.
- QA no Electron e no NSIS instalado, com hash SHA256 no artefato GitHub Actions.

**Limites:** balança serial COM, TEF, múltiplos turnos de caixa separados por terminal e homologação de hardware físico não foram implementados. HTTP na LAN não cifra o tráfego: use rede privada confiável. Pix e cartão continuam manuais.

## Marco D — caixas simultâneos e perfis
- Cada terminal pode abrir e fechar seu próprio caixa em paralelo, com saldos, sangrias, divergências e operador de abertura separados.
- Credenciais locais por operador e perfis Caixa, Gerente e Administrador. Primeiro acesso exige criar administrador e senha, sem conta padrão.
- Senhas derivadas com scrypt, autenticação por terminal e permissões verificadas no backend SQLite e na API LAN.
- Administração de operadores, funções e senhas pela interface e histórico de autoria das vendas.
- SQLite v4 migra os turnos existentes sem apagar dados. Detalhes em docs/03-caixas-perfis.md.

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

GitHub Actions: valida o Marco B em Windows Server 2022/2025, testa Electron real, gera instalador NSIS e executa teste automatizado no programa instalado. O workflow também pode ser iniciado manualmente. Não há integração obrigatória com Cloudflare ou serviços pagos.

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
- docs/01-marco-b.md: regras do Marco B.
- docs/02-marco-c.md: configuração LAN, periféricos, backup, limites e QA do Marco C.

Não adicione regras de preços, quantidades, cadastros ou canais IPC duplicadas à UI. Para ampliar o modelo, edite o contrato canônico e seus testes.
