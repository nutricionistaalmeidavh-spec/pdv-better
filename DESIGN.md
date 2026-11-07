# PDV SUPER — direção visual canônica (07/11/2026)

## Referência e objetivo

Interface de produção do PDV SUPER inspirada nas telas de referência apresentadas pelo usuário: barra de navegação superior azul-marinho, superfícies brancas/azul-claro, seleção azul viva, grade de produtos com fotos, carrinho lateral claro, total destacado em azul, botão verde de receber e informações operacionais legíveis.

As imagens promocionais são referências estéticas, **não capturas fiéis do aplicativo**. O objetivo é aproximar a aplicação real sem desenhar ações inexistentes nem alterar a lógica comercial.

## Fonte de verdade

`src/pdv-super.css` é o **único tema de produção**, importado por último em `src/main.tsx`. Define os tokens:
- `--super-navy` = `#071d40`: navegação superior e títulos operacionais (o resumo de pagamento é claro, com total azul).
- `--super-blue` = `#0964e7`: navegação ativa e ações de gestão.
- `--super-green` = `#06ab51`: receber pagamento.
- `--super-bg` = `#eef4fc`; `--super-paper` = `#ffffff`; `--super-border` = `#d6e1ef`.
- `--super-red` = `#d73a47`: perigo/cancelamento.

`src/styles.css`, `src/glass.css`, `src/system.css`, `src/auth.css`, `src/cashier.css` continuam proporcionando geometria/estrutura compatíveis, mas a última cascata substitui **todas as paletas anteriores**. `src/graphite.css` é histórico e **não é importado**.

## Aplicação transversal

Login e primeiro administrador; **barra superior horizontal em todas as telas**, com navegação por perfil; visão geral e cards; **frente de caixa com catálogo em grade sempre visível**, fotos JPG armazenadas localmente, preço, estoque e favoritos; carrinho e pagamento à direita; abertura e controle de caixa; vendas; **formulário de produto com foto em destaque**; categorias; clientes; fornecedores; operadores; compras; **estoque com tabela real, miniaturas e alerta operacional até 5 UN/KG (não é estoque mínimo configurável)**; financeiro; **relatórios com KPIs e gráficos derivados dos registros reais**; configuração de rede/dispositivos; confirmação de pagamentos; alertas, modais, tabelas e formulários; recibo não fiscal.

A interface apresenta uma única direção visual, sem seletor de modos. Os valores legados de preferência de aparência não são apagados do armazenamento, mas não alteram a aparência. O normalizador histórico permanece para compatibilidade do motor de atalhos.

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

## Referência detalhada das imagens de 07/11/2026

- A tela de vendas deve manter o catálogo visível à esquerda (imagem, nome, preço, saldo, categoria) e carrinho à direita; os botões realmente adicionam itens, consultam o catálogo e abrem a confirmação de pagamento.
- A foto do produto é opcional, convertida em JPEG compacto pelo frontend, guardada em `products.image_data` no SQLite local e incluída no backup. Não há importação remota ou assinatura.
- A tela de estoque usa dados reais e alerta informativo de saldo até 5; não rotular esse limite como configuração de estoque mínimo.
- Os gráficos de relatórios exibem sete dias de vendas concluídas e composição real dos meios de recebimento; **não usar números inventados da imagem promocional**.
- As interfaces continuam 100% não fiscais e exigem confirmação manual de pagamentos externos.
