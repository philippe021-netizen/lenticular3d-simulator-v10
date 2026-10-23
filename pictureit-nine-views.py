"""Generate non-destructive 9-view preview from validated masks and LaMa background."""
import argparse,json
from pathlib import Path
from PIL import Image,ImageChops,ImageDraw
def main():
 p=argparse.ArgumentParser()
 for name in ('source','franck','kathy','background','output'):p.add_argument('--'+name,required=True,type=Path)
 a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
 source=Image.open(a.source).convert('RGB');bg=Image.open(a.background).convert('RGBA')
 layers=[Image.open(a.franck).convert('RGBA'),Image.open(a.kathy).convert('RGBA')]
 if any(x.size!=source.size for x in [bg,*layers]):raise ValueError('Image size mismatch')
 for i in range(9):
  k=(i-4)/4;canvas=bg.copy()
  for layer,maxoffset in zip(layers,[12,20]):
   offset=round(k*maxoffset)
   shifted=ImageChops.offset(layer,offset,0)
   if offset>0:ImageDraw.Draw(shifted).rectangle((0,0,offset-1,source.height),fill=(0,0,0,0))
   elif offset<0:ImageDraw.Draw(shifted).rectangle((source.width+offset,0,source.width,source.height),fill=(0,0,0,0))
   canvas.alpha_composite(shifted)
  canvas.convert('RGB').save(a.output/f'vue_{i+1:02d}.png')
 (a.output/'NOTE_TEST.txt').write_text('9 vues de controle uniquement. Pas un interlacement calibre pour lenticulaire 50 LPI. Verifier masques, guitare et fond avant impression.',encoding='utf8')
 print(json.dumps({'views':9,'folder':str(a.output)}))
if __name__=='__main__':main()
