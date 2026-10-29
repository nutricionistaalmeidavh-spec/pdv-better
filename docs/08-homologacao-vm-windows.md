# Homologação automatizada em máquinas virtuais Windows (2022 e 2025)

## Executar

A cada PR e push na main, o workflow [virtual-windows-lab.yml](../.github/workflows/virtual-windows-lab.yml) inicia duas máquinas virtuais temporárias do GitHub Actions (Windows 2022 e 2025). Também pode ser iniciado manualmente em **Actions > Laboratório virtual — falhas de hardware e SQLite > Run workflow**.

Não é necessária máquina própria, periféricos físicos, licença de VM ou serviço pago obrigatório. O uso de minutos do GitHub Actions está sujeito aos limites do plano do repositório.

Para reproduzir em uma máquina Windows com Node 22 instalado:
```powershell
./scripts/ci-install.ps1
npm run build
node scripts/qa-vm-fault-lab.mjs
node --test tests/virtual-lab-devices.test.mjs
node scripts/qa-batch-scanner-e2e.mjs
```

## Cenários e o que provam

| Identificador | Componente real exercitado | Injeção/falha | Evidência esperada |
| --- | --- | --- | --- |
| VM-DB-01 | processo Node + SQLite WAL no disco Windows | encerrar processo sem COMMIT | estoque e movimentos anteriores intactos; abertura e gravação posteriores OK |
| VM-DB-02 | processo Node + transação de checkout | encerrar processo após COMMIT | uma única venda, saldo e faturamento corretos ao reabrir |
| VM-DB-03 | SQLite em arquivo real | PRAGMA max_page_count e inserção que provoca SQLITE_FULL | operação inteira revertida, quick_check OK e escrita posterior OK |
| VM-DB-04 | backup e restauração do PDV | corromper a cópia staging após agendamento | banco original preservado; restauração rejeitada |
| VM-PRN-01 | sendTcp e gerador ESC/POS | servidor TCP loopback captura bytes enviados | conteúdo, corte e ausência de comando automático de gaveta conferidos |
| VM-PRN-02 | fila local de impressão | servidor TCP indisponível; reinício lógico da fila | tentativa retida em arquivo e reenvio explícito bem sucedido |
| VM-SCL-01 | readScale e parser de balança | balança virtual estável, instável e silenciosa | 350g aceitos, instabilidade e timeout rejeitados |
| VM-HID | UI Electron/React, scanner e SQLite reais | entrada HID simulada por teclado de etiqueta Code128 | seleção de lote certo, promoção/kit e venda persistida |

## Evidências

Cada VM publica o artifact `VM-Windows-Lab-windows-2022` ou `VM-Windows-Lab-windows-2025`. Os arquivos `qa-artifacts/virtual-windows-lab/results-win32.json` e `REPORT-win32.md` incluem data, sistema, commit, duração, resultados e limites explicitamente declarados. Falhas interrompem o job, e os artifacts são publicados mesmo quando um teste falha.

## Limites rigorosos

- Os executáveis estão rodando numa VM Windows real, mas **impressora, scanner e balança são simulados**. O TCP real e os bytes ESC/POS são testados; não é certificado que uma impressora de um modelo específico produza papel.
- SQLite `max_page_count` gera falta de espaço real dentro do limite lógico do SQLite, **não** falha física do SSD nem esgotamento completo do volume NTFS.
- O encerramento do processo filho é real, mas não substitui uma queda de energia do host ou um desligamento abrupto de toda a VM.
- Leitor HID via Playwright reproduz a sequência digitada, não certifica firmware nem drivers USB.
- Balanças seriais COM/RS232 não são cobertas porque o produto atualmente integra leitura TCP; não afirmar que um teste TCP valida uma porta COM.
- Documentos impressos continuam não fiscais. Uma homologação NFC-e ou SAT depende da legislação e infraestrutura fiscais e está fora do laboratório virtual.

## Critério de aprovação

Ambos os jobs do workflow virtual e os jobs regulares de QA devem terminar com status **success** no mesmo commit antes do merge. Nenhuma evidência ou aprovação é fabricada. A proteção administrativa da branch main, caso necessária, precisa ser configurada separadamente na interface do GitHub.
