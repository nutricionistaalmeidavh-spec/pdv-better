// Datas e indicadores gerenciais sempre no relógio/fuso do computador que executa o PDV.
// Instantes de venda permanecem em UTC no SQLite para preservar a rastreabilidade.
export function localDateKey(value){
  if(value==null||value==='')return '';
  const date=value instanceof Date?value:new Date(value);
  if(!Number.isFinite(date.getTime()))return '';
  const pad=number=>String(number).padStart(2,'0');
  return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());
}

export function localDateTimeLabel(value){
  if(!value)return '—';
  const date=value instanceof Date?value:new Date(value);
  if(!Number.isFinite(date.getTime()))return '—';
  return date.toLocaleString('pt-BR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

export function reportDailySales(sales,clock=new Date(),days=7){
  if(!Number.isInteger(days)||days<1||days>366)throw new Error('Período de gráfico inválido.');
  const reference=clock instanceof Date?clock:new Date(clock);
  if(!Number.isFinite(reference.getTime()))throw new Error('Data do computador inválida.');
  // Meio-dia local evita trocar o dia durante mudanças de horário de verão.
  const noon=new Date(reference.getFullYear(),reference.getMonth(),reference.getDate(),12,0,0);
  const result=Array.from({length:days},(_,i)=>{
    const date=new Date(noon);date.setDate(noon.getDate()-(days-1-i));
    return {key:localDateKey(date),label:date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}),amount:0};
  });
  const byKey=new Map(result.map(d=>[d.key,d]));
  for(const sale of sales||[]){
    if(sale.status!=='completed'||sale.is_training)continue;
    const day=byKey.get(localDateKey(sale.created_at));
    if(day)day.amount+=Number(sale.total_cents||0);
  }
  return result;
}

export function reportPaymentBreakdown(summary={}){
  const cents=key=>{
    const n=Number(summary[key]??0);
    if(!Number.isSafeInteger(n)||n<0)throw new Error('Valor de relatório inválido: '+key);
    return n;
  };
  const paymentMethods=[
    {name:'Dinheiro',amount:cents('cash_cents'),color:'#0d51c5'},
    {name:'Pix informado',amount:cents('pix_cents'),color:'#178de5'},
    {name:'Cartão informado',amount:cents('card_cents')+cents('card_credit_cents')+cents('card_debit_cents'),color:'#65b9f5'}
  ];
  const recordedPaymentCents=paymentMethods.reduce((sum,p)=>sum+p.amount,0);
  const creditSaleCents=cents('credit_cents');
  const openReceivablesCents=cents('receivables_open_cents');
  const totalSalesCents=cents('sales_total_cents');
  const differenceCents=totalSalesCents-recordedPaymentCents-creditSaleCents;
  return {paymentMethods,recordedPaymentCents,creditSaleCents,openReceivablesCents,totalSalesCents,differenceCents};
}
