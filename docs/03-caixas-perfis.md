# Marco D — caixas independentes e perfis de acesso

## Entrega
- SQLite v4: cada sessão de caixa tem terminal_id, operador_id e índice único parcial apenas por terminal. Dois terminais podem abrir/fechar caixas simultaneamente, cada qual com dinheiro previsto, contagem, divergência e movimentos próprios.
- A loja continua usando um banco canônico no servidor LAN, com estoque único e idempotência de vendas. Não há sincronização de bancos diferentes.
- Cada venda, sangria, cancelamento e liquidação registra o operador responsável quando autenticado.
- A migração preserva histórico do v1–v3 e atribui eventual caixa legado aberto ao terminal que executou a atualização.

## Perfis e permissões
| Operação | Caixa | Gerente | Administrador |
|---|---|---|---|
| Entrar com senha, consultar produtos e clientes, vender e operar caixa do próprio terminal | Sim | Sim | Sim |
| Cadastrar clientes | Sim | Sim | Sim |
| Gerir produtos, estoque, descontos administrativos e movimentos financeiros | Não | Sim | Sim |
| Cancelar vendas, consultar relatórios e visualizar todos os caixas abertos | Não | Sim | Sim |
| Criar operadores, atribuir perfis, alterar senhas, rede LAN e restaurar backups | Não | Não | Sim |

A matriz canônica está em shared/access.mjs; nomes dos perfis em shared/contract.mjs. O backend valida cada operação em secureCall, tanto na ponte Electron quanto na RPC LAN. Não confiar apenas na navegação da interface.

## Primeira execução
1. Abra o PDV no computador servidor ou local.
2. Informe o nome do primeiro administrador e crie uma senha de 8 a 128 caracteres. Não existe usuário/senha padrão.
3. Em Operadores, cadastre outros colaboradores com função Caixa, Gerente ou Administrador.
4. Para cada operador novo, clique Definir senha e atribua seu primeiro acesso.
5. O usuário entra com sua conta; sua sessão expira ao reiniciar ou após 12 horas.
6. Um perfil desativado não pode operar; alteração de senha revoga as sessões anteriores.

## Terminais LAN
- Antes, conecte cada terminal ao servidor usando o pareamento da LAN privada; depois faça o login com a conta do operador.
- Além da chave da loja, cada requisição leva token de operador atrelado ao terminal; um token não pode ser reutilizado em outro terminal.
- Sessões de venda e caixa são executadas na mesma instância SQLite do servidor.
- Ao perder conexão não fazer checkout no banco local como fallback.
- O protocolo HTTP local não é cifrado. Use LAN privada confiável, isolamento de rede ou VPN e nunca exponha a porta à internet.

## Qualidade e limites
- Testes automatizados: duas sessões simultâneas, fechamento independente, saldos e estoque reconciliados, usuário com senha incorreta, permissões de Caixa/Gerente/Administrador e LAN com vinculação de sessão.
- Smoke Electron: criação do administrador, login, fluxo de venda, fechamento/reabertura e login após reiniciar.
- Instalador NSIS testado no Windows Server dos runners; homologação em Windows 10/11 físico e periféricos reais ainda é necessária.
- Caixas são independentes por terminal (não é possível abrir dois caixas simultâneos na mesma estação). Operadores podem alternar no mesmo terminal mediante logout/login; a sessão do caixa permanece aberta e identifica o operador de abertura e a autoria das próximas operações.
- Ainda não existe política configurável de permissões por subfunção: são três papéis predefinidos. Usuários não são sincronizados com a nuvem.
