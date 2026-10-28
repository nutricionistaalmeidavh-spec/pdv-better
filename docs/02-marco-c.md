# Marco C — Fases 07–10 (Windows 10/11 x64)

## Fontes de verdade
- SQLite do computador servidor: único banco de vendas, estoque, caixa, produtos e finanças.
- shared/contract.mjs: canais IPC; shared/peripherals.mjs: protocolo de dispositivos; electron/lan.mjs: RPC permitida; electron/backup.mjs: cópia e restauração.
- Dispositivos configurados por estação não duplicam os dados comerciais.

## 07 — Periféricos
- Leitor USB/HID como teclado no campo de código de barras existente.
- Impressoras instaladas no Windows via Electron getPrintersAsync e print.
- Impressora ESC/POS Ethernet via IP privado e porta TCP: comprovante não fiscal com corte. Comandos em ASCII para compatibilidade básica.
- Gaveta por pulso ESC/POS explícito; requer conexão física à impressora de rede.
- Balança TCP com leitura estável ASCII ST,GS,0.750kg e quantidade KG aplicada ao carrinho.
- Etiqueta com nome, SKU e preço pela fila de impressão do Windows.
- Não há integração de balança serial COM/RS-232, drivers proprietários ou TEF; os testes TCP usam simuladores, sem homologação física.

## 08 — LAN com banco central
1. No servidor: Dispositivos e rede → Ativar servidor LAN. Anote endereço IPv4 e chave.
2. No Firewall do Windows, permita a porta escolhida apenas em rede privada.
3. No terminal auxiliar: Conectar terminal e informar endereço e chave.
4. Todo cadastro/venda/caixa usa transações do SQLite do servidor, sem réplica local.
5. Sem servidor, o terminal falha com erro visível. Não continua vendendo em outro banco automaticamente.
6. Chave local de 32 bytes criptografada por safeStorage. HTTP LAN autenticado mas NÃO CIFRADO; não publicar na internet, usar rede confiável ou VPN privada.
7. Há um turno de caixa aberto por banco, herdado do Marco B; turnos simultâneos por terminal ainda não implementados.
8. Sem Cloudflare ou internet obrigatórios.

## 09 — Backup e QA
- Cópia SQLite online consistente com WAL, validação de quick_check, schema e versão.
- Restauração somente servidor/local com caixa fechado e confirmação; staging + reinício; arquivo original permanece em .pre-restore-....sqlite.
- Backups não mesclam bases e não dependem de serviço externo.
- Testes: LAN autenticada e chamada rejeitada, duas requisições simultâneas da mesma venda, TCP simulado, ESC/POS, balança, backup, restauração e retenção anterior.
- E2E e pacote NSIS nos runners Windows Server 2022/2025. Runners não homologam periféricos físicos, todos os Windows 10/11 ou firewall de uma loja real.

## 10 — Empacotamento
- npm run dist:win gera instalador Windows x64 NSIS.
- GitHub Actions testa domínio, build, Electron real, EXE instalado e inclui SHA256SUMS.txt.
- Instalador não assinado digitalmente. Atualização manual por nova versão; atualização automática não foi habilitada sem validação.
- Não usar AppDeploy; não distribuir Windows 7/8.

## Aceite
Marco B preservado, fonte de verdade única, segurança LAN por opt-in, backup íntegro sem perda silenciosa de dados, todos os jobs Windows verdes antes do merge.
