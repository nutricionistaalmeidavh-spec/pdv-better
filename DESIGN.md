# PDV SUPER — direção visual canônica (07/11/2026)

## Referência e objetivo

Interface de produção do PDV SUPER inspirada nas telas de referência apresentadas pelo usuário: navegação azul-marinho, superfícies brancas/azul-claro, seleção azul viva, valores destacados, botão verde de receber e informações operacionais legíveis.

As imagens promocionais são referências estéticas, **não capturas fiéis do aplicativo**. O objetivo é aproximar a aplicação real sem desenhar ações inexistentes nem alterar a lógica comercial.

## Fonte de verdade

`src/pdv-super.css` é o **único tema de produção**, importado por último em `src/main.tsx`. Define os tokens:
- `--super-navy` = `#071d40`: navegação e painel de pagamento.
- `--super-blue` = `#0964e7`: navegação ativa e ações de gestão.
- `--super-green` = `#06ab51`: receber pagamento.
- `--super-bg` = `#eef4fc`; `--super-paper` = `#ffffff`; `--super-border` = `#d6e1ef`.
- `--super-red` = `#d73a47`: perigo/cancelamento.

`src/styles.css`, `src/glass.css`, `src/system.css`, `src/auth.css`, `src/cashier.css` continuam proporcionando geometria/estrutura compatíveis, mas a última cascata substitui **todas as paletas anteriores**. `src/graphite.css` é histórico e **não é importado**.

## Aplicação transversal

Login e primeiro administrador; barra lateral e cabeçalho global; visão geral e cards; frente de caixa; abertura e controle de caixa; vendas; produtos; categorias; clientes; fornecedores; operadores; compras; estoque; financeiro; relatórios; configuração de rede/dispositivos; confirmação de pagamentos; alertas, modais, tabelas e formulários; recibo não fiscal.

Os modos legados `compact`, `light` e `dark` usam a mesma identidade para impedir divergência visual. Permanecem selecionáveis por compatibilidade do operador, sem troca de marca/paleta.

## Restrições inegociáveis

- A marca exibida é **PDV SUPER** (não "Caixa Rápido", "PDV Better" ou "ArtiSys" em telas de marketing).
- **Funcionalidades existentes intocadas**: leitura de código de barras, quantidades/peso, favoritos, catálogo, espera/retomada, desfazer, métodos de pagamento, descontos, cliente, relatórios, estoque e atalhos.
- **Não fiscal**: não adicionar NFC-e, NF-e, cupom fiscal, SEFAZ, captura automática de cartão/Pix ou confirmação financeira implícita.
- **Core R$ 0, offline-first, self-hosted/open source**, sem dependências pagas nem fontes remotas.
- IDs internos como `pdv-better.sqlite`, appId e chaves `localStorage` ficam inalterados para preservar bancos, dados e compatibilidade.

## Critérios de validação

1. `npm test` cobre contratos e lógica.
2. `npm run build` compila React, TypeScript e preload Electron.
3. Testes de desktop, jornadas e fluxos do GitHub Actions verificam operações reais.
4. `node scripts/qa-all-screens.mjs` produz screenshots reais e PDF. Comparar manualmente cada tela, incluindo formulários densos, pagamento, login, configurações e recibo; testes de código não provam fidelidade visual.
5. Verificar contraste, foco, ampliação, transbordamento e `prefers-reduced-motion`; impressos permanecem pretos no branco.

O merge depende de aprovação dos gates e revisão dos prints, não só da existência do CSS.
