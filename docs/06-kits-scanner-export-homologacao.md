# Kits multisku, etiquetas físicas e relatórios exportáveis — versão v6

## Operação de kits entre SKUs

O gerente pode cadastrar um kit contendo de 2 até 8 SKUs distintos pelo domínio local (a interface inicial apresenta o formulário com 2 SKUs). Cada componente usa quantidade explícita em milésimos. O preço do kit é sempre positivo e não supera o valor individual agregado da composição. A mesma regra pode ser aplicada repetidamente à mesma venda.

Quando há concorrência entre descontos por SKU e um kit entre SKUs, o PDV calcula a melhor combinação entre **um tipo de kit por venda**, repetível, e as promoções individuais aplicáveis aos itens restantes. Não acumula dois tipos de kit distintos nem cobra acima do preço com promoções individuais. Desconto total e por linha são registrados em centavos; o checkout reavalia a cotação na transação SQLite.

Não se trata de engine de campanhas ilimitadas entre diferentes kits: a possibilidade de empilhar tipos distintos permanece fora do contrato inicial para evitar uso duplicado de estoque.

## Leitura de etiquetas físicas

- Padrão de identificação: Code 128 com payload PDVLOT1|SKU|LOTE (componentes URI-encoded quando necessário).
- Imprimir **Imprimir lote** no módulo de estoque, usando uma impressora instalada no Windows. A geração é 100% local com bwip-js, biblioteca MIT. A etiqueta exibe código, nome do produto, lote e validade.
- Conectar leitor USB/HID configurado como teclado com sufixo Enter, focar o campo de leitura da Frente de caixa e ler a etiqueta.
- O sistema interpreta o prefixo, consulta os lotes atualizados via bridge autenticada e vincula o lote exato à linha do carrinho.
- O lote selecionado acompanha o rascunho e é enviado tanto para cotação quanto para confirmação; o backend bloqueia venda de lote errado, vencido ou sem saldo.
- Uma venda aceita somente um lote físico por SKU. Para dois lotes distintos do mesmo SKU, a operação precisa ser dividida, por segurança e rastreabilidade.
- O scanner HID de produto comum continua funcionando normalmente para códigos que não tenham o prefixo PDVLOT1.

## Exportações de itens

Em Relatórios > Relatório detalhado por item, selecionar período e SKU; clicar Exportar itens CSV, XLSX ou PDF. Os formatos usam **a mesma fonte canônica** reportItems filtrada por período/produto. Valores são expostos em centavos inteiros, conforme títulos das colunas, sem arredondamentos ocultos. Pagamento misto não é falsamente atribuído por linha. CSV inclui BOM UTF-8, delimitador ponto e vírgula e prevenção de injeção de fórmulas; PDF escapa HTML; XLSX preserva valores numéricos para cálculos.

## Protocolo de homologação física (pendente até equipamento real)

| Etapa | Dispositivo / cenário | Critério |
|---|---|---|
| H01 | Impressora instalada no Windows 10 e 11 | Etiqueta Code128 impressa, sem corte indevido, legível em tamanho real |
| H02 | Leitor USB/HID Code128 | Leitura no campo de frente de caixa, sufixo Enter, código e lote reconhecidos |
| H03 | Lotes A e B do mesmo SKU | Etiqueta de B utiliza B mesmo se A vence antes |
| H04 | Lote vencido, sem saldo ou falso | Venda bloqueada; não usar outro lote silenciosamente |
| H05 | Kit 2 SKUs com pagamento misto | Valor faturado equivale à cotação e descontos conciliam por item |
| H06 | Balança TCP e impressora térmica existente | Não regressão dos fluxos F01–F54/E01–E12 |
| H07 | Exportações CSV/XLSX/PDF | Abrir os três arquivos em aplicativos reais; conferir caracteres e valores |
| H08 | Offline/reinicialização | Sem conexão externa, venda, leitura e exportação permanecem locais |

**Critério**: aprovação H01–H08 requer registro de equipamento, firmware/driver, sistema operacional, impressão de etiqueta real, leitura física, operador e evidências. CI GitHub Actions com scanner HID simulado **não constitui homologação de hardware real**.

## QA e distribuição

- node --test tests/nexus-cross-sku.test.mjs tests/nexus-batch-label-scanner.test.mjs tests/nexus-label-printed.test.mjs tests/nexus-item-export.test.mjs
- npm test
- npm run build
- node scripts/qa-batch-scanner-e2e.mjs (Windows com Electron; incluído no workflow QA)
- npm run test:desktop, jornadas e NSIS instalado no pipeline Windows.

**Escopo excluído:** telemetria, licença, serviços obrigatórios pagos, emissão fiscal e testes em Windows 7/8. O núcleo permanece open source e self-hosted.
