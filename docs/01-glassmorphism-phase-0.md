# Fase 0 — Auditoria e plano Glassmorphism (2026-10-28)

## Escopo
Unificar os dois conceitos aprovados: frente de caixa com catálogo/carrinho e tela de pagamento translúcida. Windows 10/11, Electron, offline-first, núcleo R$ 0, open source/self-hosted. Não alterar contratos canônicos silenciosamente.

## Evidências no código (main)
- package.json: React 19, Vite 6, Electron 39, lucide-react, NSIS; scripts `test`, `build`, `check`, `dist:win`.
- src/App.tsx: navegação, catálogo, busca por nome/código, leitura HID Enter, carrinho em estado React, F2, quantidades e total.
- src/styles.css: estilos centralizados; body min-width:880px, shell/sidebar/painéis. Electron: janela inicial 1440×900, mínima 1024×660.
- shared/contract.mjs: entidades e canais IPC canônicos. Não há entidades de vendas ou pagamentos.
- shared/domain.mjs: addToCart, lineTotalCents, cartTotalCents, money; centavos e quantidades em milésimos.
- electron/db.mjs: SQLite local com versionamento PRAGMA user_version, cadastros, índices, soft delete; sem tabelas de venda/pagamento.
- electron/main.cjs: IPC restrito e armazenamento em userData; contextIsolation, sandbox, nodeIntegration:false.
- README.md e docs/00-canonical.md: Marco A é prévia de carrinho; não persiste vendas, não cobra, não baixa estoque, não emite documentos fiscais.

## Mapa de proveniência (candidatos, não incorporados)
| Recurso | Origem candidata | Decisão |
|---|---|---|
| GlassPanel / GlassCard / GlassInput / GlassModal | https://github.com/xvhuan/frostglass | Verificar código, licença, dependências e API antes de incorporar; preferir portar apenas CSS/componentes necessários |
| GlassSidebar e GlassButton | https://github.com/akilakeshara/zentak-glass-ui | Avaliar licença e compatibilidade React 19; sem adicionar stack paralela |
| Tokens glass | https://github.com/rampstackco/glassmorphism-theme | Adaptar tokens em CSS nativo, não exigir Tailwind |
| Contraste, fallback, reduced transparency | https://github.com/moekoelueker/open-glass-ui | Usar como referência após verificar implementação |
| Ícones | lucide-react (já instalado) | Reutilizar |
| Produtos, carrinho, cálculos, SQLite e IPC | Código canônico deste repositório | Reutilizar e evoluir |

Não presumir que repositórios externos são compatíveis ou licenciados até inspeção específica; manter inventário de licenças/atribuições.

## Lacunas
1. Persistência transacional de vendas, itens e pagamentos; migração SQLite e testes.
2. Estados de venda e pagamento, idempotência, cancelamento, recuperação e baixa de estoque.
3. Filtro de categorias no catálogo, grade responsiva e imagens opcionais de produto (sem imagens inventadas).
4. Dinheiro/troco, crédito/débito como registros manuais claramente identificados; não afirmar processamento por adquirente.
5. PIX real requer integração opcional configurada; QR de demonstração nunca pode parecer cobrança válida.
6. Comprovante e fiscalidade fora do escopo das fases 1–3, salvo preparação de contratos.

## Roadmap revisado
### Fase 1 — Design system Glass
- Conferir licenças e código das fontes candidatas; registrar atribuições.
- Criar tokens CSS canônicos, GlassPanel/Button/Input/Modal/Sidebar.
- Adaptar shell, acessibilidade, foco, transparência reduzida e desempenho Electron.
- Aceite: telas atuais intactas e checks existentes passando.

### Fase 2 — Frente de caixa
- Catálogo em grade e filtro por categorias derivado de dados canônicos.
- Busca nome/SKU/HID, carrinho e quantidades UN/KG com cálculos do domínio.
- Transição visual para pagamento sem perda do rascunho; não anunciar venda concluída.
- Aceite: operações de carrinho e regressão de cadastros testadas.

### Fase 3 — Motor de venda e pagamentos
- Expandir contrato, domínio, migrações SQLite e IPC restrito.
- Venda atômica/idempotente, itens, estoque, estados e cancelamentos.
- Dinheiro/troco e registros manuais crédito/débito; PIX real apenas via adaptador opt-in e configuração explícita.
- Tela Glass de pagamento, estados pendente/falha/sucesso e testes de recuperação.
- Aceite: venda persistida sem duplicação; sem dependência paga obrigatória.

## QA e entrega
- Branch de trabalho, PR e GitHub Actions; não alterar main sem autorização explícita.
- npm run check, testes de migração e regressão, validação visual desktop e desempenho.
- Não afirmar QA executado até haver execução registrada; hardware real Windows e periféricos exigem homologação separada.
