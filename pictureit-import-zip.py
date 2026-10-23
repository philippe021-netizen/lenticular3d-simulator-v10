"""Import a generic MicroPlayer ZIP into a safe Picture It session.
No destructive UI actions. The original RGB image is never overwritten.
"""
from pathlib import Path
from io import BytesIO
from PIL import Image
import zipfile,json,re
def process_zip(source_bytes,archive_bytes,destination):
 destination=Path(destination);destination.mkdir(parents=True,exist_ok=False)
 source=Image.open(BytesIO(source_bytes)).convert('RGB')
 source.save(destination/'PHOTO_ORIGINALE_COPIE.png')
 pairs={}
 with zipfile.ZipFile(BytesIO(archive_bytes)) as z:
  for member in z.infolist():
   name=Path(member.filename).name
   if not name.lower().endswith('.png'):continue
   if member.file_size>16_000_000:raise ValueError('Fichier PNG trop volumineux')
   m=re.match(r'^(\d+)_([a-zA-Z0-9_-]+)_(detoure|masque)\.png$',name,re.I)
   if not m:continue
   key=m.group(1)+'_'+m.group(2)
   data=z.read(member)
   im=Image.open(BytesIO(data));im.load()
   if im.size!=source.size:raise ValueError(name+': dimensions incompatibles avec la photo source')
   pairs.setdefault(key,{})[m.group(3).lower()]=im.convert('RGBA')
 if not pairs:raise ValueError('Aucun detourage dans ce ZIP')
 info=[]
 for key,files in pairs.items():
  if 'detoure' not in files or 'masque' not in files:raise ValueError('Paire incomplete: '+key)
  cut=files['detoure'];mask=files['masque']
  cut.save(destination/(key+'_detoure.png'))
  mask.save(destination/(key+'_masque.png'))
  info.append({'name':key,'cutout':key+'_detoure.png','mask':key+'_masque.png'})
 (destination/'MANIFEST.json').write_text(json.dumps({'source':'PHOTO_ORIGINALE_COPIE.png','subjects':info,'pictureit':'Open the source copy in Microsoft Photo Pro 10; import individual PNG layers. Native erasure needs visual confirmation.'},indent=2),encoding='utf8')
 return info
