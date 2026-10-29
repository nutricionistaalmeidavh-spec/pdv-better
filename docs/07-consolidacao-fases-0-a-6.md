# Consolidação de fases 0–6 — PDV Plus

## Base comprovada
- As PRs #15, #16, #17, #18 e #19 foram mescladas à main após as cinco verificações Windows.
- Esta alteração (#20) cobre os próximos requisitos, com TDD, reabertura de SQLite v9 e revisão de QA.
- Não toca em licenciamento ou telemetria. Operação principal local ou por servidor LAN do comércio.
- Não há dependências obrigatórias de APIs externas pagas.

## P0 — banco e recuperação
- SQLite com WAL, timeout, erro explícito de lock/dados corrompidos e quick_check na abertura.
- Backup SQLite consistente, restauração versionada com arquivo anterior retido, proteção contra staging órfão.
- Migrações de schema até v9, aditivas e idempotentes. A abertura de schema mais recente é recusada.
- Testes em banco SQLite real: concorrência, escrita interrompida por lock, corrupção, restauração e versionamento.
- **Pendente de certificação de ambiente:** interrupção forçada do processo no meio do COMMIT e simulação integral de disco cheio em Windows, com evidência; testes de mensagem de SQLITE_FULL já existem. Não inferir certificação física.

## P0–P1 — caixa, descontos e pagamentos
- Pagamentos mistos, troco, fiado, desconto, cancelamento, idempotência; dupla conciliação por item e por forma de pagamento.
- Modo de treinamento restrito a Gerente/Administrador não movimenta estoque/lotes, caixa, recebíveis nem faturamento.
- Simulações permanecem auditáveis e distinguíveis no histórico, relatórios, exportações e recibo; reverter simulação não cria estorno real.

## P1 — catálogo e estoque
- Catálogo CRUD, importação CSV transacional com pré-visualização e códigos únicos, variantes individuais com SKU, fabricante/produtor, FEFO, baixa por lote físico e etiquetas Code128.
- Pesagem em KG manual em milésimos; leitura de balança TCP.
- Promoções por SKU e kits entre SKUs, desconto automático em centavos.
- Alertas de produtos sem estoque, baixo estoque, lotes vencidos ou a vencer em 30 dias.
- Equipamentos não usados pelo QA podem demandar homologação de protocolo/driver em loja.

## P1–P2 — histórico e relatórios
- Filtros por período, SKU, marca, produtor, família de variantes, operador e venda de treinamento.
- Comparativo entre dois intervalos com total comercial em centavos, delta absoluto e variação em pontos base.
- Exportações por item XLSX, CSV e HTML do PDF processadas em Worker Thread local, com limite de execução e isolamento do processo principal; render final do PDF pelo Chromium no Electron.
- Dados históricos da venda preservam marca/produtor/variante vigentes na época. Pagamento misto sem atribuição permanece sinalizado, nunca inventado.

## P0/P1 — impressão, UX e segurança
- Fila JSON local de impressão com gravação por arquivo temporário e rename, falhas sem perda do histórico e reenvio manual; nunca marcar sucesso silenciosamente.
- **Importante:** uma falha depois do envio pode produzir segunda via física. O reenvio exige confirmação explícita do operador. Não existe garantia universal de exatamente uma cópia com hardware não transacional.
- Perfis backend/IPC/LAN validados, Graphite Glass preservado, modos alto contraste e movimento reduzido, tabelas com rolagem horizontal em zoom.
- No protocolo LAN local HTTP **não há criptografia em trânsito**: o uso deve permanecer em rede interna confiável ou VPN, nunca publicado na internet.

## P0 — regressão e release
- Workflow em pull requests e push na main: testes de domínio, Windows 2022/2025, smoke real, NSIS instalado e checksums, fluxos F01–F54, E01–E12, J01–J07, scanner HID simulado, PDF de todas as telas.
- Script de instalação com retentativas limitadas para falhas transitórias externas (npm/Electron) sem converter erros em sucesso.
- Workflow manual alternativo para runner Windows X64 self-hosted. O estabelecimento não é obrigado a contratar serviço pago.
- **Proteção de branch / checks obrigatórios:** exige configurar em GitHub Settings > Rules > Rulesets (ou Branches) para main, exigir revisão e os checks do workflow QA. Não há evidência de configuração ativada pela interface administrativa nesta implementação. Evitar alegar bloqueio obrigatório de merge por política até confirmar essa configuração.

## Homologação/pendências fora do software
- Homologação de impressora térmica, Code128, balança e leitor HID em cada modelo real, emissão de cupom fiscal (fora de escopo), compatibilidade de balanças seriais COM que não exponham TCP, recuperação de desligamento abrupto em sistema físico e acessibilidade com usuários reais.
- O ambiente de CI automatizado **não substitui homologação de hardware** ou auditoria fiscal.
