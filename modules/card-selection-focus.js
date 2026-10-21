// UI-only focus visualisation. Does not modify the original image, mask, or print files.
// Returns two RGBA images to be composited above the card: an alpha-only
// cutout used to lift the dark veil and a translucent visible silhouette.
export function createSelectionFocusAssets(mask){
  const width=Number(mask?.width)||0,height=Number(mask?.height)||0;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||
     width*height>4_000_000||!mask?.alpha||mask.alpha.length!==width*height){
    throw new Error('Masque de sélection invalide');
  }
  const cutout=new Uint8ClampedArray(width*height*4);
  const visible=new Uint8ClampedArray(width*height*4);
  const isText=mask.mode==='text';
  const a=mask.alpha;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=y*width+x,k=p*4,coverage=a[p];
    if(!coverage)continue;
    cutout[k]=cutout[k+1]=cutout[k+2]=255;
    cutout[k+3]=coverage;
    // Outline each independent glyph, rather than enclosing an entire word.
    const edge=x===0||y===0||x===width-1||y===height-1||
      a[p-1]<128||a[p+1]<128||a[p-width]<128||a[p+width]<128;
    if(edge){
      visible[k]=isText?37:255;visible[k+1]=isText?255:213;visible[k+2]=isText?222:32;
      visible[k+3]=Math.round(coverage*.99);
    }else{
      visible[k]=12;visible[k+1]=216;visible[k+2]=239;
      visible[k+3]=Math.round(coverage*.44);
    }
  }
  return {width,height,cutout,visible};
}
