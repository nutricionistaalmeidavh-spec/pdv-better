# Marco B — contratos canônicos (Windows 10/11)

## Únicas fontes de verdade
- `shared/contract.mjs`: catálogo, pagamento, estados e identificadores IPC.
- `shared/commerce.mjs`: validação de pagamento, quantidades, desconto, fiado, dinheiro e lançamentos financeiros.
- `electron/commerce.mjs`: SQL transacional, eventos auditáveis e projeção do estoque.
- `electron/db.mjs`: migração do catálogo legado e persistência durável de cadastros.
- `src/Commerce.tsx`: somente interface e feedback; não confirma pagamentos externos.
- O banco SQLite é o único registro persistido. Estoque em `products.stock_milli` é projeção materializada dos movimentos; qualquer alteração exige registrar `stock_movements` na mesma transação.
- Valores monetários são sempre centavos inteiros; quantidades são milésimos inteiros.

## Regras de operação
1. Um turno de caixa aberto por banco local. Só existe uma sessão em status open (restrição UNIQUE).
2. Toda venda requer turno, produto ativo, quantidade válida, estoque não negativo e formas de pagamento cobrindo o valor descontado.
3. Pix e cartão são registros manuais após conferência externa (maquininha ou banco). Sem TEF, gateway ou simulação de confirmação bancária.
4. Pagamento com dinheiro pode exceder a parcela devida; somente o valor líquido entra no livro caixa, e o excesso é devolvido como troco.
5. Fiado exige cliente ativo e gera automaticamente conta a receber; sem cobrança ou consulta bancária automatizada.
6. Cancelamento somente no mesmo turno aberto; devolve estoque e dinheiro líquido e cancela contas a receber abertas. Se fiado já foi liquidado, o estorno precisa ser tratado antes de cancelar.
7. Estorno de Pix/cartão no PDV altera exclusivamente os livros locais; a devolução externa deve ser efetuada separadamente.
8. Abertura, sangria, reforço, liquidação em dinheiro e cancelamentos são movimentações assinadas imutáveis.
9. Conta a pagar ou receber pode ser liquidada uma única vez; entrada/saída em dinheiro requer caixa aberto.
10. Fechamento registra dinheiro previsto, contado e diferença. Divergência não é encoberta.
11. O módulo fiscal, TEF integrado e cancelamento de turnos fechados não estão presentes e não devem ser anunciados como implementados.

## Recuperação e idempotência
- A transação `BEGIN IMMEDIATE` no banco local confirma tudo ou nada; falha de estoque/pagamento causa rollback de vendas, pagamentos e movimentos.
- `idempotency_key` identifica cada confirmação; retransmissão com dados idênticos retorna a mesma venda; chave com outro conteúdo é rejeitada.
- O frontend preserva os campos e mantém o identificador enquanto a tentativa de finalização está aberta. Só limpa o carrinho após resposta de sucesso persistido.
- Cadastros antigos (v1) são migrados para v2, backfill do saldo em estoque uma única vez.
- Erros permanecem visíveis, com dados inseridos preservados; chamadas pendentes desabilitam repetição.

## QA automatizado em Windows
- `npm test`: invariantes, migração, fechamento, idempotência, controle de estoque, fiado, relatórios.
- `npm run test:desktop`: abre janela Electron real, cria cadastro, abre caixa, vende e reabre aplicativo verificando a persistência.
- `npm run dist:win`: gera NSIS; GitHub Actions instala via /S e executa o mesmo smoke no binário instalado.
- O CI verifica Windows Server 2022/2025 em runners GitHub, não constitui teste literal de todas as versões cliente Windows 10/11 e equipamentos físicos. Runners self-hosted Windows 10/11 podem executar o workflow para homologação em hardware real quando disponíveis.

## Limitações do Marco B
- Operadores sem autenticação efetiva (requer autorização local na próxima etapa).
- Uma única instalação/banco por loja; não sincronizar bancos em rede ainda.
- Financeiro simples de contas, sem DRE tributária certificada.
- Relatório agregado acumulado com exportação local em PDF, CSV e XLSX (ExcelJS open source), sem filtros de competência nesta etapa.
- Recibo do PDV é não fiscal; nenhuma emissão tributária.
- Permitir saldo inicial de estoque positivo durante cadastro; edições posteriores de saldo exigem movimento auditável.

## Validação de UX
Experiência proposta de atendente: identificar caixa -> adicionar produtos -> ver total -> receber -> confirmar venda -> reencontrar no histórico.
Experiência proposta de gerente: abrir turno -> movimentar dinheiro/estoque -> registrar despesa -> conferir diferença no fechamento.
A usabilidade humana não é inferida de testes de código: devem ser acompanhadas tarefas sem orientar onde clicar quando existir acesso a operadores reais.

## Compatibilização com a main Glass (#7)
- Schema SQLite v3 detecta a v2 Glass e migra vendas, itens e pagamentos com o mesmo ID.
- Histórico anterior vinculado a turno fechado e estoque reconciliado pelos movimentos; rollback se houver falha.
- Mantidos glassmorphism, filtro por categoria e recuperação do rascunho.
