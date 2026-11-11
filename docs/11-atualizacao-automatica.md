# Atualização automática — PDV Plus 0.6.0+

## Funcionamento

- O sistema instalado no Windows consulta GitHub Releases pelo electron-updater, a partir do app-update.yml embutido pelo electron-builder.
- Verifica uma vez após 15 segundos do início e a cada 6 horas enquanto estiver aberto.
- Quando houver versão maior, baixa o instalador NSIS em segundo plano. Nunca interrompe o caixa nem instala sem comando explícito.
- A tela Configurações → Atualizações apresenta versão atual, progresso, erros de conexão e botão Instalar e reiniciar.
- Gerente e Administrador podem instalar. Para evitar interromper atendimento, todos os caixas abertos da base canônica devem estar fechados.
- No servidor/local, o PDV faz backup consistente do SQLite e valida sua integridade antes de fechar e executar a atualização. Em terminal LAN cliente, a base canônica permanece no servidor.
- A atualização de binários não remove o diretório userData, bancos SQLite, preferências nem licença.
- Falhas de rede ou de backup mantêm a versão atual funcionando; nada é aplicado silenciosamente.
- O core funciona sem internet. GitHub Releases, que possui uso gratuito para o repositório público, só é necessário para distribuir novas versões. Nenhum serviço pago é requerido.

## Entrega/compatibilidade

A v0.5.0 e anteriores ainda **não contêm** o cliente de atualização. Essas instalações exigem executar manualmente o instalador da v0.6.0 uma única vez. **Não é possível disparar retroativamente uma instalação remota** em aparelhos que não possuam updater/agente pré-existente.

A partir da v0.6.0, novas versões que passem pelo QA e sejam publicadas com os arquivos exigidos (instalador, latest.yml, SHA512 e opcional blockmap) serão detectadas pelo aplicativo automaticamente. O download pode ocorrer em segundo plano; o reinício necessita confirmação do gerente/administrador e caixas fechados.

## Segurança

- Publicação: GitHub Actions baixa somente o instalador produzido pelo mesmo commit aprovado no QA Windows 2022/2025, verifica SHA256, publica o NSIS **sem renomeá-lo** junto com o latest.yml gerado no mesmo build.
- Integridade: electron-updater verifica SHA512 dos arquivos do feed oficial sobre HTTPS. Instalação Authenticode está explicitamente desabilitada porque o produto não possui certificado de assinatura de código; não alegar que o binário é assinado. Antes de distribuição comercial ampla, considerar assinatura de código opcional.
- O updater não contém GH_TOKEN ou outros secrets nos clientes. Não altera OAuth, D1, cobrança ou parâmetros de licença.
- Atualização não garante recuperação automática em falha de energia durante o NSIS. O backup protege os dados canônicos e o instalador pode ser reaplicado se necessário.

## QA e Release

npm test
npm run build
npm run dist:win

O workflow QA valida funcionamento e instalador NSIS real, latest.yml e SHA512. Apenas workflow_run concluído com sucesso na main gera a release no GitHub com o mesmo SHA aprovado. Releases preexistentes são deixadas intactas para preservar a cadeia de atualização. Todas as versões futuras devem incrementar package.json#version.
