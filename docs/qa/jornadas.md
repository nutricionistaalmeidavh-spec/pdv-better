# Jornadas funcionais e matriz de QA — PDV Better

> Gerado automaticamente de `docs/qa/fluxos.json`. Não editar este Markdown manualmente.

Escopo: Windows 10/11 x64; SQLite local; R$ 0 no núcleo; serviço remoto somente opcional.

**Legenda de implementação:** presente-no-marco-a = existente em parte ou integralmente na main; em-desenvolvimento-pr-2 = ainda não incorporado à main; planejado = futuro. **Cobertura:** todos os testes de jornada estão pendentes; evidência de backend, quando indicada, NÃO substitui teste E2E.

## Índice

- [MOD-01 — Instalação e inicialização](#mod-01)
- [MOD-02 — Operadores e permissões](#mod-02)
- [MOD-03 — Produtos e categorias](#mod-03)
- [MOD-04 — Clientes](#mod-04)
- [MOD-05 — Fornecedores](#mod-05)
- [MOD-06 — Frente de caixa](#mod-06)
- [MOD-07 — Pagamentos](#mod-07)
- [MOD-08 — Controle de caixa](#mod-08)
- [MOD-09 — Estoque](#mod-09)
- [MOD-10 — Compras e recebimento](#mod-10)
- [MOD-11 — Trocas, devoluções e cancelamentos](#mod-11)
- [MOD-12 — Orçamentos e pedidos](#mod-12)
- [MOD-13 — Mesas, comandas e garçom](#mod-13)
- [MOD-14 — Fiscal](#mod-14)
- [MOD-15 — Financeiro](#mod-15)
- [MOD-16 — Relatórios](#mod-16)
- [MOD-17 — Impressão e periféricos](#mod-17)
- [MOD-18 — Configurações comerciais](#mod-18)
- [MOD-19 — Backup e restauração](#mod-19)
- [MOD-20 — Funcionamento offline e sincronização](#mod-20)
- [MOD-21 — Auditoria e segurança](#mod-21)
- [MOD-22 — Atualizações e manutenção](#mod-22)

<a id="mod-01"></a>

## MOD-01 — Instalação e inicialização

**Tela do módulo:** Instalador NSIS / abertura do aplicativo

### FL-01-01 — Instalar e atualizar o aplicativo

- **Tela inicial:** Instalador NSIS / abertura do aplicativo
- **Ação:** Executar instalador NSIS ou atualização local
- **Validações:** Windows 10/11 x64, integridade do pacote, diretório e dados existentes
- **Resultado esperado:** Aplicativo instalável preservando banco e versão
- **Recuperação do erro:** Interromper instalação sem corromper dados e permitir repetir
- **Situação:** presente-no-marco-a
- **QA automatizado vinculado:** QA-01-01 (e2e) — `tests/journeys/QA-01-01.test.mjs` — pendente-jornada

### FL-01-02 — Criar ou selecionar estabelecimento

- **Tela inicial:** Instalador NSIS / abertura do aplicativo
- **Ação:** Abrir configuração do estabelecimento local
- **Validações:** Identificador estável, dados mínimos e ausência de duplicidade
- **Resultado esperado:** Estabelecimento selecionado sem depender de nuvem
- **Recuperação do erro:** Preservar seleção anterior e reabrir configuração
- **Situação:** planejado
- **QA automatizado vinculado:** QA-01-02 (integracao) — `tests/journeys/QA-01-02.test.mjs` — pendente-jornada

### FL-01-03 — Configurar dados e preferências

- **Tela inicial:** Instalador NSIS / abertura do aplicativo
- **Ação:** Preencher dados comerciais iniciais e salvar
- **Validações:** Campos obrigatórios, formato de documento e opções válidas
- **Resultado esperado:** Configuração lida novamente do SQLite
- **Recuperação do erro:** Manter formulário e mostrar campos inválidos
- **Situação:** planejado
- **QA automatizado vinculado:** QA-01-03 (integracao) — `tests/journeys/QA-01-03.test.mjs` — pendente-jornada

### FL-01-04 — Restaurar sessão após reinicialização

- **Tela inicial:** Instalador NSIS / abertura do aplicativo
- **Ação:** Encerrar e reabrir o aplicativo
- **Validações:** Integridade do SQLite, versão compatível e dados locais
- **Resultado esperado:** Cadastros persistentes reaparecem sem exigir internet
- **Recuperação do erro:** Oferecer tentar novamente e restauração de backup
- **Situação:** presente-no-marco-a
- **QA automatizado vinculado:** QA-01-04 (integracao) — `tests/journeys/QA-01-04.test.mjs` — pendente-jornada

<a id="mod-02"></a>

## MOD-02 — Operadores e permissões

**Tela do módulo:** Cadastros / Operadores

### FL-02-01 — Cadastrar e editar operadores

- **Tela inicial:** Cadastros / Operadores
- **Ação:** Adicionar ou alterar um operador
- **Validações:** Nome obrigatório, função válida e UUID estável
- **Resultado esperado:** Operador persistido e visível na lista
- **Recuperação do erro:** Preservar formulário diante de falha de gravação
- **Situação:** presente-no-marco-a
- **QA automatizado vinculado:** QA-02-01 (integracao) — `tests/journeys/QA-02-01.test.mjs` — pendente-jornada
- **Evidência parcial de backend:** `tests/catalog.test.mjs` (não prova jornada ponta a ponta)

### FL-02-02 — Entrar e sair do sistema

- **Tela inicial:** Cadastros / Operadores
- **Ação:** Autenticar operador e encerrar sessão
- **Validações:** Credenciais válidas, bloqueio de tentativas e política de sessão
- **Resultado esperado:** Sessão local aberta ou finalizada conforme permissão
- **Recuperação do erro:** Não autenticar e oferecer nova tentativa sem expor credenciais
- **Situação:** planejado
- **QA automatizado vinculado:** QA-02-02 (e2e) — `tests/journeys/QA-02-02.test.mjs` — pendente-jornada

### FL-02-03 — Definir perfis e permissões

- **Tela inicial:** Cadastros / Operadores
- **Ação:** Configurar direitos de caixa, gerente e administrador
- **Validações:** Matriz de permissões canônica e privilégios mínimos
- **Resultado esperado:** Operações restritas a perfis autorizados
- **Recuperação do erro:** Negar ação sem alterar dados e registrar ocorrência
- **Situação:** planejado
- **QA automatizado vinculado:** QA-02-03 (integracao) — `tests/journeys/QA-02-03.test.mjs` — pendente-jornada

### FL-02-04 — Trocar operador e auditar ações

- **Tela inicial:** Cadastros / Operadores
- **Ação:** Alternar operador responsável durante turno
- **Validações:** Operador ativo, caixa válido e ação rastreável
- **Resultado esperado:** Próximas movimentações vinculadas ao novo operador
- **Recuperação do erro:** Manter operador anterior caso troca falhe
- **Situação:** planejado
- **QA automatizado vinculado:** QA-02-04 (e2e) — `tests/journeys/QA-02-04.test.mjs` — pendente-jornada

<a id="mod-03"></a>

## MOD-03 — Produtos e categorias

**Tela do módulo:** Cadastros / Produtos e Categorias

### FL-03-01 — Cadastrar, editar e desativar produtos

- **Tela inicial:** Cadastros / Produtos e Categorias
- **Ação:** Criar, editar ou desativar um produto
- **Validações:** Nome obrigatório, código único, unidade UN/KG, valores não negativos
- **Resultado esperado:** Produto persistido e desativação lógica sem apagar histórico
- **Recuperação do erro:** Preservar formulário e impedir desativação inconsistente
- **Situação:** presente-no-marco-a
- **QA automatizado vinculado:** QA-03-01 (integracao) — `tests/journeys/QA-03-01.test.mjs` — pendente-jornada
- **Evidência parcial de backend:** `tests/catalog.test.mjs` (não prova jornada ponta a ponta)

### FL-03-02 — Cadastrar categorias, unidades e códigos

- **Tela inicial:** Cadastros / Produtos e Categorias
- **Ação:** Criar categoria e atribuir código e unidade ao produto
- **Validações:** Categoria ativa, código normalizado sem duplicidade e unidade válida
- **Resultado esperado:** Catálogo referenciado sem inconsistência
- **Recuperação do erro:** Bloquear vínculo inválido e permitir correção no formulário
- **Situação:** presente-no-marco-a
- **QA automatizado vinculado:** QA-03-02 (integracao) — `tests/journeys/QA-03-02.test.mjs` — pendente-jornada
- **Evidência parcial de backend:** `tests/catalog.test.mjs` (não prova jornada ponta a ponta)

### FL-03-03 — Definir preços e custos

- **Tela inicial:** Cadastros / Produtos e Categorias
- **Ação:** Alterar preços de venda e custo
- **Validações:** Conversão para centavos, precisão e valores permitidos
- **Resultado esperado:** Novos valores confirmados por leitura do SQLite
- **Recuperação do erro:** Manter valores anteriores se a transação falhar
- **Situação:** presente-no-marco-a
- **QA automatizado vinculado:** QA-03-03 (integracao) — `tests/journeys/QA-03-03.test.mjs` — pendente-jornada
- **Evidência parcial de backend:** `tests/catalog.test.mjs` (não prova jornada ponta a ponta)

### FL-03-04 — Pesquisar e ler códigos de barras

- **Tela inicial:** Cadastros / Produtos e Categorias
- **Ação:** Pesquisar produto por nome, SKU ou leitura HID
- **Validações:** Código exato, produto ativo e inexistência de ambiguidade
- **Resultado esperado:** Produto correspondente exibido e selecionável
- **Recuperação do erro:** Informar código não encontrado e manter busca disponível
- **Situação:** presente-no-marco-a
- **QA automatizado vinculado:** QA-03-04 (e2e) — `tests/journeys/QA-03-04.test.mjs` — pendente-jornada
- **Evidência parcial de backend:** `tests/catalog.test.mjs` (não prova jornada ponta a ponta)

<a id="mod-04"></a>

## MOD-04 — Clientes

**Tela do módulo:** Cadastros / Clientes

### FL-04-01 — Cadastrar e editar clientes

- **Tela inicial:** Cadastros / Clientes
- **Ação:** Preencher formulário de cliente e salvar
- **Validações:** Nome obrigatório, campos de documento e contato com formato permitido
- **Resultado esperado:** Cliente persistido com identificador estável
- **Recuperação do erro:** Reter valores digitados e indicar erro de validação
- **Situação:** presente-no-marco-a
- **QA automatizado vinculado:** QA-04-01 (integracao) — `tests/journeys/QA-04-01.test.mjs` — pendente-jornada
- **Evidência parcial de backend:** `tests/catalog.test.mjs` (não prova jornada ponta a ponta)

### FL-04-02 — Pesquisar por nome e CPF/CNPJ

- **Tela inicial:** Cadastros / Clientes
- **Ação:** Digitar critério de busca no cadastro
- **Validações:** Normalização da pesquisa e visibilidade de cadastros ativos
- **Resultado esperado:** Lista filtrada e paginada sem perda silenciosa
- **Recuperação do erro:** Exibir estado vazio e permitir limpar filtro
- **Situação:** presente-no-marco-a
- **QA automatizado vinculado:** QA-04-02 (e2e) — `tests/journeys/QA-04-02.test.mjs` — pendente-jornada
- **Evidência parcial de backend:** `tests/catalog.test.mjs` (não prova jornada ponta a ponta)

### FL-04-03 — Consultar histórico de compras

- **Tela inicial:** Cadastros / Clientes
- **Ação:** Abrir detalhes e histórico do cliente
- **Validações:** Cliente existente, acesso autorizado e vendas associadas
- **Resultado esperado:** Vendas do cliente apresentadas por data
- **Recuperação do erro:** Apresentar histórico vazio ou tentar novamente em falha de leitura
- **Situação:** planejado
- **QA automatizado vinculado:** QA-04-03 (integracao) — `tests/journeys/QA-04-03.test.mjs` — pendente-jornada

### FL-04-04 — Consultar saldos e créditos

- **Tela inicial:** Cadastros / Clientes
- **Ação:** Consultar créditos, pagamentos pendentes e fiado
- **Validações:** Somente lançamentos válidos e saldo calculado canonicamente
- **Resultado esperado:** Saldo e movimentos conciliáveis
- **Recuperação do erro:** Exibir divergência e não alterar saldo em erro
- **Situação:** planejado
- **QA automatizado vinculado:** QA-04-04 (integracao) — `tests/journeys/QA-04-04.test.mjs` — pendente-jornada

<a id="mod-05"></a>

## MOD-05 — Fornecedores

**Tela do módulo:** Cadastros / Fornecedores

### FL-05-01 — Cadastrar e editar fornecedores

- **Tela inicial:** Cadastros / Fornecedores
- **Ação:** Criar ou alterar fornecedor
- **Validações:** Nome obrigatório, contato válido e identidade estável
- **Resultado esperado:** Cadastro salvo no SQLite e disponível na lista
- **Recuperação do erro:** Manter formulário e permitir correção sem duplicar cadastro
- **Situação:** presente-no-marco-a
- **QA automatizado vinculado:** QA-05-01 (integracao) — `tests/journeys/QA-05-01.test.mjs` — pendente-jornada
- **Evidência parcial de backend:** `tests/catalog.test.mjs` (não prova jornada ponta a ponta)

### FL-05-02 — Relacionar fornecedores a produtos

- **Tela inicial:** Cadastros / Fornecedores
- **Ação:** Selecionar fornecedor no cadastro de produto
- **Validações:** Ambos ativos e referência consistente
- **Resultado esperado:** Relação fornecedor-produto consultável
- **Recuperação do erro:** Rejeitar vínculo inválido e preservar seleção anterior
- **Situação:** planejado
- **QA automatizado vinculado:** QA-05-02 (integracao) — `tests/journeys/QA-05-02.test.mjs` — pendente-jornada

### FL-05-03 — Consultar compras e histórico

- **Tela inicial:** Cadastros / Fornecedores
- **Ação:** Abrir detalhes das compras vinculadas
- **Validações:** Fornecedor existente, pedidos com IDs válidos
- **Resultado esperado:** Histórico navegável por pedido
- **Recuperação do erro:** Exibir ausência de compras ou tentar ler novamente
- **Situação:** planejado
- **QA automatizado vinculado:** QA-05-03 (integracao) — `tests/journeys/QA-05-03.test.mjs` — pendente-jornada

<a id="mod-06"></a>

## MOD-06 — Frente de caixa

**Tela do módulo:** Frente de caixa / F2

### FL-06-01 — Localizar e adicionar produtos

- **Tela inicial:** Frente de caixa / F2
- **Ação:** Ler código HID ou selecionar produto na busca
- **Validações:** Produto ativo, código identificável e unidade permitida
- **Resultado esperado:** Linha adicionada ao rascunho sem salvar venda prematuramente
- **Recuperação do erro:** Exibir erro de busca e manter carrinho intacto
- **Situação:** presente-no-marco-a
- **QA automatizado vinculado:** QA-06-01 (e2e) — `tests/journeys/QA-06-01.test.mjs` — pendente-jornada
- **Evidência parcial de backend:** `tests/catalog.test.mjs` (não prova jornada ponta a ponta)

### FL-06-02 — Alterar quantidade e remover itens

- **Tela inicial:** Frente de caixa / F2
- **Ação:** Usar controles de quantidade ou retirar linha
- **Validações:** UN inteiro, KG em milésimos e total monetário preciso
- **Resultado esperado:** Carrinho atualizado e total recalculado
- **Recuperação do erro:** Rejeitar quantidade inválida sem modificar linhas válidas
- **Situação:** presente-no-marco-a
- **QA automatizado vinculado:** QA-06-02 (unitario) — `tests/journeys/QA-06-02.test.mjs` — pendente-jornada
- **Evidência parcial de backend:** `tests/catalog.test.mjs` (não prova jornada ponta a ponta)

### FL-06-03 — Aplicar descontos autorizados

- **Tela inicial:** Frente de caixa / F2
- **Ação:** Informar desconto por item ou venda
- **Validações:** Limite por perfil, valor máximo e total não negativo
- **Resultado esperado:** Desconto gravado no rascunho e recalculado
- **Recuperação do erro:** Negar desconto indevido e manter preço anterior
- **Situação:** planejado
- **QA automatizado vinculado:** QA-06-03 (integracao) — `tests/journeys/QA-06-03.test.mjs` — pendente-jornada

### FL-06-04 — Suspender, recuperar ou cancelar venda

- **Tela inicial:** Frente de caixa / F2
- **Ação:** Suspender rascunho, reabrir ou descartá-lo
- **Validações:** Identificador de rascunho, isolamento de operador e confirmação
- **Resultado esperado:** Rascunho recuperável ou cancelado sem estoque movimentado
- **Recuperação do erro:** Recuperar estado anterior em falha de persistência
- **Situação:** planejado
- **QA automatizado vinculado:** QA-06-04 (integracao) — `tests/journeys/QA-06-04.test.mjs` — pendente-jornada

### FL-06-05 — Concluir a venda

- **Tela inicial:** Frente de caixa / F2
- **Ação:** Confirmar itens e pagamentos
- **Validações:** Total conciliado, estoque e caixa consistentes, operação idempotente
- **Resultado esperado:** Venda e efeitos registrados atomicamente no SQLite
- **Recuperação do erro:** Rollback integral, conservar rascunho e permitir nova tentativa
- **Situação:** em-desenvolvimento-pr-2
- **QA automatizado vinculado:** QA-06-05 (integracao) — `tests/journeys/QA-06-05.test.mjs` — pendente-jornada

<a id="mod-07"></a>

## MOD-07 — Pagamentos

**Tela do módulo:** Frente de caixa / Pagamento

### FL-07-01 — Receber em dinheiro

- **Tela inicial:** Frente de caixa / Pagamento
- **Ação:** Informar valor entregue pelo cliente
- **Validações:** Valor positivo, suficiente para liquidar parcela e precisão em centavos
- **Resultado esperado:** Pagamento manual registrado na venda
- **Recuperação do erro:** Rejeitar valor insuficiente sem gerar venda parcial
- **Situação:** em-desenvolvimento-pr-2
- **QA automatizado vinculado:** QA-07-01 (integracao) — `tests/journeys/QA-07-01.test.mjs` — pendente-jornada

### FL-07-02 — Registrar Pix e cartão

- **Tela inicial:** Frente de caixa / Pagamento
- **Ação:** Escolher Pix ou cartão e informar confirmação manual
- **Validações:** Identificador de transação quando aplicável, valor válido e ausência de falsa liquidação
- **Resultado esperado:** Meio de pagamento anotado sem depender de gateway
- **Recuperação do erro:** Manter pendente quando não houver confirmação real
- **Situação:** em-desenvolvimento-pr-2
- **QA automatizado vinculado:** QA-07-02 (integracao) — `tests/journeys/QA-07-02.test.mjs` — pendente-jornada

### FL-07-03 — Dividir em múltiplas formas

- **Tela inicial:** Frente de caixa / Pagamento
- **Ação:** Distribuir total entre dois ou mais meios
- **Validações:** Soma das parcelas igual ao total e nenhum valor negativo
- **Resultado esperado:** Venda quitada com discriminação dos meios
- **Recuperação do erro:** Informar diferença e permitir editar distribuição
- **Situação:** em-desenvolvimento-pr-2
- **QA automatizado vinculado:** QA-07-03 (unitario) — `tests/journeys/QA-07-03.test.mjs` — pendente-jornada

### FL-07-04 — Calcular troco

- **Tela inicial:** Frente de caixa / Pagamento
- **Ação:** Informar recebido em dinheiro acima do devido
- **Validações:** Troco em centavos, sem arredondamento flutuante
- **Resultado esperado:** Troco correto exibido e registrado
- **Recuperação do erro:** Bloquear confirmação se cálculo exceder limites seguros
- **Situação:** em-desenvolvimento-pr-2
- **QA automatizado vinculado:** QA-07-04 (unitario) — `tests/journeys/QA-07-04.test.mjs` — pendente-jornada

### FL-07-05 — Estornar ou cancelar pagamentos

- **Tela inicial:** Frente de caixa / Pagamento
- **Ação:** Selecionar pagamento e solicitar estorno
- **Validações:** Permissão, motivo, vínculo de venda e estado permitido
- **Resultado esperado:** Estorno auditável com efeitos financeiros revertidos
- **Recuperação do erro:** Preservar lançamento quando estorno falhar, sem simular devolução externa
- **Situação:** planejado
- **QA automatizado vinculado:** QA-07-05 (integracao) — `tests/journeys/QA-07-05.test.mjs` — pendente-jornada

<a id="mod-08"></a>

## MOD-08 — Controle de caixa

**Tela do módulo:** Caixa / Turno

### FL-08-01 — Abrir caixa com saldo inicial

- **Tela inicial:** Caixa / Turno
- **Ação:** Informar fundo inicial e iniciar turno
- **Validações:** Um turno aberto por caixa, saldo em centavos e operador válido
- **Resultado esperado:** Turno aberto com saldo inicial persistido
- **Recuperação do erro:** Não criar turno duplicado e oferecer retomar turno existente
- **Situação:** em-desenvolvimento-pr-2
- **QA automatizado vinculado:** QA-08-01 (integracao) — `tests/journeys/QA-08-01.test.mjs` — pendente-jornada

### FL-08-02 — Registrar sangria e suprimento

- **Tela inicial:** Caixa / Turno
- **Ação:** Informar retirada ou reforço de dinheiro
- **Validações:** Turno aberto, valor positivo, autorização e saldo suficiente para retirada
- **Resultado esperado:** Movimento registrado e saldo atualizado
- **Recuperação do erro:** Rollback em erro e manutenção do saldo anterior
- **Situação:** em-desenvolvimento-pr-2
- **QA automatizado vinculado:** QA-08-02 (integracao) — `tests/journeys/QA-08-02.test.mjs` — pendente-jornada

### FL-08-03 — Consultar movimentações

- **Tela inicial:** Caixa / Turno
- **Ação:** Abrir extrato do turno
- **Validações:** Filtros válidos e leitura consistente de vendas e ajustes
- **Resultado esperado:** Extrato reproduzível, ordenado e conciliável
- **Recuperação do erro:** Exibir erro de leitura sem ocultar divergência
- **Situação:** em-desenvolvimento-pr-2
- **QA automatizado vinculado:** QA-08-03 (integracao) — `tests/journeys/QA-08-03.test.mjs` — pendente-jornada

### FL-08-04 — Fechar e conferir caixa

- **Tela inicial:** Caixa / Turno
- **Ação:** Informar valor contado e concluir conferência
- **Validações:** Turno ativo, valores recebidos, diferença calculada e permissão
- **Resultado esperado:** Turno fechado sem aceitar lançamentos novos
- **Recuperação do erro:** Não finalizar se houver transação pendente ou erro de banco
- **Situação:** em-desenvolvimento-pr-2
- **QA automatizado vinculado:** QA-08-04 (integracao) — `tests/journeys/QA-08-04.test.mjs` — pendente-jornada

### FL-08-05 — Registrar divergências

- **Tela inicial:** Caixa / Turno
- **Ação:** Informar justificativa para diferença de fechamento
- **Validações:** Diferença calculada, texto de justificativa e auditoria
- **Resultado esperado:** Divergência vinculada ao fechamento
- **Recuperação do erro:** Preservar contagem e exigir correção de justificativa
- **Situação:** planejado
- **QA automatizado vinculado:** QA-08-05 (integracao) — `tests/journeys/QA-08-05.test.mjs` — pendente-jornada

<a id="mod-09"></a>

## MOD-09 — Estoque

**Tela do módulo:** Estoque / Movimentações

### FL-09-01 — Consultar saldos

- **Tela inicial:** Estoque / Movimentações
- **Ação:** Abrir posição de estoque por produto
- **Validações:** Produto existente e soma de movimentos consistente
- **Resultado esperado:** Quantidade disponível exibida em unidade correta
- **Recuperação do erro:** Sinalizar inconsistência e manter último dado confirmado
- **Situação:** em-desenvolvimento-pr-2
- **QA automatizado vinculado:** QA-09-01 (integracao) — `tests/journeys/QA-09-01.test.mjs` — pendente-jornada

### FL-09-02 — Dar entrada e baixa

- **Tela inicial:** Estoque / Movimentações
- **Ação:** Registrar recebimento ou saída de produto
- **Validações:** Quantidade positiva, tipo do movimento e disponibilidade para baixa
- **Resultado esperado:** Movimento imutável e saldo atualizado atomicamente
- **Recuperação do erro:** Rollback completo, impedir saldos inválidos
- **Situação:** em-desenvolvimento-pr-2
- **QA automatizado vinculado:** QA-09-02 (integracao) — `tests/journeys/QA-09-02.test.mjs` — pendente-jornada

### FL-09-03 — Executar inventário e ajustes

- **Tela inicial:** Estoque / Movimentações
- **Ação:** Contar itens e confirmar ajuste
- **Validações:** Sessão de contagem válida e justificativa para diferença
- **Resultado esperado:** Ajuste rastreado e saldo reconciliado
- **Recuperação do erro:** Preservar contagem sem aplicar ajuste em erro
- **Situação:** planejado
- **QA automatizado vinculado:** QA-09-03 (integracao) — `tests/journeys/QA-09-03.test.mjs` — pendente-jornada

### FL-09-04 — Registrar perdas e devoluções

- **Tela inicial:** Estoque / Movimentações
- **Ação:** Registrar avaria, perda ou retorno ao estoque
- **Validações:** Motivo válido, referência da venda e quantidade possível
- **Resultado esperado:** Movimento auditado sem duplicar devolução
- **Recuperação do erro:** Bloquear movimento repetido e solicitar revisão
- **Situação:** planejado
- **QA automatizado vinculado:** QA-09-04 (integracao) — `tests/journeys/QA-09-04.test.mjs` — pendente-jornada

### FL-09-05 — Configurar alertas de estoque mínimo

- **Tela inicial:** Estoque / Movimentações
- **Ação:** Definir limite de reposição por produto
- **Validações:** Limite não negativo, unidade consistente e produto ativo
- **Resultado esperado:** Produtos abaixo do mínimo destacados
- **Recuperação do erro:** Manter limite anterior se atualização falhar
- **Situação:** planejado
- **QA automatizado vinculado:** QA-09-05 (integracao) — `tests/journeys/QA-09-05.test.mjs` — pendente-jornada

<a id="mod-10"></a>

## MOD-10 — Compras e recebimento

**Tela do módulo:** Compras / Pedidos

### FL-10-01 — Criar pedido de compra

- **Tela inicial:** Compras / Pedidos
- **Ação:** Selecionar fornecedor e itens necessários
- **Validações:** Fornecedor ativo, itens válidos, quantidades e custos coerentes
- **Resultado esperado:** Pedido salvo com estado rascunho ou enviado
- **Recuperação do erro:** Preservar pedido editável após erro de gravação
- **Situação:** planejado
- **QA automatizado vinculado:** QA-10-01 (integracao) — `tests/journeys/QA-10-01.test.mjs` — pendente-jornada

### FL-10-02 — Registrar recebimento de mercadorias

- **Tela inicial:** Compras / Pedidos
- **Ação:** Conferir itens recebidos contra pedido
- **Validações:** Pedido aberto, quantidades e divergências identificadas
- **Resultado esperado:** Recebimento parcial ou total rastreado
- **Recuperação do erro:** Não movimentar estoque de itens rejeitados
- **Situação:** planejado
- **QA automatizado vinculado:** QA-10-02 (integracao) — `tests/journeys/QA-10-02.test.mjs` — pendente-jornada

### FL-10-03 — Atualizar estoque e custo

- **Tela inicial:** Compras / Pedidos
- **Ação:** Confirmar entrada e novo custo referencial
- **Validações:** Recebimento aprovado e custo canônico
- **Resultado esperado:** Saldo e custo atualizados em uma transação
- **Recuperação do erro:** Rollback conjunto em falha de qualquer atualização
- **Situação:** planejado
- **QA automatizado vinculado:** QA-10-03 (integracao) — `tests/journeys/QA-10-03.test.mjs` — pendente-jornada

### FL-10-04 — Registrar despesas da compra

- **Tela inicial:** Compras / Pedidos
- **Ação:** Adicionar frete, taxas ou custos extras
- **Validações:** Valores não negativos e referência à compra
- **Resultado esperado:** Despesas vinculadas ao pedido e financeiro
- **Recuperação do erro:** Não salvar despesa sem vínculo válido
- **Situação:** planejado
- **QA automatizado vinculado:** QA-10-04 (integracao) — `tests/journeys/QA-10-04.test.mjs` — pendente-jornada

<a id="mod-11"></a>

## MOD-11 — Trocas, devoluções e cancelamentos

**Tela do módulo:** Vendas / Histórico

### FL-11-01 — Localizar venda original

- **Tela inicial:** Vendas / Histórico
- **Ação:** Pesquisar venda pelo código, período ou cliente
- **Validações:** Venda existente e acesso autorizado
- **Resultado esperado:** Documento original aberto para operação pós-venda
- **Recuperação do erro:** Mostrar venda não encontrada sem alterar lançamentos
- **Situação:** planejado
- **QA automatizado vinculado:** QA-11-01 (integracao) — `tests/journeys/QA-11-01.test.mjs` — pendente-jornada

### FL-11-02 — Devolver itens parcialmente ou integralmente

- **Tela inicial:** Vendas / Histórico
- **Ação:** Selecionar itens e quantidades para devolução
- **Validações:** Quantidade não supera a vendida menos devoluções anteriores
- **Resultado esperado:** Devolução registrada e vinculada à venda original
- **Recuperação do erro:** Rejeitar duplicidade e preservar seleção
- **Situação:** planejado
- **QA automatizado vinculado:** QA-11-02 (integracao) — `tests/journeys/QA-11-02.test.mjs` — pendente-jornada

### FL-11-03 — Reintegrar estoque conforme regra

- **Tela inicial:** Vendas / Histórico
- **Ação:** Indicar se item devolvido está apto à revenda
- **Validações:** Estado do produto e política de reintegração
- **Resultado esperado:** Estoque atualizado apenas quando aplicável
- **Recuperação do erro:** Reverter transação em falha de movimentação
- **Situação:** planejado
- **QA automatizado vinculado:** QA-11-03 (integracao) — `tests/journeys/QA-11-03.test.mjs` — pendente-jornada

### FL-11-04 — Restituir ou gerar crédito

- **Tela inicial:** Vendas / Histórico
- **Ação:** Selecionar restituição manual ou crédito de cliente
- **Validações:** Valor igual ao devido, autorização e tipo de restituição
- **Resultado esperado:** Crédito/saída registrado com vínculo original
- **Recuperação do erro:** Manter obrigação pendente se devolução externa não confirmada
- **Situação:** planejado
- **QA automatizado vinculado:** QA-11-04 (integracao) — `tests/journeys/QA-11-04.test.mjs` — pendente-jornada

### FL-11-05 — Registrar motivo e autorização

- **Tela inicial:** Vendas / Histórico
- **Ação:** Informar justificativa e autorizar cancelamento
- **Validações:** Operador com permissão, motivo e prazo permitido
- **Resultado esperado:** Auditoria registra quem, quando e por quê
- **Recuperação do erro:** Negar sem permissão e manter venda original
- **Situação:** planejado
- **QA automatizado vinculado:** QA-11-05 (integracao) — `tests/journeys/QA-11-05.test.mjs` — pendente-jornada

<a id="mod-12"></a>

## MOD-12 — Orçamentos e pedidos

**Tela do módulo:** Vendas / Orçamentos

### FL-12-01 — Criar orçamento

- **Tela inicial:** Vendas / Orçamentos
- **Ação:** Selecionar cliente e itens sem cobrar
- **Validações:** Produtos existentes, preços canônicos e validade permitida
- **Resultado esperado:** Orçamento persistido sem movimentar caixa ou estoque
- **Recuperação do erro:** Preservar rascunho após falha
- **Situação:** planejado
- **QA automatizado vinculado:** QA-12-01 (integracao) — `tests/journeys/QA-12-01.test.mjs` — pendente-jornada

### FL-12-02 — Converter orçamento em venda

- **Tela inicial:** Vendas / Orçamentos
- **Ação:** Confirmar orçamento e abrir caixa
- **Validações:** Orçamento válido, itens disponíveis e preços revisados
- **Resultado esperado:** Carrinho originado do orçamento sem duplicação de venda
- **Recuperação do erro:** Informar indisponibilidade e não concluir automaticamente
- **Situação:** planejado
- **QA automatizado vinculado:** QA-12-02 (integracao) — `tests/journeys/QA-12-02.test.mjs` — pendente-jornada

### FL-12-03 — Reservar produtos quando aplicável

- **Tela inicial:** Vendas / Orçamentos
- **Ação:** Marcar reserva de itens por prazo
- **Validações:** Limite de estoque, vencimento e identificação do pedido
- **Resultado esperado:** Reserva registrada separadamente da baixa real
- **Recuperação do erro:** Desfazer reserva e avisar em caso de conflito
- **Situação:** planejado
- **QA automatizado vinculado:** QA-12-03 (integracao) — `tests/journeys/QA-12-03.test.mjs` — pendente-jornada

### FL-12-04 — Consultar pedidos pendentes

- **Tela inicial:** Vendas / Orçamentos
- **Ação:** Filtrar pedidos por situação, cliente e data
- **Validações:** Filtros válidos e IDs consistentes
- **Resultado esperado:** Lista completa dos pedidos ainda abertos
- **Recuperação do erro:** Exibir estado vazio ou permitir recarregar
- **Situação:** planejado
- **QA automatizado vinculado:** QA-12-04 (e2e) — `tests/journeys/QA-12-04.test.mjs` — pendente-jornada

<a id="mod-13"></a>

## MOD-13 — Mesas, comandas e garçom

**Tela do módulo:** Salão / Mapa de mesas e comandas

### FL-13-01 — Abrir mesa ou comanda

- **Tela inicial:** Salão / Mapa de mesas e comandas
- **Ação:** Selecionar mesa livre ou criar comanda
- **Validações:** Identificador único, capacidade e estado disponível
- **Resultado esperado:** Mesa/comanda aberta com responsável identificado
- **Recuperação do erro:** Impedir duas aberturas simultâneas para o mesmo identificador
- **Situação:** planejado
- **QA automatizado vinculado:** QA-13-01 (integracao) — `tests/journeys/QA-13-01.test.mjs` — pendente-jornada

### FL-13-02 — Adicionar e transferir pedidos

- **Tela inicial:** Salão / Mapa de mesas e comandas
- **Ação:** Garçom lança itens ou transfere entre mesas/comandas
- **Validações:** Operador identificado, itens válidos e origem/destino compatíveis
- **Resultado esperado:** Itens adicionados ou transferidos sem duplicidade
- **Recuperação do erro:** Rollback da transferência em qualquer falha
- **Situação:** planejado
- **QA automatizado vinculado:** QA-13-02 (integracao) — `tests/journeys/QA-13-02.test.mjs` — pendente-jornada

### FL-13-03 — Unir ou dividir contas

- **Tela inicial:** Salão / Mapa de mesas e comandas
- **Ação:** Selecionar itens de duas contas ou distribuir itens de uma conta
- **Validações:** Quantidades não duplicadas, totais preservados e estado aberto
- **Resultado esperado:** Contas consolidadas ou desmembradas com valores corretos
- **Recuperação do erro:** Manter contas originais caso conciliação falhe
- **Situação:** planejado
- **QA automatizado vinculado:** QA-13-03 (integracao) — `tests/journeys/QA-13-03.test.mjs` — pendente-jornada

### FL-13-04 — Fechar mesa

- **Tela inicial:** Salão / Mapa de mesas e comandas
- **Ação:** Revisar consumo, pagar e liberar a mesa
- **Validações:** Pagamento conciliado, comanda sem itens pendentes e operador autorizado
- **Resultado esperado:** Venda persistida, comanda encerrada e mesa liberada
- **Recuperação do erro:** Não liberar mesa se pagamento ou venda falhar
- **Situação:** planejado
- **QA automatizado vinculado:** QA-13-04 (e2e) — `tests/journeys/QA-13-04.test.mjs` — pendente-jornada

### FL-13-05 — Acessar via dispositivos na rede local

- **Tela inicial:** Salão / Mapa de mesas e comandas
- **Ação:** Garçom abre interface em celular na LAN
- **Validações:** Autenticação local, autorização, conexão e sincronização sem internet externa
- **Resultado esperado:** Pedidos chegam ao servidor local e são confirmados por ID
- **Recuperação do erro:** Fila local reenvia sem duplicar lançamentos após reconexão
- **Situação:** planejado
- **QA automatizado vinculado:** QA-13-05 (e2e) — `tests/journeys/QA-13-05.test.mjs` — pendente-jornada

<a id="mod-14"></a>

## MOD-14 — Fiscal

**Tela do módulo:** Fiscal / Emissão

### FL-14-01 — Configurar dados fiscais

- **Tela inicial:** Fiscal / Emissão
- **Ação:** Cadastrar emitente e parâmetros fiscais
- **Validações:** CNPJ e inscrições válidas, certificado e ambiente coerentes
- **Resultado esperado:** Parâmetros salvos sem expor segredos no frontend
- **Recuperação do erro:** Impedir emissão até corrigir configuração
- **Situação:** planejado
- **QA automatizado vinculado:** QA-14-01 (integracao) — `tests/journeys/QA-14-01.test.mjs` — pendente-jornada

### FL-14-02 — Preparar e validar documento

- **Tela inicial:** Fiscal / Emissão
- **Ação:** Montar itens, tributos e totais para emissão
- **Validações:** Regras tributárias vigentes, unidade e valor de cada item
- **Resultado esperado:** Prévia fiscal válida associada à venda
- **Recuperação do erro:** Mostrar rejeições de validação sem perder venda
- **Situação:** planejado
- **QA automatizado vinculado:** QA-14-02 (integracao) — `tests/journeys/QA-14-02.test.mjs` — pendente-jornada

### FL-14-03 — Emitir NFC-e quando habilitada

- **Tela inicial:** Fiscal / Emissão
- **Ação:** Assinar e transmitir documento fiscal
- **Validações:** Credenciais e ambiente autorizados, conectividade e schema fiscal válido
- **Resultado esperado:** Autorização real registrada com chave e protocolo
- **Recuperação do erro:** Manter pendente/contingência quando não houver resposta real
- **Situação:** planejado
- **QA automatizado vinculado:** QA-14-03 (integracao) — `tests/journeys/QA-14-03.test.mjs` — pendente-jornada

### FL-14-04 — Cancelar ou inutilizar conforme regras

- **Tela inicial:** Fiscal / Emissão
- **Ação:** Solicitar evento fiscal com justificativa
- **Validações:** Janela legal aplicável, documento autorizado e permissão
- **Resultado esperado:** Evento real registrado sem apagar histórico
- **Recuperação do erro:** Preservar status anterior e reprocessar rejeição com segurança
- **Situação:** planejado
- **QA automatizado vinculado:** QA-14-04 (integracao) — `tests/journeys/QA-14-04.test.mjs` — pendente-jornada

### FL-14-05 — Tratar contingência e rejeições

- **Tela inicial:** Fiscal / Emissão
- **Ação:** Abrir fila fiscal pendente e revisar erro
- **Validações:** Estado da transmissão e idempotência pela chave fiscal
- **Resultado esperado:** Reenvio permitido ou orientação para correção
- **Recuperação do erro:** Não marcar autorizado até protocolo real
- **Situação:** planejado
- **QA automatizado vinculado:** QA-14-05 (integracao) — `tests/journeys/QA-14-05.test.mjs` — pendente-jornada

<a id="mod-15"></a>

## MOD-15 — Financeiro

**Tela do módulo:** Financeiro / Contas

### FL-15-01 — Registrar receitas e despesas

- **Tela inicial:** Financeiro / Contas
- **Ação:** Lançar entrada ou saída não vinculada à venda
- **Validações:** Categoria, valor, data e origem válidos
- **Resultado esperado:** Movimento persistido em centavos e auditável
- **Recuperação do erro:** Não duplicar lançamento após repetição
- **Situação:** em-desenvolvimento-pr-2
- **QA automatizado vinculado:** QA-15-01 (integracao) — `tests/journeys/QA-15-01.test.mjs` — pendente-jornada

### FL-15-02 — Controlar contas a pagar e receber

- **Tela inicial:** Financeiro / Contas
- **Ação:** Criar, liquidar ou cancelar título
- **Validações:** Vencimento, valor, contraparte e estado permitidos
- **Resultado esperado:** Título reconciliado com pagamentos e recebimentos
- **Recuperação do erro:** Preservar saldo em erro de baixa
- **Situação:** em-desenvolvimento-pr-2
- **QA automatizado vinculado:** QA-15-02 (integracao) — `tests/journeys/QA-15-02.test.mjs` — pendente-jornada

### FL-15-03 — Registrar vendas a prazo

- **Tela inicial:** Financeiro / Contas
- **Ação:** Selecionar cliente e vencimento para fiado
- **Validações:** Cliente identificável, limite aprovado e saldo correto
- **Resultado esperado:** Conta a receber vinculada à venda
- **Recuperação do erro:** Rollback da venda e do crédito se criação falhar
- **Situação:** em-desenvolvimento-pr-2
- **QA automatizado vinculado:** QA-15-03 (integracao) — `tests/journeys/QA-15-03.test.mjs` — pendente-jornada

### FL-15-04 — Conciliar recebimentos

- **Tela inicial:** Financeiro / Contas
- **Ação:** Relacionar liquidações aos títulos e vendas
- **Validações:** Referência única, valores e datas consistentes
- **Resultado esperado:** Títulos liquidados sem dupla baixa
- **Recuperação do erro:** Sinalizar diferença e manter títulos abertos
- **Situação:** planejado
- **QA automatizado vinculado:** QA-15-04 (integracao) — `tests/journeys/QA-15-04.test.mjs` — pendente-jornada

### FL-15-05 — Consultar fluxo de caixa

- **Tela inicial:** Financeiro / Contas
- **Ação:** Aplicar período e agrupar receitas/despesas
- **Validações:** Período válido e origem canônica dos lançamentos
- **Resultado esperado:** Visão de caixa coerente com movimentos reais
- **Recuperação do erro:** Exibir erro de cálculo sem fabricar valores
- **Situação:** planejado
- **QA automatizado vinculado:** QA-15-05 (integracao) — `tests/journeys/QA-15-05.test.mjs` — pendente-jornada

<a id="mod-16"></a>

## MOD-16 — Relatórios

**Tela do módulo:** Relatórios / Indicadores

### FL-16-01 — Relatório de vendas

- **Tela inicial:** Relatórios / Indicadores
- **Ação:** Escolher período e status das vendas
- **Validações:** Datas válidas, apenas vendas confirmadas e estornos considerados
- **Resultado esperado:** Totais e listagem compatíveis com o livro de vendas
- **Recuperação do erro:** Não apresentar valor anterior como atualizado após erro
- **Situação:** planejado
- **QA automatizado vinculado:** QA-16-01 (integracao) — `tests/journeys/QA-16-01.test.mjs` — pendente-jornada

### FL-16-02 — Produtos mais vendidos

- **Tela inicial:** Relatórios / Indicadores
- **Ação:** Agrupar itens por quantidade e faturamento
- **Validações:** Quantidade e devoluções consideradas, unidades coerentes
- **Resultado esperado:** Ranking reproduzível pelo mesmo período
- **Recuperação do erro:** Indicar ausência de vendas sem inventar ranking
- **Situação:** planejado
- **QA automatizado vinculado:** QA-16-02 (unitario) — `tests/journeys/QA-16-02.test.mjs` — pendente-jornada

### FL-16-03 — Desempenho por operador

- **Tela inicial:** Relatórios / Indicadores
- **Ação:** Selecionar operador e intervalo
- **Validações:** Operador identificado, associação de vendas por autoria
- **Resultado esperado:** Indicadores consistentes por operador
- **Recuperação do erro:** Exibir lacunas de autoria sem atribuir vendas incorretamente
- **Situação:** planejado
- **QA automatizado vinculado:** QA-16-03 (integracao) — `tests/journeys/QA-16-03.test.mjs` — pendente-jornada

### FL-16-04 — Fechamentos de caixa

- **Tela inicial:** Relatórios / Indicadores
- **Ação:** Consultar turnos e suas divergências
- **Validações:** Aberturas, movimentos e fechamentos persistidos
- **Resultado esperado:** Relatório conciliável de cada turno
- **Recuperação do erro:** Indicar turno inconsistente para revisão
- **Situação:** planejado
- **QA automatizado vinculado:** QA-16-04 (integracao) — `tests/journeys/QA-16-04.test.mjs` — pendente-jornada

### FL-16-05 — Margens, custos e indicadores

- **Tela inicial:** Relatórios / Indicadores
- **Ação:** Calcular margem com custos vinculados às vendas
- **Validações:** Precisão em centavos, custos históricos e devoluções
- **Resultado esperado:** Margens consistentes por item e período
- **Recuperação do erro:** Exibir dado indisponível quando custo for desconhecido
- **Situação:** planejado
- **QA automatizado vinculado:** QA-16-05 (unitario) — `tests/journeys/QA-16-05.test.mjs` — pendente-jornada

<a id="mod-17"></a>

## MOD-17 — Impressão e periféricos

**Tela do módulo:** Configurações / Dispositivos

### FL-17-01 — Configurar impressoras

- **Tela inicial:** Configurações / Dispositivos
- **Ação:** Selecionar impressora e testar comunicação
- **Validações:** Dispositivo presente, permissões e formato configurado
- **Resultado esperado:** Impressora salva e teste físico impresso
- **Recuperação do erro:** Permitir escolher outro dispositivo sem perder configuração
- **Situação:** planejado
- **QA automatizado vinculado:** QA-17-01 (hardware) — `tests/journeys/QA-17-01.test.mjs` — pendente-jornada

### FL-17-02 — Imprimir comprovantes

- **Tela inicial:** Configurações / Dispositivos
- **Ação:** Solicitar impressão após venda confirmada
- **Validações:** Venda persistida, valores corretos e dispositivo disponível
- **Resultado esperado:** Comprovante legível corresponde à venda
- **Recuperação do erro:** Oferecer reimpressão sem duplicar venda em falha de impressão
- **Situação:** planejado
- **QA automatizado vinculado:** QA-17-02 (hardware) — `tests/journeys/QA-17-02.test.mjs` — pendente-jornada

### FL-17-03 — Utilizar leitores de código de barras

- **Tela inicial:** Configurações / Dispositivos
- **Ação:** Ler código no campo de pesquisa
- **Validações:** Entrada HID reconhecida, foco e código único
- **Resultado esperado:** Produto correto identificado sem chamada remota
- **Recuperação do erro:** Oferecer digitação manual quando leitura falhar
- **Situação:** presente-no-marco-a
- **QA automatizado vinculado:** QA-17-03 (e2e) — `tests/journeys/QA-17-03.test.mjs` — pendente-jornada

### FL-17-04 — Acionar gaveta de dinheiro

- **Tela inicial:** Configurações / Dispositivos
- **Ação:** Executar abertura após pagamento em dinheiro
- **Validações:** Operador permitido, caixa aberto e dispositivo configurado
- **Resultado esperado:** Comando emitido apenas na operação permitida
- **Recuperação do erro:** Registrar erro físico sem repetir cobrança
- **Situação:** planejado
- **QA automatizado vinculado:** QA-17-04 (hardware) — `tests/journeys/QA-17-04.test.mjs` — pendente-jornada

### FL-17-05 — Reimprimir comprovantes

- **Tela inicial:** Configurações / Dispositivos
- **Ação:** Selecionar venda anterior e solicitar segunda via
- **Validações:** Venda existente e operador com permissão
- **Resultado esperado:** Segunda via identificada sem alterar total ou estoque
- **Recuperação do erro:** Informar dispositivo indisponível e permitir tentar de novo
- **Situação:** planejado
- **QA automatizado vinculado:** QA-17-05 (hardware) — `tests/journeys/QA-17-05.test.mjs` — pendente-jornada

<a id="mod-18"></a>

## MOD-18 — Configurações comerciais

**Tela do módulo:** Configurações / Regras

### FL-18-01 — Definir descontos e limites

- **Tela inicial:** Configurações / Regras
- **Ação:** Salvar regras de desconto por perfil
- **Validações:** Limites canônicos e sem valores negativos
- **Resultado esperado:** Regras aplicadas às próximas operações
- **Recuperação do erro:** Reverter alterações inválidas e preservar regra vigente
- **Situação:** planejado
- **QA automatizado vinculado:** QA-18-01 (integracao) — `tests/journeys/QA-18-01.test.mjs` — pendente-jornada

### FL-18-02 — Configurar formas de pagamento

- **Tela inicial:** Configurações / Regras
- **Ação:** Ativar ou desativar meios disponíveis
- **Validações:** Ao menos meio permitido, regras e operador autorizado
- **Resultado esperado:** Lista de meios atualizada no fechamento de venda
- **Recuperação do erro:** Impedir remoção de meio usado em transação em curso
- **Situação:** planejado
- **QA automatizado vinculado:** QA-18-02 (integracao) — `tests/journeys/QA-18-02.test.mjs` — pendente-jornada

### FL-18-03 — Definir arredondamentos e unidades

- **Tela inicial:** Configurações / Regras
- **Ação:** Revisar padrão monetário e granularidade de quantidade
- **Validações:** Centavos inteiros, milésimos para KG e UN inteiro
- **Resultado esperado:** Valores calculados sem diferenças flutuantes
- **Recuperação do erro:** Rejeitar regra conflitante preservando contrato canônico
- **Situação:** presente-no-marco-a
- **QA automatizado vinculado:** QA-18-03 (unitario) — `tests/journeys/QA-18-03.test.mjs` — pendente-jornada
- **Evidência parcial de backend:** `tests/catalog.test.mjs` (não prova jornada ponta a ponta)

### FL-18-04 — Configurar preferências operacionais

- **Tela inicial:** Configurações / Regras
- **Ação:** Salvar comportamento padrão da frente de caixa
- **Validações:** Opções conhecidas e direitos de alteração
- **Resultado esperado:** Preferências aplicadas ao reabrir aplicativo
- **Recuperação do erro:** Carregar padrão seguro se preferência estiver inválida
- **Situação:** planejado
- **QA automatizado vinculado:** QA-18-04 (integracao) — `tests/journeys/QA-18-04.test.mjs` — pendente-jornada

<a id="mod-19"></a>

## MOD-19 — Backup e restauração

**Tela do módulo:** Ferramentas / Backup

### FL-19-01 — Criar backup local

- **Tela inicial:** Ferramentas / Backup
- **Ação:** Selecionar destino e executar cópia consistente
- **Validações:** Banco não corrompido, destino gravável e cópia transacional
- **Resultado esperado:** Arquivo local verificável sem serviço externo
- **Recuperação do erro:** Não sobrescrever backup válido em falha de cópia
- **Situação:** planejado
- **QA automatizado vinculado:** QA-19-01 (integracao) — `tests/journeys/QA-19-01.test.mjs` — pendente-jornada

### FL-19-02 — Exportar dados em formato aberto

- **Tela inicial:** Ferramentas / Backup
- **Ação:** Escolher tabelas e exportar CSV ou planilha
- **Validações:** Campos canônicos, codificação, datas e valores corretos
- **Resultado esperado:** Arquivo aberto exportado sem perda silenciosa
- **Recuperação do erro:** Gerar erro sem criar exportação parcial enganosa
- **Situação:** planejado
- **QA automatizado vinculado:** QA-19-02 (integracao) — `tests/journeys/QA-19-02.test.mjs` — pendente-jornada

### FL-19-03 — Restaurar backup validado

- **Tela inicial:** Ferramentas / Backup
- **Ação:** Selecionar arquivo e confirmar restauração
- **Validações:** Versão compatível, integridade e confirmação explícita
- **Resultado esperado:** Dados restaurados e aplicativo reiniciado de forma segura
- **Recuperação do erro:** Manter banco anterior e rollback se validação falhar
- **Situação:** planejado
- **QA automatizado vinculado:** QA-19-03 (integracao) — `tests/journeys/QA-19-03.test.mjs` — pendente-jornada

### FL-19-04 — Verificar integridade e versão do banco

- **Tela inicial:** Ferramentas / Backup
- **Ação:** Executar diagnóstico local do SQLite
- **Validações:** Schema version, checks de integridade e migrações suportadas
- **Resultado esperado:** Resultado do diagnóstico com problemas identificados
- **Recuperação do erro:** Bloquear restauração insegura e oferecer correção orientada
- **Situação:** planejado
- **QA automatizado vinculado:** QA-19-04 (integracao) — `tests/journeys/QA-19-04.test.mjs` — pendente-jornada

<a id="mod-20"></a>

## MOD-20 — Funcionamento offline e sincronização

**Tela do módulo:** Status local / Sincronização

### FL-20-01 — Operar com SQLite local

- **Tela inicial:** Status local / Sincronização
- **Ação:** Abrir e usar cadastros sem internet
- **Validações:** Acesso ao arquivo SQLite e nenhuma dependência remota obrigatória
- **Resultado esperado:** Dados carregados e salvos com rede externa desligada
- **Recuperação do erro:** Tentar leitura local novamente sem exigir conta ou assinatura
- **Situação:** presente-no-marco-a
- **QA automatizado vinculado:** QA-20-01 (integracao) — `tests/journeys/QA-20-01.test.mjs` — pendente-jornada
- **Evidência parcial de backend:** `tests/catalog.test.mjs` (não prova jornada ponta a ponta)

### FL-20-02 — Preservar transações sem internet

- **Tela inicial:** Status local / Sincronização
- **Ação:** Concluir operações comerciais com rede externa desconectada
- **Validações:** Consistência e commit atômico no SQLite
- **Resultado esperado:** Venda local e movimentos persistem após reiniciar
- **Recuperação do erro:** Rollback e rascunho preservado em erro de gravação
- **Situação:** em-desenvolvimento-pr-2
- **QA automatizado vinculado:** QA-20-02 (integracao) — `tests/journeys/QA-20-02.test.mjs` — pendente-jornada

### FL-20-03 — Sincronizar com servidor próprio se configurado

- **Tela inicial:** Status local / Sincronização
- **Ação:** Ativar e iniciar sincronização opt-in
- **Validações:** Servidor self-hosted configurado, autenticação e versões compatíveis
- **Resultado esperado:** Dados replicados sem afetar operação local
- **Recuperação do erro:** Manter fila local e continuar operando sem conexão
- **Situação:** planejado
- **QA automatizado vinculado:** QA-20-03 (integracao) — `tests/journeys/QA-20-03.test.mjs` — pendente-jornada

### FL-20-04 — Resolver conflitos e retomar operações

- **Tela inicial:** Status local / Sincronização
- **Ação:** Reconciliar alterações divergentes por entidade
- **Validações:** Regras determinísticas e IDs imutáveis
- **Resultado esperado:** Conflito resolvido sem perda silenciosa
- **Recuperação do erro:** Encaminhar conflito não resolúvel à revisão e preservar ambas versões
- **Situação:** planejado
- **QA automatizado vinculado:** QA-20-04 (integracao) — `tests/journeys/QA-20-04.test.mjs` — pendente-jornada

<a id="mod-21"></a>

## MOD-21 — Auditoria e segurança

**Tela do módulo:** Auditoria / Eventos

### FL-21-01 — Registrar alterações críticas

- **Tela inicial:** Auditoria / Eventos
- **Ação:** Salvar evento ao alterar preço, produto ou configuração
- **Validações:** Usuário, origem, antes/depois e timestamp confiáveis
- **Resultado esperado:** Trilha de eventos consultável sem alterar dado de negócio
- **Recuperação do erro:** Reverter operação crítica se auditoria obrigatória falhar
- **Situação:** planejado
- **QA automatizado vinculado:** QA-21-01 (integracao) — `tests/journeys/QA-21-01.test.mjs` — pendente-jornada

### FL-21-02 — Rastrear cancelamentos e descontos

- **Tela inicial:** Auditoria / Eventos
- **Ação:** Consultar eventos de estorno e redução de preço
- **Validações:** Associação de venda, operador e motivo
- **Resultado esperado:** Trilha completa de autorização e valores
- **Recuperação do erro:** Não autorizar operação sem registro requerido
- **Situação:** planejado
- **QA automatizado vinculado:** QA-21-02 (integracao) — `tests/journeys/QA-21-02.test.mjs` — pendente-jornada

### FL-21-03 — Controlar acesso a operações

- **Tela inicial:** Auditoria / Eventos
- **Ação:** Tentar operação protegida com perfil restrito
- **Validações:** Matriz de permissões e identidade validada localmente
- **Resultado esperado:** Acesso concedido ou negado sem bypass por UI
- **Recuperação do erro:** Rejeitar alteração não autorizada sem gravar dados
- **Situação:** planejado
- **QA automatizado vinculado:** QA-21-03 (integracao) — `tests/journeys/QA-21-03.test.mjs` — pendente-jornada

### FL-21-04 — Consultar logs e falhas

- **Tela inicial:** Auditoria / Eventos
- **Ação:** Abrir histórico técnico filtrado
- **Validações:** Proteção de dados pessoais e separação de logs sensíveis
- **Resultado esperado:** Erros pesquisáveis com identificadores de correlação
- **Recuperação do erro:** Não travar operação por falha de visualização de logs
- **Situação:** planejado
- **QA automatizado vinculado:** QA-21-04 (integracao) — `tests/journeys/QA-21-04.test.mjs` — pendente-jornada

<a id="mod-22"></a>

## MOD-22 — Atualizações e manutenção

**Tela do módulo:** Ajuda / Sobre / Manutenção

### FL-22-01 — Identificar versão instalada

- **Tela inicial:** Ajuda / Sobre / Manutenção
- **Ação:** Abrir informações do aplicativo
- **Validações:** Versão lida da distribuição instalada
- **Resultado esperado:** Versão e compatibilidade exibidas corretamente
- **Recuperação do erro:** Exibir versão desconhecida sem inventar atualização disponível
- **Situação:** presente-no-marco-a
- **QA automatizado vinculado:** QA-22-01 (e2e) — `tests/journeys/QA-22-01.test.mjs` — pendente-jornada
- **Evidência parcial de backend:** `tests/catalog.test.mjs` (não prova jornada ponta a ponta)

### FL-22-02 — Executar migrações de banco

- **Tela inicial:** Ajuda / Sobre / Manutenção
- **Ação:** Abrir instalação com schema anterior
- **Validações:** PRAGMA user_version, migração idempotente e dados preservados
- **Resultado esperado:** Banco atualizado e reaberto com todos os registros
- **Recuperação do erro:** Abortar migração com cópia preservada
- **Situação:** presente-no-marco-a
- **QA automatizado vinculado:** QA-22-02 (integracao) — `tests/journeys/QA-22-02.test.mjs` — pendente-jornada
- **Evidência parcial de backend:** `tests/catalog.test.mjs` (não prova jornada ponta a ponta)

### FL-22-03 — Preservar dados existentes

- **Tela inicial:** Ajuda / Sobre / Manutenção
- **Ação:** Atualizar aplicativo mantendo base atual
- **Validações:** Diretório de dados fixo, UUID estável e formato compatível
- **Resultado esperado:** Cadastros e históricos anteriores intactos
- **Recuperação do erro:** Reverter binário sem apagar o banco
- **Situação:** planejado
- **QA automatizado vinculado:** QA-22-03 (integracao) — `tests/journeys/QA-22-03.test.mjs` — pendente-jornada

### FL-22-04 — Recuperar falhas e permitir rollback

- **Tela inicial:** Ajuda / Sobre / Manutenção
- **Ação:** Detectar falha na atualização ou inicialização
- **Validações:** Backup anterior, esquema compatível e diagnóstico rastreável
- **Resultado esperado:** Versão funcional restabelecida com dados consistentes
- **Recuperação do erro:** Bloquear rollback incompatível e oferecer restauração validada
- **Situação:** planejado
- **QA automatizado vinculado:** QA-22-04 (e2e) — `tests/journeys/QA-22-04.test.mjs` — pendente-jornada

## Critério de conclusão

Marcar um fluxo como coberto apenas quando o arquivo real do teste de jornada existir, executar o cenário positivo e o de recuperação e passar no CI. Para emissão fiscal, hardware e rede local, registrar também testes reais no ambiente adequado.
