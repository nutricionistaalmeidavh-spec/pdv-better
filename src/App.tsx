import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard, ShoppingCart, Package, Tags, Users, Truck, UserRoundCog,
  Search, Plus, Pencil, Archive, X, Check, AlertTriangle, Database, RotateCcw,
  ChevronRight, Minus, Settings, ShieldCheck, ArrowRight, Trash2, Keyboard,
  Wallet, ClipboardList, BarChart3, Boxes, ReceiptText
} from 'lucide-react';
import { entities, entityOrder } from '../shared/contract.mjs';
import { addToCart, cartTotalCents, lineTotalCents, money, parseFixed } from '../shared/domain.mjs';
import { filterCheckoutProducts } from '../shared/catalog.mjs';
import { resolveBatchScan,parseBatchLabel } from '../shared/batch-label.mjs';
import {applyManualWeight} from '../shared/manual-weight.mjs';
import { CommerceView, PaymentModal } from './Commerce';
import { SaleReceipt } from './Receipt';
import { SystemSettings } from './SystemSettings';
import {allowed} from '../shared/access.mjs';

type Row = Record<string, any>;
type CartItem = {id:string;name:string;code:string;unit:string;priceCents:number;quantityMilli:number;batchId?:string;batchCode?:string};
const definitions: Record<string, any> = entities;
const icons: Record<string, any> = {
  dashboard: LayoutDashboard, checkout: ShoppingCart, products: Package, categories: Tags,
  customers: Users, suppliers: Truck, operators: UserRoundCog,
  cash: Wallet, sales: ReceiptText, inventory: Boxes, finance: ClipboardList, reports: BarChart3, settings: Settings
};
const menus = [
  {title:'OPERAÇÃO', ids:['dashboard','checkout','cash','sales']},
  {title:'GESTÃO', ids:['inventory','finance','reports']},
  {title:'CADASTROS', ids:entityOrder},
  {title:'SISTEMA', ids:['settings']}
];
const titles: Record<string,string> = {dashboard:'Visão geral',checkout:'Frente de caixa',cash:'Controle de caixa',sales:'Vendas',inventory:'Estoque',finance:'Financeiro',reports:'Relatórios',settings:'Dispositivos e rede'};
const formatValue = (field:any, value:any):string => {
  if (value === null || value === undefined) return '';
  if (field.type === 'money') return (Number(value)/100).toFixed(2);
  if (field.type === 'quantity') return (Number(value)/1000).toFixed(3);
  return String(value);
};
const newForm = (kind:string) => Object.fromEntries(
  definitions[kind].fields.map((field:any) => [field.key,
    field.type === 'money' ? '0.00' : field.type === 'quantity' ? '0.000' : (field.default ?? '')
  ])
);
function friendlyError(error:any) {
  return String(error?.message || error || 'Erro desconhecido').replace(/^Error invoking remote method.*?: Error: /, '');
}
export function App({user,onLogout}:{user:{id:string;name:string;role:string};onLogout:()=>Promise<void>}) {
  const [view,setView] = useState('dashboard');
  const [records,setRecords] = useState<Record<string, Row[]>>({});
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [search,setSearch] = useState('');
  const [page,setPage] = useState(0);
  const [editing,setEditing] = useState<Row|null>(null);
  const [form,setForm] = useState<Row>({});
  const [saving,setSaving] = useState(false);
  const [importingCsv,setImportingCsv] = useState(false);
  const [cart,setCart] = useState<CartItem[]>(() => {
    try {
      const saved=JSON.parse(localStorage.getItem('pdv-better:draft-v1:'+user.id)||'[]');
      return Array.isArray(saved)?saved.filter(x=>typeof x.id==='string'&&Number.isSafeInteger(x.quantityMilli)&&x.quantityMilli>0&&Number.isSafeInteger(x.priceCents)&&x.priceCents>=0):[];
    } catch{return [];}
  });
  const [cartSearch,setCartSearch] = useState('');
  const [categoryFilter,setCategoryFilter] = useState('all');
  const [cartError,setCartError] = useState('');
  const [scanningBatch,setScanningBatch] = useState(false);
  const [session,setSession] = useState<Row|null>(null);
  const [paymentOpen,setPaymentOpen] = useState(false);
  const [receipt,setReceipt] = useState<Row|null>(null);
  const [readingScale,setReadingScale] = useState(false);
  const [manualWeight,setManualWeight] = useState<Record<string,string>>({});
  const [passwordTarget,setPasswordTarget] = useState<Row|null>(null);
  const [operatorPassword,setOperatorPassword] = useState('');
  const [repeatPassword,setRepeatPassword] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const activeSchema = definitions[view];
  const bridge = window.pdv;
  async function reloadAll() {
    if (!bridge) { setError('O banco local está disponível somente no aplicativo Electron. Abra pelo instalador ou npm run dev.'); setLoading(false); return; }
    try {
      const accessible = entityOrder.filter(kind=>allowed(user.role,'list',[kind]));
      const data = await Promise.all(accessible.map((kind:string) => bridge.list(kind)));
      setRecords(Object.fromEntries(accessible.map((kind:string,i:number) => [kind,data[i]])));
      setError('');
    } catch (err) { setError('Não foi possível carregar o banco: ' + friendlyError(err)); }
    finally { setLoading(false); }
  }
  async function reload(kind:string) {
    if (!bridge) return;
    const current = await bridge.list(kind);
    setRecords(prev => ({...prev,[kind]:current}));
  }
  useEffect(() => { void reloadAll(); }, []);
  useEffect(()=>{
    try{if(cart.length)localStorage.setItem('pdv-better:draft-v1:'+user.id,JSON.stringify(cart));else localStorage.removeItem('pdv-better:draft-v1:'+user.id);}
    catch{/* A ausência de armazenamento temporário não impede uma venda */ }
  },[cart]);
  useEffect(() => { setSearch(''); setPage(0); setNotice(''); setError(''); }, [view]);
  useEffect(() => { if(view==='checkout' && bridge) void bridge.sessionCurrent().then(setSession).catch(err=>setCartError(friendlyError(err))); }, [view]);
  useEffect(() => {
    if (view === 'checkout') searchInput.current?.focus();
  }, [view]);
  useEffect(() => {
    const onKey = (ev:KeyboardEvent) => {
      if (ev.key === 'Escape' && editing) setEditing(null);
      if (ev.key === 'F2' && !editing) { ev.preventDefault(); setView('checkout'); searchInput.current?.focus(); }
    };
    window.addEventListener('keydown',onKey);
    return () => window.removeEventListener('keydown',onKey);
  }, [editing]);
  const rows:Row[] = records[view] || [];
  const filteredRows = useMemo(() => rows.filter(row =>
    !search || Object.values(row).some(value => String(value??'').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
  ),[rows,search]);
  const pageSize = 75;
  const pageCount = Math.max(1,Math.ceil(filteredRows.length/pageSize));
  const pageRows = filteredRows.slice(page*pageSize,(page+1)*pageSize);
  const products:Row[] = records.products || [];
  const categories:Row[] = records.categories || [];
  const matchingProducts = useMemo(()=>filterCheckoutProducts(products,categoryFilter,cartSearch),[products,categoryFilter,cartSearch]);
  const total = cartTotalCents(cart);
  function startForm(row?:Row) {
    const base = row ? Object.fromEntries(definitions[view].fields.map((field:any) => [field.key,formatValue(field,row[field.key])])) : newForm(view);
    setForm({...base,...(row ? {id:row.id} : {})});
    setEditing(row || {});
    setError('');
  }
  async function saveRecord(ev:React.FormEvent) {
    ev.preventDefault();
    if (!bridge || saving) return;
    setSaving(true); setError('');
    try {
      const saved = await bridge.save(view, form);
      await reload(view);
      if (view === 'products') setCart(prev => prev.map(item => item.id === saved.id ? {...item, name:saved.name, code:saved.code || '', priceCents:saved.sale_price_cents, unit:saved.unit, quantityMilli:saved.unit === 'UN' && item.quantityMilli % 1000 !== 0 ? 1000 : item.quantityMilli} : item));
      setEditing(null); setNotice(definitions[view].singular + ' salvo: ' + saved.name);
    } catch (err) { setError('Não foi possível salvar. ' + friendlyError(err)); }
    finally { setSaving(false); }
  }
  async function importProductsCsv(event:React.ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value='';
    if(!bridge||!file||importingCsv)return;
    setImportingCsv(true);setError('');setNotice('');
    try{
      if(file.size>120000)throw new Error('CSV excede o limite de 120 KB. Divida em arquivos menores.');
      const csv=await file.text();
      const preview=await bridge.catalogCsvPreview({csv});
      if(!window.confirm('Importar '+preview.count+' produtos no SQLite?\n'+
        preview.rows.slice(0,5).map((r:Row)=>r.code+' · '+r.name).join('\n')+
        '\nTodos os produtos serão gravados juntos; erros cancelam toda a importação.'))return;
      const result=await bridge.catalogCsvImport({csv});
      await reload('products');
      setNotice(result.imported+' produtos importados de forma transacional.');
    }catch(err){setError('Falha na importação CSV. '+friendlyError(err));}
    finally{setImportingCsv(false);}
  }
  async function archiveRecord(row:Row) {
    if (!bridge || !window.confirm('Desativar ' + row.name + '? O cadastro ficará oculto, sem exclusão permanente.')) return;
    setError(''); setNotice('');
    try { await bridge.archive(view,row.id); await reload(view); if(view === 'products') setCart(prev => prev.filter(item => item.id !== row.id)); setNotice(row.name + ' foi desativado.'); }
    catch(err) { setError('Não foi possível desativar. ' + friendlyError(err)); }
  }
  function addProduct(row:Row) {
    try { setCart(addToCart(cart,row,1000)); setCartError(''); setCartSearch(''); searchInput.current?.focus(); }
    catch(err) { setCartError(friendlyError(err)); }
  }
  function changeQuantity(item:CartItem,delta:number) {
    const quantity = item.quantityMilli + delta;
    if (quantity <= 0) { setCart(prev => prev.filter(line => line.id !== item.id)); return; }
    try {
      lineTotalCents(item.priceCents,quantity);
      setCart(prev => prev.map(line => line.id === item.id ? {...line,quantityMilli:quantity} : line));
      setCartError('');
    } catch(err) { setCartError(friendlyError(err)); }
  }
  function scanKey(ev:React.KeyboardEvent<HTMLInputElement>) {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const raw=cartSearch.trim();
    try {
      if(parseBatchLabel(raw)){
        if(scanningBatch||!bridge)return;
        setScanningBatch(true);
        void bridge.batchesList().then(list=>{
          const scanned=resolveBatchScan(raw,products,list);
          if(!scanned)return;
          const existing=cart.find(row=>row.id===scanned.product.id);
          if(existing && existing.batchId!==scanned.batch.id)
            throw new Error('Este produto já está no carrinho com outro lote ou sem lote. Remova a linha e leia a etiqueta novamente.');
          const updated=addToCart(cart,scanned.product,1000);
          setCart(updated.map(row=>row.id===scanned.product.id
            ? {...row,batchId:scanned.batch.id,batchCode:scanned.batch.code}:row));
          setCartError('');setCartSearch('');searchInput.current?.focus();
        }).catch(err=>setCartError(friendlyError(err))).finally(()=>setScanningBatch(false));
        return;
      }
    }catch(err){setCartError(friendlyError(err));return;}
    const code = raw.toUpperCase();
    const found = products.find(p => p.code === code) || (matchingProducts.length === 1 ? matchingProducts[0] : null);
    if (found) addProduct(found);
    else setCartError('Selecione um produto na lista ou confira o código.');
  }
  function selectView(next:string) { if(view==='settings')void reloadAll(); setView(next); setEditing(null); setPaymentOpen(false); setCartError(''); }
  async function weighItem(item:CartItem) {
    if(!bridge || readingScale)return;
    setReadingScale(true);setCartError('');
    try {
      const milli=await bridge.scaleRead();
      if(!Number.isSafeInteger(milli)||milli<=0)throw new Error('Peso inválido da balança.');
      lineTotalCents(item.priceCents,milli);
      setCart(old=>old.map(line=>line.id===item.id?{...line,quantityMilli:milli}:line));
    }catch(err){setCartError(friendlyError(err));}
    finally{setReadingScale(false);}
  }
  async function completeSale(sale:Row) {
    setPaymentOpen(false);setCart([]);setReceipt(sale);
    try {await reload('products');if(bridge)setSession(await bridge.sessionCurrent());}catch(err){setCartError(friendlyError(err));}
    setNotice('Venda '+sale.id.slice(0,8)+' concluída, total '+money(sale.total_cents)+'. Troco: '+money(sale.change_cents)+'. Comprovante não fiscal.');
  }

  const canVisit=(id:string)=>{
    if(id==='dashboard'||id==='checkout'||id==='cash'||id==='sales')return true;
    if(id==='settings'||id==='operators')return user.role==='Administrador';
    if(entityOrder.includes(id))return allowed(user.role,'list',[id]);
    return user.role!=='Caixa';
  };
  async function setAccess(ev:React.FormEvent){
    ev.preventDefault();if(!bridge||!passwordTarget)return;
    setError('');
    if(operatorPassword!==repeatPassword){setError('As senhas não conferem.');return;}
    try{
      await bridge.authSetPassword({operatorId:passwordTarget.id,password:operatorPassword});
      setNotice('Senha de '+passwordTarget.name+' definida. As sessões antigas desse operador foram encerradas.');
      setPasswordTarget(null);setOperatorPassword('');setRepeatPassword('');
    }catch(e){setError(friendlyError(e));}
  }
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Package size={21}/></div><div><strong>PDV Better</strong><span>by ArtiSys</span></div></div>
      <div className="workspace"><div className="workspace-avatar">PB</div><div><strong>Estabelecimento local</strong><span>Funcionamento offline • perfis e caixas independentes</span></div></div>
      <nav aria-label="Navegação principal">
        {menus.map(section => <div className="menu-section" key={section.title}>
          <div className="menu-title">{section.title}</div>
          {section.ids.filter(canVisit).map((id:string) => {
            const Icon = icons[id];
            return <button type="button" key={id} className={'nav-item '+(view === id ? 'selected' : '')} aria-current={view === id ? 'page' : undefined} onClick={() => selectView(id)}>
              <Icon size={18}/><span>{titles[id] || definitions[id]?.label}</span>{view === id && <ChevronRight size={16}/>}
            </button>;
          })}
        </div>)}
      </nav>
      <div className="sidebar-footer"><Database size={17}/><div><strong>SQLite local</strong><span>Sem serviços pagos</span></div><ShieldCheck size={17}/></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumbs"><span>PDV Better</span><ChevronRight size={16}/><strong>{titles[view] || definitions[view]?.label}</strong></div>
        <div className="top-actions"><span title="Operador autenticado">{user.name} · {user.role}</span><button className="secondary" onClick={()=>void onLogout()}>Sair</button><span className="status-pill"><span className="status-dot"/> {error && !editing ? 'Verificar banco' : 'Modo local'}</span><span className="version">Versão 0.4.0</span></div>
      </header>
      <section className="content">
        {notice && <div className="notice success" role="status"><Check size={17}/>{notice}<button aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={15}/></button></div>}
        {error && !editing && <div className="notice danger" role="alert"><AlertTriangle size={17}/>{error}<button onClick={() => {setLoading(true); void reloadAll();}}><RotateCcw size={15}/>Tentar novamente</button></div>}
        {loading ? <div className="loading">Carregando dados do estabelecimento…</div> : <>
          {view === 'dashboard' && <>
            <div className="page-heading"><div><div className="eyebrow">INÍCIO</div><h1>Bem-vindo ao PDV Better</h1><p>Seu comércio organizado em um único lugar, mesmo sem internet.</p></div><button className="primary" onClick={() => selectView('checkout')}><ShoppingCart size={17}/> Abrir frente de caixa</button></div>
            <div className="stat-grid">
              {entityOrder.slice(0,4).filter(kind=>canVisit(kind)).map((kind:string) => {
                const Icon = icons[kind];
                return <button className="stat" onClick={() => selectView(kind)} key={kind}><div className="stat-top"><span>{definitions[kind].label}</span><Icon size={20}/></div><strong>{(records[kind] || []).length}</strong><span className="stat-bottom">Cadastros ativos <ArrowRight size={14}/></span></button>;
              })}
            </div>
            <div className="section-title"><h2>Acesso rápido</h2><p>Comece pelas tarefas mais utilizadas.</p></div>
            <div className="quick-grid">
              <button className="quick" onClick={() => selectView('checkout')}><span className="quick-icon"><ShoppingCart size={21}/></span><strong>Preparar uma venda</strong><span>Buscar produtos e conferir total</span><ArrowRight size={17}/></button>
              <button className="quick" onClick={() => selectView('products')}><span className="quick-icon"><Package size={21}/></span><strong>Gerenciar produtos</strong><span>Preços, estoque inicial e códigos</span><ArrowRight size={17}/></button>
              <button className="quick" onClick={() => selectView('customers')}><span className="quick-icon"><Users size={21}/></span><strong>Clientes</strong><span>Consultar ou incluir um cadastro</span><ArrowRight size={17}/></button>
            </div>
            <div className="info-bar"><ShieldCheck size={20}/><div><strong>Marco A · Preparação operacional</strong><p>Cadastros, vendas, saldos de estoque e financeiro são registrados no SQLite local. Pix e cartão devem ser confirmados externamente antes da conclusão da venda.</p></div></div>
          </>}
          {view === 'checkout' && <>
            <div className="page-heading"><div><div className="eyebrow">OPERAÇÃO / F2</div><h1>Frente de caixa</h1><p>Busque produtos, revise quantidades e registre o pagamento no caixa aberto.</p></div><span className="draft-label">{session ? 'Caixa aberto' : 'Caixa fechado'}</span></div>
            <div className="checkout-grid">
              <div className="panel products-panel glass-panel">
                <div className="panel-header"><div><h2>Selecionar produtos</h2><p>Busque por nome, SKU ou código de barras</p></div><span className="count-chip">{matchingProducts.length} exibidos</span></div>
                <label className="search-field"><Search size={19}/><input ref={searchInput} autoComplete="off" disabled={scanningBatch} aria-label="Pesquisar ou ler código de barras" placeholder="Digite ou leia o código do produto…" value={cartSearch} onChange={ev => {setCartSearch(ev.target.value);setCartError('');}} onKeyDown={scanKey}/><span className="kbd">Enter</span></label>
                <div className="category-filter" aria-label="Filtrar produtos por categoria"><button type="button" className={categoryFilter==='all'?'active':''} aria-pressed={categoryFilter==='all'} onClick={()=>setCategoryFilter('all')}>Todos</button>{categories.map(c=><button type="button" key={c.id} className={categoryFilter===c.id?'active':''} aria-pressed={categoryFilter===c.id} onClick={()=>setCategoryFilter(c.id)}>{c.name}</button>)}</div>
                <div className="product-list glass-product-grid">
                  {matchingProducts.map(row => <button className="product-option" key={row.id} onClick={() => addProduct(row)}>
                    <div className="product-icon"><Package size={19}/></div><div className="product-info"><strong>{row.name}</strong><span>{row.code || 'Sem código'} · {row.unit} · Saldo {Number(row.stock_milli || 0)/1000}</span></div><strong className="product-price">{money(row.sale_price_cents)}</strong><Plus size={19} className="add-icon"/>
                  </button>)}
                  {!matchingProducts.length && <div className="empty-state"><Search size={25}/><strong>Nenhum produto encontrado</strong><p>Cadastre produtos ou tente outra pesquisa.</p><button className="secondary" onClick={() => selectView('products')}>Ir para produtos</button></div>}
                </div>
              </div>
              <div className="panel cart-panel glass-panel">
                <div className="panel-header"><div><h2>Rascunho da venda</h2><p>{cart.length} {cart.length === 1 ? 'produto' : 'produtos'} na seleção</p></div><ShoppingCart size={19}/></div>
                {cartError && <div className="cart-error" role="alert">{cartError}</div>}
                <div className="cart-lines">
                  {cart.length === 0 ? <div className="empty-cart"><ShoppingCart size={32}/><strong>Seu carrinho está vazio</strong><p>Selecione um produto para começar.</p></div> :
                    cart.map(line => <div className="cart-line" key={line.id}><div className="cart-line-top"><div><strong>{line.name}</strong><span>{money(line.priceCents)} / {line.unit}{line.batchId?' · Lote físico '+(line.batchCode||line.batchId.slice(0,8)):''}</span></div><button className="icon-btn" title="Remover do carrinho" aria-label={'Remover '+line.name} onClick={() => setCart(old => old.filter(item => item.id !== line.id))}><X size={17}/></button></div>
                      <div className="cart-line-bottom"><div className="stepper"><button aria-label={'Diminuir '+line.name} onClick={() => changeQuantity(line,-(line.unit === 'KG' ? 100 : 1000))}><Minus size={15}/></button><span>{(line.quantityMilli/1000).toLocaleString('pt-BR',{maximumFractionDigits:3})} {line.unit}</span><button aria-label={'Aumentar '+line.name} onClick={() => changeQuantity(line,line.unit === 'KG' ? 100 : 1000)}><Plus size={15}/></button></div><strong>{money(lineTotalCents(line.priceCents,line.quantityMilli))}</strong></div>
                      {line.unit==='KG'&&<div className="commerce-inline-form">
                        <label>Peso manual (kg) — {line.name}
                          <input aria-label={'Peso manual de '+line.name} inputMode="decimal" placeholder="0,350"
                            value={manualWeight[line.id]||''}
                            onChange={e=>setManualWeight(old=>({...old,[line.id]:e.target.value}))}/>
                        </label>
                        <button className="secondary" type="button" onClick={()=>{
                          try{setCart(old=>applyManualWeight(old,line.id,manualWeight[line.id]||''));setCartError('');}
                          catch(err){setCartError(friendlyError(err));}
                        }}>Aplicar peso</button>
                        <button className="plain" disabled={readingScale} onClick={()=>void weighItem(line)}>Ler balança para {line.name}</button>
                      </div>}
                    </div>)}
                </div>
                <div className="cart-footer">
                  <div className="total-line"><span>Total estimado</span><strong>{money(total)}</strong></div>
                  <div className="muted-hint"><AlertTriangle size={15}/> O carrinho é temporário até concluir a venda. O pagamento só será registrado após a confirmação.</div>
                  <button className="primary full" disabled={!cart.length || !session} onClick={() => setPaymentOpen(true)}>{session ? 'Receber e concluir venda' : 'Abra o caixa para vender'}</button>
                  {!session && <button className="secondary full" onClick={() => selectView('cash')}>Ir para abertura de caixa</button>}
                  <button className="plain full" disabled={!cart.length} onClick={() => { if(window.confirm('Limpar o rascunho da venda?')) setCart([]); }}><Trash2 size={16}/> Limpar rascunho</button>
                </div>
              </div>
            </div>
          </>}
          {['cash','sales','inventory','finance','reports'].includes(view) && <CommerceView view={view} onDataChanged={reloadAll} role={user.role}/>}
          {view==='settings' && <SystemSettings/>}
          {activeSchema && <>
            <div className="page-heading"><div><div className="eyebrow">CADASTROS</div><h1>{activeSchema.label}</h1><p>{activeSchema.description}</p></div>{view==='products'&&allowed(user.role,'importCatalogCsv')&&<label className="secondary" style={{display:'inline-flex',alignItems:'center',gap:8,padding:12}}>
                Importar produtos CSV
                <input type="file" accept=".csv,text/csv" aria-label="Importar produtos CSV"
                  disabled={importingCsv} onChange={ev=>void importProductsCsv(ev)} style={{maxWidth:180}}/>
              </label>}
              {allowed(user.role,"save",[view])&&<button className="primary" onClick={() => startForm()}><Plus size={18}/> Adicionar {activeSchema.singular.toLowerCase()}</button>}</div>
            <div className="panel data-panel">
              <div className="data-toolbar"><label className="search-field narrow"><Search size={18}/><input placeholder={'Pesquisar '+activeSchema.label.toLowerCase()} aria-label="Pesquisar cadastros" value={search} onChange={ev => {setSearch(ev.target.value);setPage(0);}}/></label><span className="count-chip">{filteredRows.length} cadastros</span></div>
              <div className="table-wrap"><table><thead><tr>{activeSchema.fields.slice(0,4).map((field:any) => <th key={field.key}>{field.label}</th>)}<th className="actions-col">Ações</th></tr></thead>
              <tbody>{pageRows.map(row => <tr key={row.id}>{activeSchema.fields.slice(0,4).map((field:any) => <td key={field.key}>{field.type === 'money' ? money(row[field.key] || 0) : field.type === 'quantity' ? String(Number(row[field.key] || 0)/1000) : field.type === 'reference' ? ((records[field.entity] || []).find(r=>r.id === row[field.key])?.name || '—') : String(row[field.key] || '—')}</td>)}<td className="actions-col">{view==='operators'&&<button className="secondary" type="button" onClick={()=>{setPasswordTarget(row);setOperatorPassword('');setRepeatPassword('');}}>Definir senha</button>}{view==='products'&&<button title="Imprimir etiqueta" className="icon-btn" onClick={()=>void bridge?.devicePrint({kind:'label',productId:row.id}).catch(err=>setError(friendlyError(err)))}><Tags size={16}/></button>}{allowed(user.role,"save",[view])&&<button title="Editar cadastro" className="icon-btn" onClick={() => startForm(row)}><Pencil size={16}/></button>}{allowed(user.role,"archive",[view])&&<button title="Desativar cadastro" className="icon-btn danger-icon" onClick={() => void archiveRecord(row)}><Archive size={16}/></button>}</td></tr>)}</tbody></table>
                {!filteredRows.length && <div className="empty-state"><Package size={26}/><strong>{search ? 'Nenhum resultado para a pesquisa' : 'Ainda não há cadastros'}</strong><p>{search ? 'Experimente outro termo.' : 'Use o botão Adicionar para começar.'}</p></div>}
              </div>
              {filteredRows.length > pageSize && <div className="pagination"><span>Página {page+1} de {pageCount} · {filteredRows.length} registros</span><div><button className="secondary" disabled={page===0} onClick={() => setPage(p => Math.max(0,p-1))}>Anterior</button><button className="secondary" disabled={page>=pageCount-1} onClick={() => setPage(p => Math.min(pageCount-1,p+1))}>Próxima</button></div></div>}
            </div>
            {view === 'operators' && <div className="info-bar"><AlertTriangle size={19}/><p>Os perfis controlam o acesso a vendas, estoque e gestão. Defina uma senha para cada operador recém-criado.</p></div>}
          </>}
        </>}
      </section>
    </main>
    {passwordTarget&&<div className="modal-backdrop" role="presentation"><section className="dialog" role="dialog" aria-label="Definir senha do operador" aria-modal="true">
      <header className="dialog-head"><h2>Definir senha: {passwordTarget.name}</h2><button className="icon-btn" onClick={()=>setPasswordTarget(null)} aria-label="Fechar"><X size={18}/></button></header>
      <form className="dialog-form" onSubmit={setAccess}><div className="form-grid">
       <label className="form-field">Nova senha (mínimo 8 caracteres)<input type="password" required minLength={8} maxLength={128} value={operatorPassword} autoComplete="new-password" onChange={e=>setOperatorPassword(e.target.value)}/></label>
       <label className="form-field">Confirmar senha<input type="password" required minLength={8} maxLength={128} value={repeatPassword} autoComplete="new-password" onChange={e=>setRepeatPassword(e.target.value)}/></label>
      </div>{error&&<p role="alert">{error}</p>}<footer className="dialog-footer"><button type="button" className="secondary" onClick={()=>setPasswordTarget(null)}>Cancelar</button><button type="submit" className="primary">Salvar acesso</button></footer></form>
    </section></div>}
    {paymentOpen && <PaymentModal cart={cart} products={products} customers={records.customers||[]} onClose={()=>setPaymentOpen(false)} onDone={completeSale}/>}
    {receipt && <SaleReceipt sale={receipt} onClose={()=>setReceipt(null)}/>}
    {editing && activeSchema && <div className="modal-backdrop" role="presentation" onMouseDown={ev => {if(ev.target === ev.currentTarget && !saving)setEditing(null);}}>
      <section className="dialog" role="dialog" aria-modal="true" aria-label={(editing.id ? 'Editar ' : 'Adicionar ') + activeSchema.singular}>
        <header className="dialog-head"><div><div className="eyebrow">{editing.id ? 'EDIÇÃO' : 'NOVO CADASTRO'}</div><h2>{editing.id ? 'Editar ' : 'Adicionar '}{activeSchema.singular.toLowerCase()}</h2></div><button aria-label="Fechar formulário" className="icon-btn" disabled={saving} onClick={() => setEditing(null)}><X size={20}/></button></header>
        <form onSubmit={saveRecord} className="dialog-form">
          <div className="form-grid">{activeSchema.fields.map((field:any) => <label className="form-field" key={field.key}><span>{field.label}{field.required && <em> *</em>}</span>
            {field.type === 'select' ? <select required={field.required} value={form[field.key]??''} onChange={ev => setForm(old => ({...old,[field.key]:ev.target.value}))}>{field.values.map((value:string) => <option key={value} value={value}>{value}</option>)}</select> :
             field.type === 'reference' ? <select value={form[field.key]??''} onChange={ev => setForm(old => ({...old,[field.key]:ev.target.value}))}><option value="">Sem categoria</option>{(records[field.entity] || []).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select> :
             <input required={field.required} type={field.type === 'money' || field.type === 'quantity' ? 'text' : 'text'} autoComplete="off"
             inputMode={field.type === 'money' || field.type === 'quantity' ? 'decimal' : 'text'}
             value={form[field.key]??''} readOnly={Boolean(field.readOnlyOnEdit && editing.id)} onChange={ev => setForm(old => ({...old,[field.key]:ev.target.value}))}
             placeholder={field.type === 'money' ? '0,00' : field.type === 'quantity' ? '0,000' : field.label}/>}
          </label>)}</div>
          {error && <div className="form-error" role="alert"><AlertTriangle size={16}/>{error}</div>}
          <footer className="dialog-footer"><button type="button" className="secondary" disabled={saving} onClick={() => setEditing(null)}>Cancelar</button><button type="submit" className="primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar cadastro'}<Check size={17}/></button></footer>
        </form>
      </section>
    </div>}
  </div>;
}
