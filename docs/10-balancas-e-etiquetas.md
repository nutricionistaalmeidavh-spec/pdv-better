# Balanças e etiquetas — PDV Plus 0.5.0

O PDV Plus mantém as vendas e o SQLite locais. A integração de balanças opera sem contas, APIs externas ou serviços pagos.

## Leitura de etiquetas no caixa

1. Em Produtos, cadastre o item com unidade KG, preço por quilograma e código numérico correspondente ao PLU/identificador da balança.
2. Em Configurações > Periféricos > Balanças e etiquetas, escolha o perfil EAN-13 impresso pelo equipamento e salve.
3. Pese o produto e imprima a etiqueta na balança.
4. No Caixa, leia a etiqueta com scanner USB configurado para enviar Enter; o PDV identifica o produto, peso e valor.
5. Se a etiqueta codificar somente o preço, o peso será calculado em gramas a partir do preço por KG. Por segurança, leituras que impliquem divergência de centavos são bloqueadas, nunca ajustadas silenciosamente.

Perfis: DEFAULT_PRICE (prefixo 2 + 5 dígitos de PLU + 6 de preço), DEFAULT_WEIGHT (prefixo 2 + 5 PLU + 6 de peso em gramas), EXTENDED_PRODUCT (prefixo 20 + 4 PLU + 6 de preço), legacy-brasil (prefixo 2 + 5 PLU + separador + 5 de preço).

O sistema valida dígito verificador EAN-13, rejeita produtos não cadastrados, por unidade ou inativos e não altera a preferência do perfil sem autorização de gerente.

## Leitura de peso diretamente

- TCP: configure IP privado e porta da balança. Formato ASCII estável ST,GS, 0.750kg é suportado.
- Serial COM/USB: selecione a porta, baud rate, protocolo Toledo/Filizola/genérico e comando ENQ, CR ou nenhum. O driver serialport é open source e empacotado no aplicativo.
- Na frente de caixa, selecione um produto KG e use Ler balança para receber a pesagem.
- Leituras negativas, instáveis, com excesso de dados ou sem resposta geram erro. Não são registradas vendas sem peso estável.

## Carga de produtos para balanças etiquetadoras

Em Configurações > Periféricos, exporte localmente os arquivos:
- Toledo: ITENSMGV.TXT
- Urano: PRODUTOS.TXT

São elegíveis produtos ativos, unidades KG/UN e códigos numéricos de 1 a 6 dígitos. A exportação nunca altera o catálogo nem envia dados automaticamente ao equipamento.

## Compatibilidade com Ramuza

A marca, isoladamente, não garante compatibilidade. Para identificar o perfil e validar o funcionamento com Ramuza ou qualquer outro fabricante, conferir:
- modelo e revisão da balança;
- foto de etiqueta completa, com 13 dígitos legíveis e preço/peso impressos;
- protocolo/interface disponíveis (serial, USB, TCP);
- configuração de prefixo, PLU e conteúdo do código de barras.

Etiquetadoras EAN-13 compatíveis podem funcionar pelo leitor USB mesmo sem conexão direta à balança. A comunicação física serial e TCP exige homologação por modelo real. Não anuncie Ramuza homologada sem teste físico.

## Testes e instalador

npm test executa a suíte de domínio incluindo tests/scale-integration.test.mjs.
npm run build compila frontend e bridge Electron.
npm run dist:win gera instalador NSIS 64 bits para Windows 10/11 em release/.

O GitHub Actions em .github/workflows/qa.yml gera instalador, SHA-256 e testa o binário instalado em Windows 2022 e 2025. O instalador deve ser entregue somente quando os gates de QA estiverem verdes. Não altera secrets, variáveis, licenciamento ou esquemas SQLite.
