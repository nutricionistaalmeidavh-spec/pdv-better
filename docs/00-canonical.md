# Marco A — Fontes de verdade canônicas

## Contrato sem duplicações
- Entidades, campos, tipos, rótulos e canais IPC: shared/contract.mjs.
- Validação, arredondamento e cálculos do carrinho: shared/domain.mjs.
- Persistência permanente: SQLite local, gerenciado apenas pelo processo principal Electron em electron/db.mjs. Sem segunda tabela espelhada no frontend.
- Operações de catálogo: bridge IPC explícita. Sem acesso genérico a Node.js, disco, SQL ou shell a partir da interface.
- Valores monetários persistidos em centavos inteiros; quantidades em milésimos inteiros.
- Cadastros possuem UUID estável e desativação lógica, sem exclusão física.
- O carrinho é um rascunho em memória no Marco A; não há venda salva, pagamento ou baixa de estoque.

## Jornada do usuário — versão proposta
1. Abrir o aplicativo, identificar o estabelecimento local e o módulo ativo.
2. Acessar Produtos -> Adicionar -> revisar campos com rótulos canônicos -> Salvar.
3. Confirmar produto no catálogo após leitura do SQLite; em falha preservar formulário e mostrar causa.
4. Acessar Frente de caixa (atalho F2) -> buscar por nome/código -> adicionar itens -> revisar unidades, quantidades e total.
5. A interface confirma explicitamente que é apenas uma prévia e que a conclusão de venda será adicionada no Marco B.
6. A desativação pede confirmação e não elimina os dados.

## Estados e recuperação
- Carregando: mostrar espera antes de listar cadastros.
- Banco indisponível: explicar problema e oferecer tentar novamente.
- Salvando: impedir nova ativação; sucesso apenas após resposta persistida e releitura da lista.
- Falha de salvamento: preservar formulário editável, inclusive conteúdo digitado.
- Carrinho vazio: mostrar ação para encontrar produtos; carrinho com itens: permitir remover/ajustar.
- Nenhum dado será gravado em serviço remoto sem escolha explícita.

## Fonte e escopo
Referência: nutricionistaalmeidavh-spec/PDVNexus, edição windows-10 (Electron 39, SQLite, lógica de carrinho e validação).
Não se declara equivalência com vendas e pagamentos do Nexus. Windows 7/8 excluídos. Suporte inicial Windows 10/11 x64.
Operadores neste marco são apenas cadastro; funções não habilitam acesso.

## Aceite
- Criar/editar/desativar produtos, categorias, clientes, fornecedores e operadores.
- Reabrir banco SQLite com registros preservados (validar com integração).
- Código de produto normalizado/exclusivo; categoria referenciada deve estar ativa.
- Quantidades UN inteiras e KG em milésimos; totais calculados em centavos.
- Nenhuma chamada a gateway de pagamento, emissão fiscal ou venda concluída.
- Testes automatizados no CI Windows; build e NSIS por workflow manual.
- Validação com usuários reais, periféricos e execução do instalador em Windows ainda precisam ser comprovadas; testes de código não os substituem.
