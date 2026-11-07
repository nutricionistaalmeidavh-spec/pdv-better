/**
 * Converte JPG/PNG/WebP em JPEG compacto, inteiramente no Electron local.
 * Nunca faz upload nem chama serviços externos; SQLite mantém a imagem no backup.
 */
export async function encodeProductImage(file:File):Promise<string>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))
    throw new Error('Selecione uma foto JPG, PNG ou WebP.');
  if(file.size>8*1024*1024)throw new Error('A foto original deve ter no máximo 8 MB.');
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();
    image.src=url;
    try{await image.decode();}
    catch{throw new Error('Não foi possível ler a imagem. Escolha outro arquivo.');}
    if(!image.naturalWidth||!image.naturalHeight)throw new Error('Imagem vazia ou inválida.');
    for(const maxSide of [360,300,240,180,128]){
      const ratio=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
      const width=Math.max(1,Math.round(image.naturalWidth*ratio));
      const height=Math.max(1,Math.round(image.naturalHeight*ratio));
      const canvas=document.createElement('canvas');
      canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d',{alpha:false});
      if(!ctx)throw new Error('Não foi possível preparar a miniatura.');
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
      ctx.drawImage(image,0,0,width,height);
      for(const quality of [.80,.68,.56,.44]){
        const data=canvas.toDataURL('image/jpeg',quality);
        if(data.length<=85000)return data;
      }
    }
    throw new Error('A foto não pôde ser compactada para uso offline.');
  }finally{URL.revokeObjectURL(url);}
}
