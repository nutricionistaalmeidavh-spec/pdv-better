# Caixa Rápido — P2 e P3 (100% não fiscal)

## Decisão de produto

A frente de caixa permanece **não fiscal** em todas as modalidades (Compacto, Claro e Escuro). Não há NF-e, NFC-e, CF-e, SAT, S@T, XML, assinatura, SEFAZ, autorização fiscal, TEF, gateway Pix ou cobrança automática. O comprovante impresso é **não fiscal** e os pagamentos externos são confirmados manualmente antes da conclusão. Não usar um QR Pix visual como se fosse cobrança confirmada.

O núcleo permanece offline-first, open source/self-hosted, custo operacional obrigatório R$ 0 e sem terceiros pagos.

## P2 — rapidez sem comprometer o motor de vendas

1. **Vendas em espera (F9):** transfere uma cópia validada do carrinho para `localStorage` do operador **no terminal atual**, após gravação bem-sucedida. Limite de 12 esperas por operador/terminal e até 150 linhas por rascunho. Cada espera tem ID, título opcional e data local. O carrinho ativo é limpo somente depois que a espera é persistida.
2. **Retomada (F11):** apenas quando o carrinho ativo está vazio; a lista permite selecionar espera específica. A primeira transação de gravação recupera o carrinho ativo antes de retirar a espera, para minimizar perdas em queda do processo. Eventual duplicação por falha entre gravações é preferível à perda de trabalho e não duplica vendas, pois nenhuma espera é uma venda.
3. **Catálogo e favoritos:** estrela para favoritar/desfavoritar, barra de favoritos no caixa e inclusão em um toque. Máximo de oito IDs; os produtos são resolvidos do catálogo carregado, não de preços salvos. Preferências isoladas por operador/terminal.
4. **Operação inalterada:** checkout, descontos, pagamentos mistos, troco e estoque seguem o contrato canônico. Espera/favorito **não** altera caixa, não reserva estoque e não gera venda.

## P3 — recuperação e proteção de operação

1. O rascunho em espera é validado antes de uso; IDs duplicados, campos corrompidos, valores negativos, quantidades de unidade fracionárias e excesso de registros são rejeitados.
2. Ao retomar, usa **preço e dados atuais** do catálogo; alerta explicitamente preços alterados, itens desativados/ausentes e mudança de unidade. Se nenhum item puder ser recuperado, a espera continua salva e nenhuma substituição ocorre.
3. **Desfazer exclusões (Ctrl+Z):** um nível, apenas enquanto o carrinho não sofreu outra alteração. Campos editáveis preservam o desfazer nativo do sistema; vendas concluídas e retomadas descartam a possibilidade de restaurar itens antigos.
4. **Atalhos adicionais:** F9 coloca carrinho ativo em espera mesmo antes da abertura de caixa; F11 retoma a espera mais recente com carrinho vazio; Ctrl+Z desfaz última exclusão confirmada. Todos bloqueados em modais. F2–F8/F10 continuam sem concluir transações automaticamente.
5. **Recuperação e evidências:** testes unitários de corrupção, variação de preço, limites e recuperação; teste integrado no Electron com F9/F11, favoritos e Ctrl+Z; os fluxos existentes F01–F54 e jornadas mantêm a mesma API do domínio e SQLite.

## Limites conhecidos

- Vendas em espera e favoritos são específicos de cada **operador e instalação/terminal**, não são sincronizados automaticamente na LAN e não substituem a exportação/backup do SQLite.
- Armazenamento privado de rascunhos depende da disponibilidade e integridade do armazenamento local do Electron; falhas de gravação são informadas e não apagam a venda ativa.
- A retomada sempre depende de cotação real do backend na confirmação do pagamento. Estoque pode mudar entre a retomada e a finalização.
- A UI não promete reserva de produto, pagamento antecipado ou documento fiscal.
- Não há migração SQLite nem canal IPC novo; não afeta cadastros, financeiro ou cobranças.

## Como validar

Executar no Windows com Node 22:

```sh
npm test
npm run build
npm run test:desktop
npm run test:flows:f15-f30
npm run test:journeys
```

A PR também dispara QA Windows em Windows 2022/2025 e o laboratório virtual do repositório. Dados de testes fictícios e isolados. Somente considerar homologado após resultados e evidências verificados.
