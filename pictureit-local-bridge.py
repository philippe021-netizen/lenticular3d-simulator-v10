"""MicroPlayer local bridge. Binds to 127.0.0.1 only; no unattended GUI clicks.
Requires a per-launch token and explicit user validation of the overlay.
"""
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from pathlib import Path
import base64,datetime,json,os,secrets,subprocess,sys
ROOT=Path(__file__).resolve().parent
ENGINE=Path.home()/'lenticular-gen-test'/'lenticular_gen'
OUTPUT=ENGINE/'pictureit_web_sessions'
TOKEN=secrets.token_urlsafe(24)
ORIGINS={'https://lenticular3d-simulator-v10.vercel.app','http://localhost:8000','http://127.0.0.1:8000'}
MAX=24*1024*1024
class Handler(BaseHTTPRequestHandler):
 def origin(self):
  o=self.headers.get('Origin','')
  return o if o in ORIGINS else ''
 def cors(self):
  self.send_header('Access-Control-Allow-Origin',self.origin() or 'null')
  self.send_header('Vary','Origin')
  self.send_header('Access-Control-Allow-Headers','Content-Type,X-MicroPlayer-Token')
  self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS')
  self.send_header('Access-Control-Allow-Private-Network','true')
 def reply(self,status,data):
  raw=json.dumps(data,ensure_ascii=False).encode('utf8')
  self.send_response(status);self.cors();self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
 def do_OPTIONS(self):
  if not self.origin():return self.reply(403,{'error':'Origin not allowed'})
  self.send_response(204);self.cors();self.end_headers()
 def authorized(self):
  return self.origin() and secrets.compare_digest(self.headers.get('X-MicroPlayer-Token',''),TOKEN)
 def do_GET(self):
  if self.path!='/health':return self.reply(404,{'error':'Not found'})
  return self.reply(200,{'ok':True,'requires_token':True,'pictureit':'local Windows only'})
 def do_POST(self):
  if self.path not in ('/prepare','/render'):return self.reply(404,{'error':'Not found'})
  if not self.authorized():return self.reply(403,{'error':'Origin or token rejected'})
  try:
   n=int(self.headers.get('Content-Length','0'))
   if not 0<n<MAX:raise ValueError('Upload size not allowed')
   payload=json.loads(self.rfile.read(n))
   if payload.get('confirmed') is not True:raise ValueError('Overlay validation required')
   if self.path=='/render':
    if not payload.get('confirmed'):raise ValueError('Visual approval required')
    key=payload.get('session','')
    if not isinstance(key,str) or not key.startswith('web_') or not key.replace('_','').isalnum():raise ValueError('Invalid session')
    folder=(OUTPUT/key).resolve()
    if folder.parent!=OUTPUT.resolve() or not folder.is_dir():raise ValueError('Session not found')
    from PIL import Image
    from io import BytesIO
    bg_data=base64.b64decode(payload.get('background',''),validate=True)
    if len(bg_data)>8*1024*1024:raise ValueError('Background too large')
    bg=Image.open(BytesIO(bg_data));bg.verify()
    bg_path=folder/'background.png';bg_path.write_bytes(bg_data)
    from PIL import Image
    if Image.open(bg_path).size!=Image.open(folder/'source.png').size:raise ValueError('Background dimensions mismatch')
    outputs=folder/'output'
    args=[str(ENGINE/'.venv/Scripts/python.exe'),str(ROOT/'pictureit-nine-views.py'),'--source',str(folder/'source.png'),'--franck',str(outputs/'franck_guitare.png'),'--kathy',str(outputs/'kathy.png'),'--background',str(bg_path),'--output',str(folder/'views')]
    result=subprocess.run(args,capture_output=True,text=True,timeout=60)
    (folder/'render.log').write_text(result.stdout+'\n'+result.stderr,encoding='utf8')
    if result.returncode:raise RuntimeError(result.stderr[-500:])
    return self.reply(200,{'ok':True,'folder':str(folder/'views'),'views':9,'warning':'Preview only; not print-calibrated'})

   stamp=datetime.datetime.now().strftime('%Y%m%d_%H%M%S_%f')
   out=OUTPUT/('web_'+stamp);out.mkdir(parents=True,exist_ok=False)
   for key in ('source','franck','kathy'):
    data=base64.b64decode(payload[key],validate=True)
    if len(data)>8*1024*1024:raise ValueError('Image too large')
    from PIL import Image
    from io import BytesIO
    image=Image.open(BytesIO(data));image.verify()
    (out/(key+'.png')).write_bytes(data)
   from PIL import Image
   images=[Image.open(out/(k+'.png')) for k in ('source','franck','kathy')]
   if any(im.size!=images[0].size for im in images):raise ValueError('Image dimensions differ')
   if images[0].width*images[0].height>25000000:raise ValueError('Image too large')
   # Use existing tested export script; source and alpha masks never retouch original RGB pixels.
   args=[str(ENGINE/'.venv/Scripts/python.exe'),str(ENGINE/'pictureit_export_test.py'),'--source',str(out/'source.png'),'--franck-mask',str(out/'franck.png'),'--kathy-mask',str(out/'kathy.png'),'--output',str(out/'output')]
   result=subprocess.run(args,cwd=ENGINE,capture_output=True,text=True,timeout=90)
   (out/'process.log').write_text(result.stdout+'\n'+result.stderr,encoding='utf8')
   if result.returncode:raise RuntimeError(result.stderr[-600:])
   return self.reply(200,{'ok':True,'session':out.name,'folder':str(out/'output'),'message':'Two RGBA subjects exported. Picture It native erasure still requires separate confirmation.'})
  except Exception as exc:return self.reply(400,{'error':str(exc)})
 def log_message(self,fmt,*args):print(fmt%args)
if __name__=='__main__':
 print('MicroPlayer Picture It local bridge on http://127.0.0.1:8765',flush=True)
 print('TOKEN:',TOKEN,flush=True)
 ThreadingHTTPServer(('127.0.0.1',8765),Handler).serve_forever()
