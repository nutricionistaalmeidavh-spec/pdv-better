# PDV Better — direção visual Graphite Glass

## Produto e audiência
Desktop Electron offline-first para operação de lojas brasileiras; usuários: Caixa, Gerente e Administrador. As ações críticas são receber, conferir dinheiro, cancelar venda, movimentar estoque e restaurar backup.

## Identidade aprovada (28/10/2026)
Referência enviada pelo usuário: vidro fumê preto/cinza-grafite com reflexos prateados suaves, transparência controlada, bordas finas, cantos arredondados e visual monocromático. **Não usar roxo, violeta, azul saturado, gradientes coloridos ou logos/ícones decorativos que disputem atenção com números.**

Paleta canônica: vazio `#090a0b`; base `#131516`; texto `#f5f6f7`; apoio `#c6cbd0`; ação `#ebeef0` com texto escuro `#111315`. Painel de vidro `rgba(28,30,32,.83)`; bordas claras de baixa opacidade. Cores semânticas muito restritas apenas para perigo, aviso e sucesso. Tipografia Inter/sistema, números com tabulares nas somas.

## Fonte de verdade
`src/graphite.css` é o tema oficial, importado **por último** em `src/main.tsx`. `src/styles.css`, `src/glass.css`, `src/system.css` e `src/auth.css` preservam geometria, layouts e compatibilidade, sem paletas concorrentes. Prefira evoluir tokens e estilos compartilhados ao invés de exceções por tela.

## Contratos de UX
Prioridade: leitura rápida de saldos e dados de tabela, ações principais distinguíveis, risco de cancelamento/fechamento separado, pagamento dividido com saldo e troco antes da confirmação. Fundo desfocado é decorativo, não pode comprometer contraste; modal precisa ter foco visível; formulários permanecem legíveis mesmo vazios. Com redução de transparência, usar fundo sólido. A impressão não fiscal deve permanecer em preto sobre branco.

## Verificação
`npm test`, `npm run build`, `npm run test:desktop` e evidência visual Electron Windows do workflow `.github/workflows/qa.yml`; revisar cada captura e contraste, incluindo login, configuração, dados densos e pagamento. Não prometer conformidade WCAG a partir de prints apenas.
