import React, { useMemo, useState } from 'react';
import {
  ScanBarcode, Search, ShoppingCart, Package, Plus, Minus, Trash2,
  CreditCard, Banknote, Wallet, UserRound, Tag, Grid2X2, Keyboard,
  CheckCircle2, AlertTriangle, Settings2, X, Star, Clock3, BookmarkPlus, Undo2
} from 'lucide-react';
import { money, lineTotalCents } from '../shared/domain.mjs';

export type CashierMode = 'compact' | 'light' | 'dark';
type Row = Record<string,any>;
type CartLine = {
  id:string; name:string; code:string; unit:string; priceCents:number;
  quantityMilli:number; batchId?:string; batchCode?:string;
};
type PaymentMethod = 'cash'|'pix'|'card';
type HeldSale = {id:string;label:string;createdAt:string;items:CartLine[]};

type CashierProps = {
  searchRef:React.RefObject<HTMLInputElement|null>;
  search:string;
  onSearchChange:(value:string)=>void;
  onSearchKeyDown:(ev:React.KeyboardEvent<HTMLInputElement>)=>void;
  categories:Row[];
  categoryFilter:string;
  onCategoryFilter:(id:string)=>void;
  products:Row[];
  productPhotos:Record<string,string>;
  onAddProduct:(product:Row)=>void;
  onProducts:()=>void;
  canCreateProduct:boolean;
  cart:CartLine[];
  cartError:string;
  total:number;
  sessionOpen:boolean;
  onRemoveProduct:(id:string)=>void;
  onChangeQuantity:(item:CartLine,delta:number)=>void;
  manualWeight:Record<string,string>;
  onManualWeightChange:(id:string,value:string)=>void;
  onApplyWeight:(item:CartLine)=>void;
  onReadScale:(item:CartLine)=>void;
  readingScale:boolean;
  onClearCart:()=>void;
  onCash:()=>void;
  onOpenPayment:(method?:PaymentMethod,focus?:'customer'|'discount')=>void;
  favoriteIds:string[];
  favoriteProducts:Row[];
  onToggleFavorite:(id:string)=>void;
  heldSales:HeldSale[];
  onHold:(label:string)=>void;
  onResumeHeld:(id:string)=>void;
  onRemoveHeld:(id:string)=>void;
  canUndo:boolean;
  onUndo:()=>void;
};

export function Cashier({
  searchRef,search,onSearchChange,onSearchKeyDown,
  categories,categoryFilter,onCategoryFilter,products,productPhotos,onAddProduct,onProducts,canCreateProduct,
  cart,cartError,total,sessionOpen,onRemoveProduct,onChangeQuantity,
  manualWeight,onManualWeightChange,onApplyWeight,onReadScale,readingScale,
  onClearCart,onCash,onOpenPayment,
  favoriteIds,favoriteProducts,onToggleFavorite,
  heldSales,onHold,onResumeHeld,onRemoveHeld,canUndo,onUndo
}:CashierProps) {
  const [heldOpen,setHeldOpen]=useState(false);
  const [holdLabel,setHoldLabel]=useState('');
  const canReceive=cart.length>0&&sessionOpen;
  const productCount=useMemo(()=>cart.reduce((sum,item)=>sum+item.quantityMilli/1000,0),[cart]);
  const showCatalog=true; // Catálogo sempre visível para venda rápida e escolha por foto.
  const openPayment=(method?:PaymentMethod,focus?:'customer'|'discount')=>{
    if(canReceive)onOpenPayment(method,focus);
  };

  return <section className="cashier-mode" aria-label="Frente de caixa PDV SUPER">
    <header className="cashier-heading">
      <div className="cashier-heading-title">
        <span className="cashier-bolt"><ShoppingCart size={24}/></span>
        <div><span className="cashier-kicker">FRENTE DE CAIXA</span>
          <h1>PDV SUPER</h1>
          <p>Leitura, conferência e recebimento em uma única tela.</p>
        </div>
      </div>
    </header>

    <div className="cashier-workspace">
      <div className="cashier-center">
        <div className="cashier-search-box">
          <ScanBarcode size={22} aria-hidden="true"/>
          <input ref={searchRef} autoComplete="off"
            aria-label="Pesquisar ou ler código de barras"
            placeholder="Código, produto ou código de barras…"
            value={search} onChange={ev=>onSearchChange(ev.target.value)}
            onKeyDown={onSearchKeyDown}/>
          <kbd>F2</kbd>
          <button type="button" aria-label="Abrir catálogo"
            aria-expanded={showCatalog}
            onClick={()=>searchRef.current?.focus()}><Grid2X2 size={20}/></button>
        </div>

        <section className="cashier-catalog" aria-label="Catálogo de produtos">
          <div className="cashier-catalog-header"><strong>Produtos disponíveis</strong>
            <span>{products.length} {products.length===1?'produto':'produtos'}</span>
            {canCreateProduct&&<button type="button" className="cashier-new-product" onClick={onProducts}><Plus size={14}/>Novo produto</button>}
            {search&&<button type="button" aria-label="Limpar pesquisa" onClick={()=>{onSearchChange('');searchRef.current?.focus();}}><X size={17}/></button>}
          </div>
          <div className="cashier-filters" aria-label="Categorias">
            <button className={categoryFilter==='all'?'selected':''}
              aria-pressed={categoryFilter==='all'} onClick={()=>onCategoryFilter('all')}>Todos</button>
            {categories.map(category=><button type="button" key={category.id}
              className={categoryFilter===category.id?'selected':''}
              aria-pressed={categoryFilter===category.id}
              onClick={()=>onCategoryFilter(category.id)}>{category.name}</button>)}
          </div>
          <div className="cashier-product-results">
            {products.map(product=><div className="cashier-product-entry" key={product.id}>
              <button type="button" className="cashier-product-option"
                onClick={()=>onAddProduct(product)}>
                <span className="cashier-product-icon cashier-item-photo">{product.image_data?<img src={product.image_data} alt="" loading="lazy"/>:<Package size={17}/>}</span>
                <span className="cashier-product-description"><strong>{product.name}</strong>
                  <small className="cashier-product-meta">{product.code||'Sem código'} · {product.unit}</small>
                </span>
                <strong className="cashier-product-price">{money(product.sale_price_cents)}</strong>
                <small className="cashier-product-stock">Estoque: {(Number(product.stock_milli||0)/1000).toLocaleString('pt-BR',{maximumFractionDigits:3})}</small>
              </button>
              <button type="button" className="cashier-favorite-star"
                aria-label={(favoriteIds.includes(product.id)?'Desfavoritar ':'Favoritar ')+product.name}
                aria-pressed={favoriteIds.includes(product.id)}
                onClick={()=>onToggleFavorite(product.id)}>
                <Star size={19} fill={favoriteIds.includes(product.id)?'currentColor':'none'}/>
              </button>
            </div>)}
            {!products.length&&<div className="cashier-no-results">Nenhum produto encontrado.
              <button type="button" onClick={onProducts}>Abrir cadastros</button>
            </div>}
          </div>
        </section>

        <section className="cashier-favorites" aria-label="Produtos favoritos">
          <div className="cashier-favorites-title">
            <strong><Star size={17}/> Favoritos</strong>
            <span>{favoriteProducts.length ? 'Toque para adicionar ao carrinho' : 'Marque a estrela na consulta de produtos'}</span>
          </div>
          {favoriteProducts.length>0&&<div className="cashier-favorite-chips">
            {favoriteProducts.map(product=><button key={product.id} type="button" onClick={()=>onAddProduct(product)}
              title={'Adicionar '+product.name+' ao carrinho'}>
              <span>{product.name}</span><strong>{money(product.sale_price_cents)}</strong><Plus size={15}/>
            </button>)}
          </div>}
        </section>
      </div>
      <div className="cashier-checkout-side">
        <section className="cashier-cart-area" aria-label="Itens da venda">
          <div className="cashier-cart-header">
            <div><h2><ShoppingCart size={18}/> Carrinho de venda</h2><span>{cart.length} {cart.length===1?'item':'itens'} · {productCount.toLocaleString('pt-BR',{maximumFractionDigits:3})} unidades/peso</span></div>
            <span className={sessionOpen?'cashier-session-open':'cashier-session-closed'}>
              {sessionOpen?'Caixa aberto':'Caixa fechado'}</span>
          </div>
          {cartError&&<div className="cashier-error" role="alert"><AlertTriangle size={17}/>{cartError}</div>}
          <div className="cashier-cart-items">
            {cart.length===0
              ? <div className="cashier-empty">
                  <ShoppingCart size={40}/><strong>Pronto para a próxima venda</strong>
                  <p>Leia o código de barras ou consulte os produtos.</p>
                </div>
              : cart.map(item=><div className="cashier-item" key={item.id}>
                <div className="cashier-item-main">
                  <div className="cashier-item-icon cashier-item-photo">{productPhotos[item.id]?<img src={productPhotos[item.id]} alt="" loading="lazy"/>:<Package size={22}/>}</div>
                  <div className="cashier-item-name">
                    <strong>{item.name}</strong>
                    <small>{item.code||'Sem código'} · {item.unit}{item.batchId?' · Lote '+(item.batchCode||item.batchId.slice(0,8)):''}</small>
                  </div>
                  <div className="cashier-item-stepper">
                    <button type="button" aria-label={'Diminuir '+item.name}
                      onClick={()=>onChangeQuantity(item,-(item.unit==='KG'?100:1000))}><Minus size={16}/></button>
                    <span>{(item.quantityMilli/1000).toLocaleString('pt-BR',{maximumFractionDigits:3})} {item.unit}</span>
                    <button type="button" aria-label={'Aumentar '+item.name}
                      onClick={()=>onChangeQuantity(item,item.unit==='KG'?100:1000)}><Plus size={16}/></button>
                  </div>
                  <strong className="cashier-item-unit-price">{money(item.priceCents)} / {item.unit}</strong>
                  <strong className="cashier-item-total">{money(lineTotalCents(item.priceCents,item.quantityMilli))}</strong>
                  <button type="button" className="cashier-item-remove" aria-label={'Remover '+item.name}
                    onClick={()=>onRemoveProduct(item.id)}><Trash2 size={17}/></button>
                </div>
                {item.unit==='KG'&&<div className="cashier-weight">
                  <label>Peso manual (kg)
                    <input aria-label={'Peso manual de '+item.name} inputMode="decimal"
                      placeholder="0,350" value={manualWeight[item.id]||''}
                      onChange={ev=>onManualWeightChange(item.id,ev.target.value)}/>
                  </label>
                  <button type="button" onClick={()=>onApplyWeight(item)}>Aplicar peso</button>
                  <button type="button" aria-label={'Ler balança para '+item.name} disabled={readingScale} onClick={()=>onReadScale(item)}>Ler balança</button>
                </div>}
              </div>)}
          </div>
          <footer className="cashier-toolbar">
            <button type="button" onClick={()=>searchRef.current?.focus()}><Search size={18}/> Consultar</button>
            <button type="button" disabled={!canReceive} onClick={()=>openPayment(undefined,'customer')}><UserRound size={18}/> Cliente <kbd>F3</kbd></button>
            <button type="button" disabled={!canReceive} onClick={()=>openPayment(undefined,'discount')}><Tag size={18}/> Desconto <kbd>F4</kbd></button>
            <button type="button" disabled={!cart.length} className="cashier-danger" onClick={onClearCart}><Trash2 size={17}/> Cancelar</button>
            <button type="button" onClick={onCash}><Settings2 size={18}/> Caixa</button>
            <button type="button" disabled={!canUndo} onClick={onUndo} aria-label="Desfazer exclusão do carrinho"><Undo2 size={18}/> Desfazer <kbd>Ctrl+Z</kbd></button>
          </footer>
        </section>

      <aside className="cashier-payment-panel" aria-label="Resumo e recebimento">
        <div className="cashier-payment-top">
          <span className="cashier-payment-eyebrow">{cart.length} {cart.length===1?'item':'itens'} no carrinho</span>
          <div className="cashier-subtotal"><span>Subtotal</span><strong>{money(total)}</strong></div>
          <div className="cashier-discount"><span>Desconto na conferência</span><strong>{money(0)}</strong></div>
          <span className="cashier-payment-divider"/>
          <span className="cashier-payment-label">Total a pagar</span>
          <strong className="cashier-grand-total">{money(total)}</strong>
          <p>Promoções e descontos definitivos são calculados na conferência do pagamento.</p>
        </div>
        <button className="cashier-receive" type="button" disabled={!canReceive}
          onClick={()=>openPayment()}><Wallet size={22}/> Receber pagamento <kbd>F5</kbd></button>
        <div className="cashier-methods">
          <button type="button" disabled={!canReceive} onClick={()=>openPayment('pix')}>
            <span className="cashier-pix-symbol">◆</span><strong>Pix</strong><kbd>F6</kbd></button>
          <button type="button" disabled={!canReceive} onClick={()=>openPayment('card')}>
            <CreditCard size={24}/><strong>Cartão</strong><kbd>F7</kbd></button>
          <button type="button" disabled={!canReceive} onClick={()=>openPayment('cash')}>
            <Banknote size={24}/><strong>Dinheiro</strong><kbd>F8</kbd></button>
          <button className="cashier-other" type="button" disabled={!canReceive}
            onClick={()=>openPayment()}><Keyboard size={17}/><strong>Outros</strong><kbd>F10</kbd></button>
        </div>
        {!sessionOpen&&<button className="cashier-open-session" onClick={onCash} type="button">
          Abrir caixa para receber</button>}
        <section className="cashier-hold-panel" aria-label="Vendas em espera">
          <label className="cashier-hold-label">Identificar venda (opcional)
            <input aria-label="Identificar venda em espera" maxLength={60}
              placeholder="Ex.: balcão 2" value={holdLabel}
              onChange={event=>setHoldLabel(event.target.value)}/>
          </label>
          <button className="cashier-hold-button" type="button" disabled={!cart.length}
            onClick={()=>{onHold(holdLabel);setHoldLabel('');}}>
            <BookmarkPlus size={18}/> Colocar em espera <kbd>F9</kbd>
          </button>
          <button className="cashier-held-toggle" type="button"
            aria-expanded={heldOpen} onClick={()=>setHeldOpen(value=>!value)}>
            <Clock3 size={17}/> Vendas em espera ({heldSales.length}) <kbd>F11</kbd>
          </button>
          {heldOpen&&<div className="cashier-held-list">
            {!heldSales.length&&<p>Nenhuma venda em espera neste terminal.</p>}
            {heldSales.map(sale=><div className="cashier-held-row" key={sale.id}>
              <div><strong>{sale.label}</strong>
                <small>{sale.items.length} itens · {new Date(sale.createdAt).toLocaleString('pt-BR')}</small>
              </div>
              <button type="button" disabled={cart.length>0}
                aria-label={'Retomar '+sale.label} onClick={()=>onResumeHeld(sale.id)}>Retomar</button>
              <button type="button" className="cashier-held-delete"
                aria-label={'Excluir espera '+sale.label} onClick={()=>onRemoveHeld(sale.id)}>
                <Trash2 size={16}/></button>
            </div>)}
            {heldSales.length>0&&cart.length>0&&<p>Guarde ou limpe o carrinho atual para retomar outra venda.</p>}
          </div>}
        </section>
        <div className="cashier-safe-note"><CheckCircle2 size={16}/>
          <span><strong>Operação não fiscal.</strong> Em espera não reserva estoque nem congela preços. Pix e cartão exigem confirmação externa.</span>
        </div>
      </aside>
      </div>
    </div>
  </section>;
}
