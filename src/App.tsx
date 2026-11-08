import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard, ShoppingCart, Package, Tags, Users, Truck, UserRoundCog, Building2,
  Search, Plus, Pencil, Archive, X, Check, AlertTriangle, Database, RotateCcw,
  ChevronRight, Minus, Settings, ShieldCheck, ArrowRight, Trash2, Keyboard,
  Wallet, ClipboardList, BarChart3, Boxes, ReceiptText, PackageCheck, GraduationCap
} from 'lucide-react';
import { entities, entityOrder } from '../shared/contract.mjs';
import { addToCart, cartTotalCents, lineTotalCents, money, parseFixed } from '../shared/domain.mjs';
import { filterCheckoutProducts } from '../shared/catalog.mjs';
import { resolveBatchScan,parseBatchLabel } from '../shared/batch-label.mjs';
import {applyManualWeight} from '../shared/manual-weight.mjs';
import { CommerceView, PaymentModal } from './Commerce';
import { Cashier } from './Cashier';
import {encodeProductImage} from './product-image';
import { resolveCashierShortcut } from '../shared/cashier.mjs';
import {
  normalizeHeldSales, holdCashierSale, resumeHeldSale,
  normalizeCashierFavorites, toggleCashierFavorite, canUndoCashierChange
} from '../shared/cashier-workflow.mjs';
import { SaleReceipt } from './Receipt';
import { SystemSettings } from './SystemSettings';
import {allowed} from '../shared/access.mjs';
import {GuidedTour} from './GuidedTour';
import {FirstAccess} from './FirstAccess';

type Row = Record<string, any>;
type CartItem = {id:string;name:string;code:string;unit:string;priceCents:number;quantityMilli:number;batchId?:string;batchCode?:string};
const definitions: Record<string, any> = entities;
const icons: Record<string, any> = {
  dashboard: LayoutDashboard, checkout: ShoppingCart, products: Package, categories: Tags,
  customers: Users, suppliers: Truck, operators: UserRoundCog,
  cash: Wallet, sales: ReceiptText, inventory: Boxes, purchases: PackageCheck, finance: ClipboardList, reports: BarChart3, settings: Settings
};
const menus = [
  {title:'OPERAÇÃO', ids:['dashboard','checkout','cash','sales']},
  {title:'GESTÃO', ids:['inventory','purchases','finance','reports']},
  {title:'CADASTROS', ids:entityOrder},
  {title:'SISTEMA', ids:['settings']}
];
const titles: Record<string,string> = {dashboard:'Visão geral',checkout:'Frente de caixa',cash:'Controle de caixa',sales:'Vendas',inventory:'Estoque',purchases:'Compras',finance:'Financeiro',reports:'Relatórios',settings:'Dispositivos e rede'};
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
  const [tourRequest,setTourRequest] = useState(0);
  const [setupRequest,setSetupRequest] = useState(0);
  const [initialPaymentMethod,setInitialPaymentMethod] = useState<'cash'|'pix'|'card'>('cash');
  const [initialPaymentFocus,setInitialPaymentFocus] = useState<'customer'|'discount'|undefined>();

  const [records,setRecords] = useState<Record<string, Row[]>>({});
  const [overviewCounts,setOverviewCounts] = useState<Record<string,number>>({});
  const [entityPage,setEntityPage] = useState<{rows:Row[];total:number;page:number;pageSize:number}>({rows:[],total:0,page:0,pageSize:75});
  const [catalogPage,setCatalogPage]=useState<{rows:Row[];total:number;page:number;pageSize:number}>({rows:[],total:0,page:0,pageSize:35});
  const [catalogIndex,setCatalogIndex]=useState(0);
  const [productPhotosCache,setProductPhotosCache]=useState<Record<string,string>>({});
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [search,setSearch] = useState('');
  const [page,setPage] = useState(0);
  const [editing,setEditing] = useState<Row|null>(null);
  const [editingEntity,setEditingEntity] = useState<string|null>(null);
  const [form,setForm] = useState<Row>({});
  const [saving,setSaving] = useState(false);
  const [photoBusy,setPhotoBusy] = useState(false);
  const [importingCsv,setImportingCsv] = useState(false);
  const [stockAlertsSummary,setStockAlertsSummary]=useState<{
    outOfStock:number;lowStock:number;expired:number;expiring:number;
    examples:Array<{id:string;product_name:string;code:string;days_until_expiry:number;remaining_milli:number}>
  }>({outOfStock:0,lowStock:0,expired:0,expiring:0,examples:[]});
  const [stockAlertsLoaded,setStockAlertsLoaded]=useState(false);
  const [stockAlertsError,setStockAlertsError]=useState('');
  const [cart,setCart] = useState<CartItem[]>(() => {
    try {
      const saved=JSON.parse(localStorage.getItem('pdv-better:draft-v1:'+user.id)||'[]');
      return Array.isArray(saved)?saved.filter(x=>typeof x.id==='string'&&Number.isSafeInteger(x.quantityMilli)&&x.quantityMilli>0&&Number.isSafeInteger(x.priceCents)&&x.priceCents>=0):[];
    } catch{return [];}
  });
  const [heldSales,setHeldSales] = useState<any[]>(()=>{
    try{return normalizeHeldSales(JSON.parse(localStorage.getItem('pdv-better:held-v1:'+user.id)||'[]'));}
    catch{return [];}
  });
  const [favoriteIds,setFavoriteIds] = useState<string[]>(()=>{
    try{return normalizeCashierFavorites(JSON.parse(localStorage.getItem('pdv-better:favorites-v1:'+user.id)||'[]'));}
    catch{return [];}
  });
  const [undoCart,setUndoCart] = useState<{before:CartItem[];after:CartItem[]}|null>(null);
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
  const listFields = activeSchema ? (view === 'products'
    ? ['name','code','sale_price_cents','stock_milli','category_id'].map(key=>activeSchema.fields.find((field:any)=>field.key===key)).filter(Boolean)
    : activeSchema.fields.filter((field:any)=>field.type!=='image').slice(0,4)) : [];
  const dialogSchema = definitions[editingEntity || view];
  const bridge = window.pdv;
  async function reloadAll() {
    if(!bridge){
      setError('O banco local está disponível somente no aplicativo Electron. Abra pelo instalador ou npm run dev.');
      setLoading(false);return;
    }
    try{
      // Uma consulta COUNT(*) por entidade: nunca transferir tabelas completas no login.
      const counts=await bridge.overview();
      setOverviewCounts(counts);
      if(counts.stockAlerts){setStockAlertsSummary(counts.stockAlerts);setStockAlertsLoaded(true);}
      if(view==='checkout'){
        const kinds=['products','categories','customers'].filter(kind=>allowed(user.role,'list',[kind]));
        const entries=await Promise.all(kinds.map(kind=>kind==='products'
          ?bridge.list('products','',{slim:true})
          :bridge.list(kind)));
        setRecords(prev=>({...prev,...Object.fromEntries(kinds.map((kind,i)=>[kind,entries[i]]))}));
      }else if(definitions[view]){
        const references=definitions[view].fields.filter((field:any)=>field.type==='reference')
          .map((field:any)=>field.entity).filter((kind:string)=>kind!==view&&allowed(user.role,'list',[kind]));
        const unique=[...new Set(references)] as string[];
        if(unique.length){
          const entries=await Promise.all(unique.map(kind=>bridge.list(kind)));
          setRecords(prev=>({...prev,...Object.fromEntries(unique.map((kind,i)=>[kind,entries[i]]))}));
        }
      }
      setError('');
    }catch(err){setError('Não foi possível consultar o banco: '+friendlyError(err));}
    finally{setLoading(false);}
  }
  async function reload(kind:string) {
    if(!bridge)return;
    if(kind===view&&definitions[view]){
      const result=await bridge.list(view,search,{page,pageSize:75,includeImages:view==='products'});
      setEntityPage(result);
    }else if(kind==='products'&&view==='checkout'){
      const products=await bridge.list('products','',{slim:true});
      setRecords(prev=>({...prev,products}));
    }else if(allowed(user.role,'list',[kind])){
      const current=await bridge.list(kind);
      setRecords(prev=>({...prev,[kind]:current}));
    }
    const updated=await bridge.overview();
    setOverviewCounts(updated);
    if(updated.stockAlerts){setStockAlertsSummary(updated.stockAlerts);setStockAlertsLoaded(true);}
  }
  useEffect(()=>{void reloadAll();},[view]);
  useEffect(()=>{
    if(!definitions[view]||!bridge)return;
    let cancelled=false;
    const timer=setTimeout(()=>{
      void bridge.list(view,search,{page,pageSize:75,includeImages:view==='products'})
        .then(data=>{if(!cancelled)setEntityPage(data);})
        .catch(error=>{if(!cancelled)setError('Não foi possível consultar os cadastros: '+friendlyError(error));});
    },search?180:0);
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[view,search,page]);
  useEffect(()=>{
    if(view!=='checkout'||!bridge)return;
    let cancelled=false;
    const timer=setTimeout(()=>{
      void bridge.list('products',cartSearch,{page:catalogIndex,pageSize:35,
        includeImages:true,categoryId:categoryFilter==='all'?null:categoryFilter})
        .then(data=>{
          if(cancelled)return;
          setCatalogPage(data);
          setProductPhotosCache(previous=>{
            const added:Record<string,string>=Object.fromEntries(data.rows.filter(row=>row.image_data)
              .map((row:Row):[string,string]=>[String(row.id),String(row.image_data)]));
            const combined={...previous,...added};
            return Object.fromEntries(Object.entries(combined).slice(-100));
          });
        })
        .catch(error=>{if(!cancelled)setCartError('Catálogo indisponível: '+friendlyError(error));});
    },cartSearch?140:0);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[view,cartSearch,categoryFilter,catalogIndex]);
  useEffect(()=>{setCatalogIndex(0);},[cartSearch,categoryFilter]);
  useEffect(()=>{
    try{if(cart.length)localStorage.setItem('pdv-better:draft-v1:'+user.id,JSON.stringify(cart));else localStorage.removeItem('pdv-better:draft-v1:'+user.id);}
    catch{/* A ausência de armazenamento temporário não impede uma venda */ }
  },[cart]);
  useEffect(() => { setSearch(''); setPage(0); setNotice(''); setError(''); }, [view]);
  useEffect(() => { if((view==='checkout'||view==='dashboard') && bridge) void bridge.sessionCurrent().then(setSession).catch(err=>setCartError(friendlyError(err))); }, [view]);
  useEffect(() => {
    if (view === 'checkout' && !paymentOpen && !receipt) searchInput.current?.focus();
  }, [view,paymentOpen,receipt]);
  useEffect(() => {
    const onKey = (ev:KeyboardEvent) => {
      if (ev.key === 'Escape' && editing) { setEditing(null); return; }
      const target=ev.target as HTMLElement|null;
      const editable=Boolean(target&&(target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName)));
      const shortcutKey=ev.ctrlKey&&ev.key.toLowerCase()==='z'?'Ctrl+Z':ev.key;
      const action = resolveCashierShortcut(shortcutKey,{
        checkout:view==='checkout',session:Boolean(session),hasCart:cart.length>0,
        hasHeld:heldSales.length>0,canUndo:canUndoCashierChange(cart,undoCart),
        dialog:Boolean(editing||paymentOpen||receipt||passwordTarget||document.querySelector('[role="dialog"][aria-modal="true"]')),editable
      });
      if(!action)return;
      ev.preventDefault();
      if(action==='search'){
        if(editable)return;
        if(view!=='checkout')setView('checkout');
        searchInput.current?.focus();
      } else if(action==='customer') openPayment(undefined,'customer');
      else if(action==='discount') openPayment(undefined,'discount');
      else if(action==='pix') openPayment('pix');
      else if(action==='card') openPayment('card');
      else if(action==='cash') openPayment('cash');
      else if(action==='payment') openPayment();
      else if(action==='hold') holdCurrentSale('');
      else if(action==='resume') resumeSale(heldSales[0].id);
      else if(action==='undo') undoLastCartChange();
    };
    window.addEventListener('keydown',onKey);
    return () => window.removeEventListener('keydown',onKey);
  }, [editing,view,session,cart,heldSales,undoCart,records,paymentOpen,receipt,passwordTarget]);
  const filteredRows = entityPage.rows;
  const pageSize = 75;
  const pageCount = Math.max(1,Math.ceil(entityPage.total/pageSize));
  const pageRows = entityPage.rows;
  const products:Row[] = records.products || [];
  const productPhotos=productPhotosCache;
  const categories:Row[] = records.categories || [];
  const favoriteProducts = favoriteIds.map(id=>products.find(row=>row.id===id)).filter(Boolean) as Row[];
  const undoAvailable=canUndoCashierChange(cart,undoCart);
  const matchingProducts=useMemo(()=>catalogPage.rows,[catalogPage.rows]);
  const stockAlerts=stockAlertsSummary;
  const total = cartTotalCents(cart);
  function openPayment(method?:'cash'|'pix'|'card',focus?:'customer'|'discount'){
    if(!session||!cart.length)return;
    setInitialPaymentMethod(method||'cash');
    setInitialPaymentFocus(focus);
    setPaymentOpen(true);
  }
  function holdCurrentSale(label:string){
    try{
      const next=holdCashierSale(heldSales,cart,{
        id:crypto.randomUUID(),label,createdAt:new Date().toISOString()
      });
      // Primeiro persiste a espera. Se falhar, a venda ativa permanece intacta.
      localStorage.setItem('pdv-better:held-v1:'+user.id,JSON.stringify(next));
      setHeldSales(next);setCart([]);setUndoCart(null);setCartError('');
      setNotice('Venda colocada em espera neste terminal. Nenhum estoque foi reservado.');
    }catch(err){setCartError('Não foi possível colocar a venda em espera. '+friendlyError(err));}
  }
  function resumeSale(id:string){
    if(cart.length){
      setCartError('Guarde ou limpe o carrinho atual antes de retomar outra venda.');
      return;
    }
    try{
      const result=resumeHeldSale(heldSales,id,products);
      // Recuperação contra queda: gravar carrinho ativo antes de retirar a espera.
      localStorage.setItem('pdv-better:draft-v1:'+user.id,JSON.stringify(result.items));
      localStorage.setItem('pdv-better:held-v1:'+user.id,JSON.stringify(result.remaining));
      setHeldSales(result.remaining);setCart(result.items as CartItem[]);
      setUndoCart(null);setCartError(result.warnings.join(' '));
      setNotice(result.warnings.length?'Venda retomada; confira as alterações de catálogo e preços.':'Venda retomada no caixa.');
      searchInput.current?.focus();
    }catch(err){setCartError('Não foi possível retomar a venda. '+friendlyError(err));}
  }
  function removeHeldSale(id:string){
    if(!window.confirm('Excluir este rascunho em espera? Nenhuma venda será cancelada no banco.'))return;
    try{
      const next=heldSales.filter(sale=>sale.id!==id);
      localStorage.setItem('pdv-better:held-v1:'+user.id,JSON.stringify(next));
      setHeldSales(next);setCartError('');
      setNotice('Rascunho em espera excluído neste terminal.');
    }catch(err){setCartError('Não foi possível excluir a espera. '+friendlyError(err));}
  }
  function favoriteProduct(id:string){
    try{
      const next=toggleCashierFavorite(favoriteIds,id);
      localStorage.setItem('pdv-better:favorites-v1:'+user.id,JSON.stringify(next));
      setFavoriteIds(next);setCartError('');
    }catch(err){setCartError('Não foi possível atualizar favoritos. '+friendlyError(err));}
  }
  function removeCartItem(id:string){
    const next=cart.filter(line=>line.id!==id);
    if(next.length===cart.length)return;
    setUndoCart({before:cart,after:next});setCart(next);
    setCartError('');
  }
  function clearCurrentCart(){
    if(!cart.length||!window.confirm('Limpar o rascunho da venda?'))return;
    setUndoCart({before:cart,after:[]});setCart([]);setCartError('');
  }
  function undoLastCartChange(){
    if(!canUndoCashierChange(cart,undoCart)||!undoCart)return;
    setCart(undoCart.before);setUndoCart(null);setCartError('');
  }
  function startForm(row?:Row) {
    setEditingEntity(view);
    const base = row ? Object.fromEntries(definitions[view].fields.map((field:any) => [field.key,formatValue(field,row[field.key])])) : newForm(view);
    setForm({...base,...(row ? {id:row.id} : {})});
    setEditing(row || {});
    setError('');
  }
  function openNewProductModal(){
    if(!allowed(user.role,'save',['products'])){selectView('products');return;}
    setEditingEntity('products');setForm(newForm('products'));setEditing({});setError('');
  }
  async function uploadProductPhoto(ev:React.ChangeEvent<HTMLInputElement>){
    const file=ev.target.files?.[0];
    ev.target.value='';
    if(!file)return;
    setPhotoBusy(true);setError('');
    try{
      const data=await encodeProductImage(file);
      setForm(old=>({...old,image_data:data}));
    }catch(error){setError(friendlyError(error));}
    finally{setPhotoBusy(false);}
  }
  async function saveRecord(ev:React.FormEvent) {
    ev.preventDefault();
    if (!bridge || saving || photoBusy) return;
    setSaving(true); setError('');
    try {
      const kind = editingEntity || view;
      const saved = await bridge.save(kind, form);
      await reload(kind);
      if (kind === 'products') setCart(prev => prev.map(item => item.id === saved.id ? {...item, name:saved.name, code:saved.code || '', priceCents:saved.sale_price_cents, unit:saved.unit, quantityMilli:saved.unit === 'UN' && item.quantityMilli % 1000 !== 0 ? 1000 : item.quantityMilli} : item));
      setEditing(null);setEditingEntity(null);setNotice(definitions[kind].singular + ' salvo: ' + saved.name);
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
    try { setCart(addToCart(cart,row,1000)); setUndoCart(null); setCartError(''); setCartSearch(''); searchInput.current?.focus(); }
    catch(err) { setCartError(friendlyError(err)); }
  }
  function changeQuantity(item:CartItem,delta:number) {
    const quantity = item.quantityMilli + delta;
    if (quantity <= 0) { removeCartItem(item.id); return; }
    try {
      lineTotalCents(item.priceCents,quantity);
      setCart(prev => prev.map(line => line.id === item.id ? {...line,quantityMilli:quantity} : line));setUndoCart(null);
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
          setUndoCart(null);
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
  function selectView(next:string) { if(view==='settings')void reloadAll(); setView(next); setEditing(null);setEditingEntity(null); setPaymentOpen(false); setCartError(''); }
  async function weighItem(item:CartItem) {
    if(!bridge || readingScale)return;
    setReadingScale(true);setCartError('');
    try {
      const milli=await bridge.scaleRead();
      if(!Number.isSafeInteger(milli)||milli<=0)throw new Error('Peso inválido da balança.');
      lineTotalCents(item.priceCents,milli);
      setCart(old=>old.map(line=>line.id===item.id?{...line,quantityMilli:milli}:line));setUndoCart(null);
    }catch(err){setCartError(friendlyError(err));}
    finally{setReadingScale(false);}
  }
  async function completeSale(sale:Row) {
    setPaymentOpen(false);setCart([]);setUndoCart(null);setReceipt(sale);
    try {await reload('products');if(bridge)setSession(await bridge.sessionCurrent());}catch(err){setCartError(friendlyError(err));}
    setNotice(sale.is_training?'Simulação de treinamento '+sale.id.slice(0,8)+' registrada: sem faturamento, caixa ou baixa de estoque.':
      'Venda '+sale.id.slice(0,8)+' concluída, total '+money(sale.total_cents)+'. Troco: '+money(sale.change_cents)+'. Comprovante não fiscal.');
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
  const productCoreKeys=['image_data','name','code','category_id','sale_price_cents','cost_price_cents','stock_milli','unit'];
  const isProductDialog=editingEntity==='products';
  const mainEditorFields=isProductDialog
    ? productCoreKeys.map(key=>dialogSchema?.fields.find((field:any)=>field.key===key)).filter(Boolean)
    : (dialogSchema?.fields||[]);
  const extraEditorFields=isProductDialog ? (dialogSchema?.fields||[]).filter((field:any)=>!productCoreKeys.includes(field.key)) : [];
  const renderEditorField=(field:any) => field.type==='image'
            ? <div className="form-field product-photo-field" key={field.key}>
                <span>Foto do produto</span>
                <div className="product-photo-editor">
                  {form.image_data?<img src={form.image_data} alt="Prévia da foto do produto"/>:<div className="product-photo-placeholder"><Package size={28}/><small>Sem foto</small></div>}
                  <div className="product-photo-actions">
                    <label className="secondary product-photo-button">{form.image_data ? "Alterar Foto" : "Adicionar Foto"}
                      <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Selecionar foto do produto"
                        disabled={saving||photoBusy} onChange={ev=>void uploadProductPhoto(ev)}/>
                    </label>
                    {form.image_data&&<button type="button" className="secondary" disabled={saving||photoBusy} onClick={()=>setForm(old=>({...old,image_data:''}))}>Remover foto</button>}
                    <small>{photoBusy?'Compactando foto…':'JPG, PNG ou WebP. Salva no SQLite e acompanha o backup.'}</small>
                  </div>
                </div>
              </div>
            : <label className={"form-field"+(editingEntity==='products' && field.key==='name' ? " product-main-name" : "")} key={field.key}><span>{field.label}{field.required && <em> *</em>}</span>
            {field.type === 'select' ? <select required={field.required} value={form[field.key]??''} onChange={ev => setForm(old => ({...old,[field.key]:ev.target.value}))}>{field.values.map((value:string) => <option key={value} value={value}>{value}</option>)}</select> :
             field.type === 'reference' ? <select value={form[field.key]??''} onChange={ev => setForm(old => ({...old,[field.key]:ev.target.value}))}><option value="">Sem categoria</option>{(records[field.entity] || []).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select> :
             <input required={field.required} type={field.type === 'money' || field.type === 'quantity' ? 'text' : 'text'} autoComplete="off"
             inputMode={field.type === 'money' || field.type === 'quantity' ? 'decimal' : 'text'}
             value={form[field.key]??''} readOnly={Boolean(field.readOnlyOnEdit && editing.id)} onChange={ev => setForm(old => ({...old,[field.key]:ev.target.value}))}
             placeholder={field.type === 'money' ? '0,00' : field.type === 'quantity' ? '0,000' : field.label}/>}
          </label>;
  return <div className={'shell super-shell'+(view==='checkout'?' cashier-shell mode-light':'')}>
    <main className="main">
      <header className="topbar super-topbar">
        <div className="super-top-brand" aria-label="PDV SUPER" data-tour="brand">
          <span className="super-brand-icon"><ShoppingCart size={23}/></span>
          <strong>PDV SUPER</strong>
        </div>
        <nav className="super-top-navigation" aria-label="Navegação principal" data-tour="navigation">
          {menus.map(section => <div className="menu-section" key={section.title}>
            <div className="menu-title">{section.title}</div>
            {section.ids.filter(canVisit).map((id:string) => {
              const Icon = icons[id];
              return <button type="button" key={id} data-tour-nav={id} className={'nav-item '+(view === id ? 'selected' : '')}
                aria-current={view === id ? 'page' : undefined} onClick={() => selectView(id)}>
                <Icon size={16}/><span>{titles[id] || definitions[id]?.label}</span>
              </button>;
            })}
          </div>)}
        </nav>
        <div className="top-actions super-top-actions">
          <span className="status-pill"><span className="status-dot"/> {error && !editing ? 'Verificar banco' : 'Local'}</span>
          {user.role==='Administrador'&&<button type="button" className="super-tour-help" onClick={()=>{selectView('dashboard');setSetupRequest(old=>old+1);}} title="Preparação do estabelecimento"><Building2 size={16}/><span>Preparar loja</span></button>}
          <button type="button" className="super-tour-help" onClick={()=>setTourRequest(old=>old+1)} title="Rever tour guiado" aria-label="Tour guiado"><GraduationCap size={16}/><span>Tour guiado</span></button>
          <span className="super-user" title="Operador autenticado"><UserRoundCog size={18}/><span>{user.name} · {user.role}</span></span>
          <button className="super-logout" onClick={()=>void onLogout()}>Sair</button>
        </div>
      </header>
      <section className="content">
        {notice && <div className="notice success" role="status"><Check size={17}/>{notice}<button aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={15}/></button></div>}
        {error && !editing && <div className="notice danger" role="alert"><AlertTriangle size={17}/>{error}<button onClick={() => {setLoading(true); void reloadAll();}}><RotateCcw size={15}/>Tentar novamente</button></div>}
        {loading ? <div className="loading">Carregando dados do estabelecimento…</div> : <>
          {view === 'dashboard' && <>
            <div className="page-heading"><div><div className="eyebrow">INÍCIO</div><h1>Bem-vindo ao PDV SUPER</h1><p>Seu comércio organizado em um único lugar, mesmo sem internet.</p></div><button className="primary" onClick={() => selectView('checkout')}><ShoppingCart size={17}/> Abrir frente de caixa</button></div>
            {user.role==='Administrador'&&<FirstAccess userId={user.id} databaseReady={Number.isInteger(overviewCounts.products)&&!error}
              productsCount={overviewCounts.products||0} cashOpen={Boolean(session)} startSignal={setupRequest}
              onNavigate={selectView} onStartTour={()=>setTourRequest(old=>old+1)}/>}
                        <div className="stat-grid">
              {entityOrder.slice(0,4).filter(kind=>canVisit(kind)).map((kind:string) => {
                const Icon = icons[kind];
                return <button className="stat" onClick={() => selectView(kind)} key={kind}><div className="stat-top"><span>{definitions[kind].label}</span><Icon size={20}/></div><strong>{overviewCounts[kind]||0}</strong><span className="stat-bottom">Cadastros ativos <ArrowRight size={14}/></span></button>;
              })}
            </div>
            <div className="panel glass-panel" aria-label="Alertas de estoque e validade">
               <h2><AlertTriangle size={18}/> Alertas de estoque e validade</h2>
               {stockAlertsError&&<p role="alert">Falha ao consultar lotes: {stockAlertsError}. Os alertas de validade podem estar incompletos.</p>}
               {!stockAlertsLoaded&&!stockAlertsError&&<p>Consultando lotes locais…</p>}
               {stockAlertsLoaded&&<div className="stat-grid">
                 <div className="stat"><span>Sem estoque</span><strong>{stockAlerts.outOfStock}</strong></div>
                 <div className="stat"><span>Estoque baixo</span><strong>{stockAlerts.lowStock}</strong></div>
                 <div className="stat"><span>Lotes vencidos</span><strong>{stockAlerts.expired}</strong></div>
                 <div className="stat"><span>Vencem em até 30 dias</span><strong>{stockAlerts.expiring}</strong></div>
               </div>}
               {stockAlertsLoaded&&stockAlerts.examples.map(batch=>
                 <p key={batch.id}><strong>{batch.product_name}</strong> · Lote {batch.code||batch.id.slice(0,8)} ·
                   {batch.days_until_expiry<0?' Vencido há '+Math.abs(batch.days_until_expiry)+' dias':' Vence em '+batch.days_until_expiry+' dias'} ·
                   Saldo rastreado {batch.remaining_milli/1000}
                 </p>)}
               <p>Alertas informativos; vendas de lotes vencidos continuam bloqueadas pelo domínio.</p>
             </div>
             <div className="section-title"><h2>Acesso rápido</h2><p>Comece pelas tarefas mais utilizadas.</p></div>
            <div className="quick-grid">
              <button className="quick" onClick={() => selectView('checkout')}><span className="quick-icon"><ShoppingCart size={21}/></span><strong>Preparar uma venda</strong><span>Buscar produtos e conferir total</span><ArrowRight size={17}/></button>
              <button className="quick" onClick={() => selectView('products')}><span className="quick-icon"><Package size={21}/></span><strong>Gerenciar produtos</strong><span>Preços, estoque inicial e códigos</span><ArrowRight size={17}/></button>
              <button className="quick" onClick={() => selectView('customers')}><span className="quick-icon"><Users size={21}/></span><strong>Clientes</strong><span>Consultar ou incluir um cadastro</span><ArrowRight size={17}/></button>
            </div>
            <div className="info-bar"><ShieldCheck size={20}/><div><strong>Operação local · Dados protegidos</strong><p>Cadastros, vendas, saldos de estoque e financeiro são registrados no SQLite local. Pix e cartão devem ser confirmados externamente antes da conclusão da venda.</p></div></div>
          </>}
          {view === 'checkout' && <Cashier
            searchRef={searchInput} search={cartSearch}
            onSearchChange={value=>{setCartSearch(value);setCartError('');}}
            onSearchKeyDown={scanKey}
            categories={categories} categoryFilter={categoryFilter} onCategoryFilter={setCategoryFilter}
            products={matchingProducts} productPhotos={productPhotos} catalogTotal={catalogPage.total} catalogIndex={catalogIndex} onCatalogPageChange={setCatalogIndex} onAddProduct={addProduct}
            onProducts={openNewProductModal} canCreateProduct={allowed(user.role,'save',['products'])} cart={cart} cartError={cartError}
            total={total} sessionOpen={Boolean(session)}
            onRemoveProduct={removeCartItem}
            onChangeQuantity={changeQuantity} manualWeight={manualWeight}
            onManualWeightChange={(id,value)=>setManualWeight(old=>({...old,[id]:value}))}
            onApplyWeight={item=>{
              try{setCart(applyManualWeight(cart,item.id,manualWeight[item.id]||''));setCartError('');}
              catch(err){setCartError(friendlyError(err));}
            }}
            onReadScale={item=>void weighItem(item)} readingScale={readingScale}
            onClearCart={clearCurrentCart}
            onCash={()=>selectView('cash')}
            onOpenPayment={openPayment}
            favoriteIds={favoriteIds} favoriteProducts={favoriteProducts}
            onToggleFavorite={favoriteProduct}
            heldSales={heldSales} onHold={holdCurrentSale}
            onResumeHeld={resumeSale} onRemoveHeld={removeHeldSale}
            canUndo={undoAvailable} onUndo={undoLastCartChange}
          />}
          {['cash','sales','inventory','purchases','finance','reports'].includes(view) && <CommerceView view={view} onDataChanged={reloadAll} role={user.role}/>}
          {view==='settings' && <SystemSettings/>}
          {activeSchema && <>
            <div className="page-heading"><div><div className="eyebrow">CADASTROS</div><h1>{activeSchema.label}</h1><p>{activeSchema.description}</p></div>{view==='products'&&allowed(user.role,'importCatalogCsv')&&<label className="secondary catalog-import-control">
                <Database size={16} aria-hidden="true"/> Importar produtos CSV
                <input type="file" accept=".csv,text/csv" aria-label="Importar produtos CSV"
                  disabled={importingCsv} onChange={ev=>void importProductsCsv(ev)}/>
              </label>}
              {allowed(user.role,"save",[view])&&<button className="primary" onClick={() => startForm()}><Plus size={18}/> Adicionar {activeSchema.singular.toLowerCase()}</button>}</div>
            <div className={"panel data-panel"+(view==='products'?" data-panel-products":"")}>
              <div className="data-toolbar"><label className="search-field narrow"><Search size={18}/><input placeholder={'Pesquisar '+activeSchema.label.toLowerCase()} aria-label="Pesquisar cadastros" value={search} onChange={ev => {setSearch(ev.target.value);setPage(0);}}/></label><span className="count-chip">{entityPage.total} cadastros</span></div>
              <div className="table-wrap"><table><thead><tr>{view==='products'&&<th className="photo-column">Foto</th>}{listFields.map((field:any) => <th key={field.key}>{field.label}</th>)}<th className="actions-col">Ações</th></tr></thead>
              <tbody>{pageRows.map(row => <tr key={row.id}>{view==='products'&&<td className="photo-column">{row.image_data?<img className="product-thumbnail" alt={'Foto de '+row.name} src={row.image_data}/>:<span className="product-thumbnail product-thumbnail-empty" aria-label="Produto sem foto"><Package size={19}/></span>}</td>}{listFields.map((field:any) => <td key={field.key}>{field.type === 'money' ? money(row[field.key] || 0) : field.type === 'quantity' ? String(Number(row[field.key] || 0)/1000) : field.type === 'reference' ? ((records[field.entity] || []).find(r=>r.id === row[field.key])?.name || '—') : String(row[field.key] || '—')}</td>)}<td className="actions-col">{view==='operators'&&<button className="secondary" type="button" onClick={()=>{setPasswordTarget(row);setOperatorPassword('');setRepeatPassword('');}}>Definir senha</button>}{view==='products'&&<button title="Imprimir etiqueta" className="icon-btn" onClick={()=>void bridge?.devicePrint({kind:'label',productId:row.id}).catch(err=>setError(friendlyError(err)))}><Tags size={16}/></button>}{allowed(user.role,"save",[view])&&<button title="Editar cadastro" className="icon-btn" onClick={() => startForm(row)}><Pencil size={16}/></button>}{allowed(user.role,"archive",[view])&&<button title="Desativar cadastro" className="icon-btn danger-icon" onClick={() => void archiveRecord(row)}><Archive size={16}/></button>}</td></tr>)}</tbody></table>
                {!filteredRows.length && <div className="empty-state"><Package size={26}/><strong>{search ? 'Nenhum resultado para a pesquisa' : 'Ainda não há cadastros'}</strong><p>{search ? 'Experimente outro termo.' : 'Use o botão Adicionar para começar.'}</p></div>}
              </div>
              {entityPage.total > pageSize && <div className="pagination"><span>Página {page+1} de {pageCount} · {entityPage.total} registros</span><div><button className="secondary" disabled={page===0} onClick={() => setPage(p => Math.max(0,p-1))}>Anterior</button><button className="secondary" disabled={page>=pageCount-1} onClick={() => setPage(p => Math.min(pageCount-1,p+1))}>Próxima</button></div></div>}
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
    {paymentOpen && <PaymentModal cart={cart} products={products} customers={records.customers||[]} role={user.role} initialMethod={initialPaymentMethod} initialFocus={initialPaymentFocus} onClose={()=>setPaymentOpen(false)} onDone={completeSale} onCustomerSaved={()=>reload('customers')}/>}
    {receipt && <SaleReceipt sale={receipt} onClose={()=>setReceipt(null)}/>}
    {editing && dialogSchema && <div className="modal-backdrop" role="presentation" onMouseDown={ev => {if(ev.target === ev.currentTarget && !saving)setEditing(null);}}>
      <section className={isProductDialog?'dialog product-editor-dialog':'dialog'} role="dialog" aria-modal="true" aria-label={isProductDialog?(editing.id?'Editar Produto':'Adicionar Produto'):(editing.id ? 'Editar ' : 'Adicionar ') + dialogSchema.singular}>
        <header className="dialog-head"><div><div className="eyebrow">{editing.id ? 'EDIÇÃO' : 'NOVO CADASTRO'}</div><h2>{isProductDialog?(editing.id?'Editar Produto':'Cadastro de Produto'):(editing.id ? 'Editar ' : 'Adicionar ')+dialogSchema.singular.toLowerCase()}</h2></div><button aria-label="Fechar formulário" className="icon-btn" disabled={saving} onClick={() => setEditing(null)}><X size={20}/></button></header>
        <form onSubmit={saveRecord} className="dialog-form">
          <div className="form-grid product-core-form">{mainEditorFields.map(renderEditorField)}</div>
          {isProductDialog&&extraEditorFields.length>0&&<details className="product-advanced-fields"><summary>Informações adicionais: marca, produtor e variantes</summary><div className="form-grid product-additional-grid">{extraEditorFields.map(renderEditorField)}</div></details>}
          {error && <div className="form-error" role="alert"><AlertTriangle size={16}/>{error}</div>}
          <footer className="dialog-footer"><button type="button" className="secondary" disabled={saving} onClick={() => setEditing(null)}>Cancelar</button><button type="submit" className="primary" disabled={saving||photoBusy}>{saving ? 'Salvando…' : 'Salvar cadastro'}<Check size={17}/></button></footer>
        </form>
      </section>
    </div>}
    <GuidedTour userId={user.id} role={user.role} view={view} loading={loading} startSignal={tourRequest} onNavigate={selectView}/>
  </div>;
}
