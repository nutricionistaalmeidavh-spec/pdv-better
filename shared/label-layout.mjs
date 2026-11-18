import { money } from './domain.mjs';

// Medidas em milímetros. O perfil de 58 mm é uma opção genérica para impressoras térmicas;
// confirme a altura e a área útil no driver e no rolo usado pelo estabelecimento.
export const LABEL_PROFILES=Object.freeze({
  '58x30':Object.freeze({widthMm:58,heightMm:30}),
  '40x30':Object.freeze({widthMm:40,heightMm:30}),
  '50x30':Object.freeze({widthMm:50,heightMm:30}),
  '60x40':Object.freeze({widthMm:60,heightMm:40})
});
export const DEFAULT_LABEL_PROFILE='50x30';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
function mm(value,label,min,max){
  const num=Number(value);
  if(!Number.isFinite(num)||num<min||num>max)throw new Error(label+' da etiqueta deve estar entre '+min+' e '+max+' mm.');
  return Math.round(num*10)/10;
}
export function normalizeLabelSettings(input={}){
  const profile=String(input.labelProfile||DEFAULT_LABEL_PROFILE);
  const labelProfile=profile==='custom'||Object.hasOwn(LABEL_PROFILES,profile)?profile:DEFAULT_LABEL_PROFILE;
  const preset=LABEL_PROFILES[labelProfile];
  const widthMm=preset?.widthMm??mm(input.labelWidthMm,'Largura',25,100);
  const heightMm=preset?.heightMm??mm(input.labelHeightMm,'Altura',15,100);
  const marginMm=mm(input.labelMarginMm??3,'Margem',0,6);
  if(marginMm*2>=Math.min(widthMm,heightMm)-6)throw new Error('Margem da etiqueta grande demais para caber o conteúdo.');
  return {labelProfile,widthMm,heightMm,marginMm};
}
export function renderLabelDocument(product,input={}){
  if(!product)throw new Error('Produto ausente para etiqueta.');
  const {widthMm,heightMm,marginMm}=normalizeLabelSettings(input);
  const compact=widthMm<45;
  const nameSize=compact?11:13;
  const priceSize=compact?16:20;
  return '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><style>'+
    '@page{size:'+widthMm+'mm '+heightMm+'mm;margin:0}'+
    'html,body{margin:0;padding:0;width:'+widthMm+'mm;height:'+heightMm+'mm;overflow:hidden;background:#fff;color:#111}'+
    '*,*::before,*::after{box-sizing:border-box}'+
    '.label{width:'+widthMm+'mm;height:'+heightMm+'mm;overflow:hidden;padding:'+marginMm+'mm;'+
    'display:flex;flex-direction:column;gap:1mm;font-family:Arial,sans-serif;break-inside:avoid;page-break-inside:avoid}'+
    '.label-name{font-size:'+nameSize+'px;font-weight:700;line-height:1.12;overflow:hidden;word-break:break-word;'+
    'display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}'+
    '.label-code{font-size:10px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
    '.label-price{font-size:'+priceSize+'px;font-weight:800;line-height:1.08;white-space:nowrap;'+
    'overflow:hidden;margin-top:auto;letter-spacing:-.25px}'+
    '</style></head><body><div class="label">'+
    '<div class="label-name">'+escapeHtml(product.name)+'</div>'+
    '<div class="label-code">'+escapeHtml(product.code||'Sem código')+'</div>'+
    '<div class="label-price">'+escapeHtml(money(product.sale_price_cents))+'</div>'+
    '</div></body></html>';
}
