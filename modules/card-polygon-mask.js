// Converts a Pencil lasso in normalized image coordinates into a tight alpha mask.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function polygonMaskFromPoints(points,imageWidth,imageHeight,maxSize=900){
 if(!Array.isArray(points)||points.length<3)throw new Error('Il faut au moins trois points pour fermer le contour.');
 if(!Number.isFinite(imageWidth)||!Number.isFinite(imageHeight)||imageWidth<1||imageHeight<1)throw new Error('Dimensions d’image incorrectes.');
 const contour=points.map(point=>{
  if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y))throw new Error('Point de contour incorrect.');
  return{x:clamp(point.x,0,1),y:clamp(point.y,0,1)};
 });
 const minX=Math.min(...contour.map(p=>p.x)),maxX=Math.max(...contour.map(p=>p.x));
 const minY=Math.min(...contour.map(p=>p.y)),maxY=Math.max(...contour.map(p=>p.y));
 const bbox=[minX,minY,maxX-minX,maxY-minY];
 if(bbox[2]*imageWidth<3||bbox[3]*imageHeight<3)throw new Error('Le contour est trop petit. Repasse le Pencil autour de la forme.');
 let twiceArea=0;
 for(let i=0;i<contour.length;i++){
  const a=contour[i],b=contour[(i+1)%contour.length];twiceArea+=a.x*b.y-b.x*a.y;
 }
 if(Math.abs(twiceArea)*imageWidth*imageHeight<6)throw new Error('Le contour est trop petit ou presque aligné.');
 const longest=Math.max(bbox[2]*imageWidth,bbox[3]*imageHeight),scale=Math.min(1,maxSize/longest);
 const width=Math.max(1,Math.round(bbox[2]*imageWidth*scale));
 const height=Math.max(1,Math.round(bbox[3]*imageHeight*scale));
 const local=contour.map(p=>({x:(p.x-minX)/bbox[2]*width,y:(p.y-minY)/bbox[3]*height}));
 const alpha=new Uint8Array(width*height),intersections=[];
 for(let y=0;y<height;y++){
  const scanY=y+.5;intersections.length=0;
  for(let i=0;i<local.length;i++){
   const a=local[i],b=local[(i+1)%local.length];
   if((a.y<=scanY&&b.y>scanY)||(b.y<=scanY&&a.y>scanY))
    intersections.push(a.x+(scanY-a.y)*(b.x-a.x)/(b.y-a.y));
  }
  intersections.sort((a,b)=>a-b);
  for(let i=0;i+1<intersections.length;i+=2){
   const start=Math.max(0,Math.ceil(intersections[i]-.5));
   const end=Math.min(width-1,Math.floor(intersections[i+1]-.5));
   for(let x=start;x<=end;x++)alpha[y*width+x]=255;
  }
 }
 const selected=alpha.reduce((sum,value)=>sum+(value?1:0),0);
 if(!selected)throw new Error('Aucun pixel dans le contour. Repasse le Pencil plus largement.');
 return{bbox,mask:{width,height,alpha,mode:'lasso',coverage:selected/alpha.length}};
}
