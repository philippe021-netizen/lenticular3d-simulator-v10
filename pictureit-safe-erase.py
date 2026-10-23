"""Safely run Picture It! native erasure on COPY, one subject at a time.
Requires separate operator confirmation per subject. Coordinates must be calibrated.
"""
from pathlib import Path
from PIL import Image
import cv2,numpy as np,json,time,argparse
from pywinauto import Desktop,keyboard,mouse
def main():
 a=argparse.ArgumentParser()
 a.add_argument('--mask',required=True,type=Path)
 a.add_argument('--copy-name',required=True)
 a.add_argument('--image-box',nargs=4,type=int,required=True)
 a.add_argument('--output',required=True,type=Path)
 a.add_argument('--commit',action='store_true')
 args=a.parse_args()
 args.output.mkdir(parents=True,exist_ok=True)
 wins=[x for x in Desktop(backend='uia').windows() if 'Microsoft Photo Pro' in x.window_text()]
 if len(wins)!=1:raise RuntimeError('Exactly one Picture It window required')
 w=wins[0]
 if not w.window_text().startswith(args.copy_name) or 'COPIE' not in args.copy_name.upper():raise RuntimeError('Work only on named COPY')
 rect=w.rectangle();l,t,width,height=args.image_box
 if l<rect.left or t<rect.top or l+width>rect.right or t+height>rect.bottom:raise RuntimeError('Image coordinates invalid')
 im=Image.open(args.mask).convert('RGBA')
 alpha=np.asarray(im.getchannel('A'))
 binary=cv2.dilate((alpha>96).astype('uint8'),cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(13,13)))
 contours,_=cv2.findContours(binary,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
 if not contours:raise RuntimeError('Empty mask')
 contour=max(contours,key=cv2.contourArea)
 pts=cv2.approxPolyDP(contour,2,True).reshape(-1,2)
 coords=[(round(l+x*width/im.width),round(t+y*height/im.height)) for x,y in pts]
 payload={'document':w.window_text(),'image_box':args.image_box,'points':len(coords),'commit':args.commit}
 (args.output/'plan.json').write_text(json.dumps(payload,indent=2),encoding='utf8')
 w.capture_as_image().save(str(args.output/'before.png'))
 if not args.commit:
  print(json.dumps(payload));return
 options=[x for x in w.descendants() if 'Effacement automatique' in x.window_text()]
 if not options:raise RuntimeError('Native erase tool missing')
 options[-1].click_input();time.sleep(.5)
 for pt in coords:mouse.click(coords=pt);time.sleep(.016)
 mouse.click(coords=coords[0]);time.sleep(.6)
 w.capture_as_image().save(str(args.output/'selection.png'))
 print('Selection captured; independent visual validation required before Fill. No fill performed.',flush=True)
if __name__=='__main__':main()
