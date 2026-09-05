import {
  extractVideoFrames as baseExtractVideoFrames,
  downloadExtractedFrame,
  showPixVerseFramesInSimulator,
  stopPixVerseSimulatorPreview
} from './video-frame-extractor.js?v=409';

const delay = ms => new Promise(r => setTimeout(r, ms));

function makeVideo(src) {
  const v = document.createElement('video');
  v.preload = 'auto';
  v.muted = true;
  v.playsInline = true;
  v.style.position = 'fixed';
  v.style.left = '-9999px';
  v.style.width = '2px';
  v.style.height = '2px';
  v.src = src;
  document.body.appendChild(v);
  try { v.load(); } catch (_) {}
  return v;
}

function destroyVideo(v) {
  if (!v) return;
  try { v.pause(); } catch (_) {}
  v.removeAttribute('src');
  try { v.load(); } catch (_) {}
  v.remove();
}

function waitEvent(target, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      target.removeEventListener(event, onOk);
      target.removeEventListener('error', onErr);
      err ? reject(err) : resolve();
    };
    const onOk = () => finish();
    const onErr = () => finish(new Error(`Erreur vidéo pendant ${event}.`));
    const timer = setTimeout(() => finish(new Error(`Délai dépassé pendant ${event}.`)), timeoutMs);
    target.addEventListener(event, onOk, { once: true });
    target.addEventListener('error', onErr, { once: true });
  });
}

async function ensureMetadata(video) {
  if (Number.isFinite(video.duration) && video.duration > 0 && video.videoWidth > 0) return;
  await waitEvent(video, 'loadedmetadata', 10000);
}

async function safeSeek(video, time) {
  const duration = Number(video.duration) || 0;
  const target = Math.max(0, Math.min(Math.max(0, duration - 0.02), time));
  if (Math.abs((Number(video.currentTime) || 0) - target) > 0.004) {
    const p = waitEvent(video, 'seeked', 3500);
    video.currentTime = target;
    await p;
  }
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await delay(35);
}

function canvasDataUrl(video) {
  const w = Math.max(2, video.videoWidth || 0);
  const h = Math.max(2, video.videoHeight || 0);
  if (w <= 2 || h <= 2) throw new Error('Dimensions vidéo invalides.');
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { alpha: false });
  ctx.drawImage(video, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.96);
}

async function extractShortClip(video, options = {}) {
  await ensureMetadata(video);
  const duration = Number(video.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Durée vidéo invalide.');

  const count = Math.max(2, Math.min(9, Number(options.count) || 9));
  const edge = Math.min(0.06, Math.max(0.025, duration * 0.02));
  const start = edge;
  const end = Math.max(start, duration - edge);
  const dataUrls = [];
  const frames = [];

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? duration / 2 : start + (end - start) * (i / (count - 1));
    await safeSeek(video, t);
    const dataUrl = canvasDataUrl(video);
    dataUrls.push(dataUrl);
    frames.push({ index: i + 1, time: t, dataUrl, url: dataUrl });
    if (typeof options.onProgress === 'function') options.onProgress({ current: i + 1, total: count, time: t });
  }

  return {
    dataUrls,
    frames,
    duration,
    extractionWindow: {
      mode: 'pixverse-2s-ipad-direct-9',
      start,
      end,
      count,
      progressiveOnly: true,
      calculatedBeforeExtraction: true
    }
  };
}

async function extractFromVideo(video, options = {}) {
  await ensureMetadata(video);
  const duration = Number(video?.duration);
  if (Number.isFinite(duration) && duration > 0 && duration <= 2.35) {
    return extractShortClip(video, { ...options, count: options.count ?? 9 });
  }
  return baseExtractVideoFrames(video, options);
}

async function fetchAsObjectUrl(src) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const r = await fetch(src, { cache: 'no-store', signal: controller.signal });
    if (!r.ok) {
      const msg = await r.text().catch(() => '');
      throw new Error(`Chargement vidéo HTTP ${r.status}${msg ? ` — ${msg.slice(0, 120)}` : ''}`);
    }
    const blob = await r.blob();
    if (!blob.size) throw new Error('Vidéo vide reçue depuis HappyHolo.');
    return URL.createObjectURL(blob);
  } finally {
    clearTimeout(timer);
  }
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Image de simulation illisible.'));
    im.src = src;
  });
}

function collectCardLayers() {
  const boxes = [...document.querySelectorAll('#overlay .box')];
  const cards = [...document.querySelectorAll('#layers .layer')];
  return boxes.map((box, i) => {
    const depth = Number(cards[i]?.querySelector('input.depth')?.value || 0);
    return {
      bbox: [
        parseFloat(box.style.left || 0) / 100,
        parseFloat(box.style.top || 0) / 100,
        parseFloat(box.style.width || 0) / 100,
        parseFloat(box.style.height || 0) / 100
      ],
      depth,
      grouped: box.classList.contains('grouped') || cards[i]?.classList.contains('grouped'),
      type: [...box.classList].find(x => ['text','logo','object','subject'].includes(x)) || 'object'
    };
  });
}

function unionBbox(items, pad = .035) {
  if (!items.length) return null;
  let x1 = 1, y1 = 1, x2 = 0, y2 = 0;
  items.forEach(l => {
    const [x,y,w,h] = l.bbox;
    x1 = Math.min(x1,x); y1 = Math.min(y1,y);
    x2 = Math.max(x2,x+w); y2 = Math.max(y2,y+h);
  });
  x1 = clamp(x1-pad,0,1); y1 = clamp(y1-pad,0,1);
  x2 = clamp(x2+pad,0,1); y2 = clamp(y2+pad,0,1);
  return [x1,y1,x2-x1,y2-y1];
}

function rectPx(b, W, H) {
  return { x:Math.round(b[0]*W), y:Math.round(b[1]*H), w:Math.max(1,Math.round(b[2]*W)), h:Math.max(1,Math.round(b[3]*H)) };
}

function eraseRect(ctx, r, W, H) {
  const p = Math.max(4, Math.round(Math.min(W,H)*.006));
  const sx = clamp(r.x-p,0,W-1), sy = clamp(r.y-p,0,H-1);
  const sw = clamp(r.w+p*2,1,W-sx), sh = clamp(r.h+p*2,1,H-sy);
  const tmp = document.createElement('canvas'); tmp.width=sw; tmp.height=sh;
  const t = tmp.getContext('2d');
  t.drawImage(ctx.canvas,sx,sy,sw,sh,0,0,sw,sh);
  t.filter='blur(12px)'; t.drawImage(tmp,0,0,sw,sh);
  ctx.save(); ctx.beginPath(); ctx.rect(r.x,r.y,r.w,r.h); ctx.clip();
  ctx.drawImage(tmp,0,0,sw,sh,sx,sy,sw,sh); ctx.restore();
}

function median(values) {
  if (!values.length) return 255;
  const a=[...values].sort((x,y)=>x-y), m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}

function maskedAnimatedPatch(animImg, originalCanvas, layer, union, W, H) {
  const r = rectPx(layer.bbox,W,H);
  const [ux,uy,uw,uh] = union;
  const relX=(layer.bbox[0]-ux)/uw, relY=(layer.bbox[1]-uy)/uh;
  const relW=layer.bbox[2]/uw, relH=layer.bbox[3]/uh;
  const sx=clamp(Math.round(relX*animImg.naturalWidth),0,animImg.naturalWidth-1);
  const sy=clamp(Math.round(relY*animImg.naturalHeight),0,animImg.naturalHeight-1);
  const sw=clamp(Math.round(relW*animImg.naturalWidth),1,animImg.naturalWidth-sx);
  const sh=clamp(Math.round(relH*animImg.naturalHeight),1,animImg.naturalHeight-sy);

  const tmp=document.createElement('canvas'); tmp.width=r.w; tmp.height=r.h;
  const t=tmp.getContext('2d');
  t.drawImage(animImg,sx,sy,sw,sh,0,0,r.w,r.h);
  const animated=t.getImageData(0,0,r.w,r.h);
  const orig=originalCanvas.getContext('2d').getImageData(r.x,r.y,r.w,r.h);

  const rs=[],gs=[],bs=[];
  const step=Math.max(1,Math.floor(Math.min(r.w,r.h)/80));
  for(let x=0;x<r.w;x+=step){
    for(const y of [0,Math.max(0,r.h-1)]){const k=(y*r.w+x)*4;rs.push(orig.data[k]);gs.push(orig.data[k+1]);bs.push(orig.data[k+2]);}
  }
  for(let y=0;y<r.h;y+=step){
    for(const x of [0,Math.max(0,r.w-1)]){const k=(y*r.w+x)*4;rs.push(orig.data[k]);gs.push(orig.data[k+1]);bs.push(orig.data[k+2]);}
  }
  const br=median(rs), bg=median(gs), bb=median(bs);
  for(let k=0;k<animated.data.length;k+=4){
    const dr=orig.data[k]-br, dg=orig.data[k+1]-bg, db=orig.data[k+2]-bb;
    const dist=Math.sqrt(dr*dr+dg*dg+db*db);
    const lum=.299*orig.data[k]+.587*orig.data[k+1]+.114*orig.data[k+2];
    const darkBoost=clamp((205-lum)/85,0,1);
    const alpha=clamp(Math.max((dist-16)/50,darkBoost*.82),0,1);
    animated.data[k+3]=Math.round(255*alpha);
  }
  t.putImageData(animated,0,0);
  return {canvas:tmp, rect:r};
}

async function rebuildCardViews(extractionResult, depthScale=1) {
  const src=document.getElementById('cardImg');
  if (!src?.src) throw new Error('Carte source absente.');
  const original=await loadImage(src.src);
  const frameUrls=extractionResult?.dataUrls || extractionResult?.frames?.map(f=>f.dataUrl||f.url) || [];
  if(frameUrls.length!==9) throw new Error('9 images PixVerse requises.');
  const animImgs=await Promise.all(frameUrls.map(loadImage));
  const layers=collectCardLayers();
  const grouped=layers.filter(l=>l.grouped);
  const union=unionBbox(grouped,.035);
  const W=original.naturalWidth,H=original.naturalHeight;
  const originalCanvas=document.createElement('canvas'); originalCanvas.width=W; originalCanvas.height=H;
  originalCanvas.getContext('2d').drawImage(original,0,0,W,H);
  const outputs=[];

  for(let i=0;i<9;i++){
    const phase=(i-4)/4, c=document.createElement('canvas'); c.width=W;c.height=H;
    const ctx=c.getContext('2d'); ctx.drawImage(original,0,0,W,H);
    const staticMoved=layers.filter(l=>!l.grouped&&l.depth!==0);
    for(const l of staticMoved) eraseRect(ctx,rectPx(l.bbox,W,H),W,H);
    for(const l of grouped) eraseRect(ctx,rectPx(l.bbox,W,H),W,H);

    for(const l of staticMoved){
      const r=rectPx(l.bbox,W,H), shift=Math.round((l.depth/100)*phase*W*.012*depthScale);
      ctx.drawImage(original,r.x,r.y,r.w,r.h,r.x+shift,r.y,r.w,r.h);
    }
    if(union){
      for(const l of grouped){
        const patch=maskedAnimatedPatch(animImgs[i],originalCanvas,l,union,W,H);
        const shift=Math.round((l.depth/100)*phase*W*.012*depthScale);
        ctx.drawImage(patch.canvas,patch.rect.x+shift,patch.rect.y,patch.rect.w,patch.rect.h);
      }
    }
    outputs.push(c.toDataURL('image/png'));
  }
  return outputs;
}

function drawUrlToCanvas(url) {
  const c=document.getElementById('simCanvas');
  if(!c) return;
  loadImage(url).then(im=>{
    const box=c.getBoundingClientRect(), d=Math.min(2,devicePixelRatio||1);
    c.width=Math.max(2,Math.round(box.width*d)); c.height=Math.max(2,Math.round(box.height*d));
    const ctx=c.getContext('2d'), k=Math.min(c.width/im.naturalWidth,c.height/im.naturalHeight);
    const w=im.naturalWidth*k,h=im.naturalHeight*k;
    ctx.fillStyle='#111';ctx.fillRect(0,0,c.width,c.height);
    ctx.drawImage(im,(c.width-w)/2,(c.height-h)/2,w,h);
  }).catch(()=>{});
}

function dataUrlToBlob(dataUrl){
  const [meta,data]=dataUrl.split(','), mime=(meta.match(/data:([^;]+)/)||[])[1]||'image/png';
  const bin=atob(data), bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  return new Blob([bytes],{type:mime});
}

function installGeneralSimulation(actualViews, previewViews) {
  const result=document.getElementById('resultCard');
  const range=document.getElementById('viewRange');
  const out=document.getElementById('viewOut');
  const frames=document.getElementById('frames');
  const download=document.getElementById('download');
  const status=document.getElementById('finalStatus');
  if(!result||!range||!out||!frames) return;

  frames.querySelectorAll('img').forEach((img,i)=>{if(actualViews[i]) img.src=actualViews[i];});
  let current=4,dir=1,timer=0,playing=true;
  const draw=i=>{current=clamp(i,0,8);range.value=String(current);out.textContent=`${current+1} / 9`;drawUrlToCanvas(previewViews[current]);};
  range.oninput=()=>{playing=false;syncBtn();draw(Number(range.value)||0);};

  let bar=document.getElementById('generalDepthSimBar');
  if(!bar){
    bar=document.createElement('div');bar.id='generalDepthSimBar';
    bar.style.cssText='display:grid;grid-template-columns:1fr 1.4fr;gap:8px;align-items:center;margin:10px 0;padding:9px;border-radius:11px;background:#eef7ef;border:1px solid #9bc8a5';
    bar.innerHTML='<button id="generalDepthToggle" type="button" style="margin:0;background:#17652c">Pause simulation générale</button><div style="font-size:11px;line-height:1.35"><b>Profondeurs + animation</b><br>Aperçu relief ×3 pour rendre les plans visibles. Le ZIP reste à l’amplitude réelle.</div>';
    result.querySelector('.sim')?.after(bar);
  }
  const btn=document.getElementById('generalDepthToggle');
  const syncBtn=()=>{if(btn)btn.textContent=playing?'Pause simulation générale':'▶ Simulation générale';};
  if(btn)btn.onclick=()=>{playing=!playing;syncBtn();};
  clearInterval(window.__hhGeneralDepthTimer);
  window.__hhGeneralDepthTimer=setInterval(()=>{
    if(!playing) return;
    current+=dir;
    if(current>=8){current=8;dir=-1}else if(current<=0){current=0;dir=1}
    draw(current);
  },180);
  draw(4);syncBtn();

  if(download){
    download.onclick=async()=>{
      if(!window.JSZip) return;
      const zip=new window.JSZip();
      actualViews.forEach((u,i)=>zip.file(`vue-${String(i+1).padStart(2,'0')}.png`,dataUrlToBlob(u)));
      zip.file('manifest.json',JSON.stringify({app:'HappyHolo',type:'business-card-clean-mask-depth-9-views',created:new Date().toISOString(),note:'Masque PixVerse nettoyé; simulation relief x3 uniquement visuelle.'},null,2));
      const blob=await zip.generateAsync({type:'blob',compression:'STORE'}),a=document.createElement('a');
      a.href=URL.createObjectURL(blob);a.download=`happyholo-carte-9-vues-${Date.now()}.zip`;a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),5000);
      if(status)status.textContent='ZIP 9 vues téléchargé — masque logo nettoyé.';
    };
  }
  if(status){status.className='status ok';status.textContent='9 vues générées · simulation générale des profondeurs active · masque gris PixVerse supprimé.';}
}

async function enhanceBusinessCardResult(extractionResult) {
  try{
    const result=document.getElementById('resultCard');
    if(!result) return;
    for(let i=0;i<35;i++){
      if(!result.classList.contains('hidden') && document.querySelectorAll('#frames img').length===9) break;
      await delay(180);
    }
    const actual=await rebuildCardViews(extractionResult,1);
    const preview=await rebuildCardViews(extractionResult,3);
    installGeneralSimulation(actual,preview);
    result.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){
    const s=document.getElementById('finalStatus');
    if(s){s.className='status warn';s.textContent=`Simulation générale non appliquée : ${e.message}`;}
  }
}

function triggerBusinessCardSimulation(extractionResult) {
  const prepare = document.getElementById('prepare');
  const result = document.getElementById('resultCard');
  if (!prepare || !result) return;
  setTimeout(() => {
    if (!prepare.disabled) prepare.click();
    setTimeout(()=>enhanceBusinessCardResult(extractionResult),220);
  }, 120);
}

export async function extractVideoFrames(videoOrUrl, options = {}) {
  if (typeof videoOrUrl !== 'string') {
    const result = await extractFromVideo(videoOrUrl, options);
    triggerBusinessCardSimulation(result);
    return result;
  }

  const source = String(videoOrUrl || '').trim();
  if (!source) throw new Error('URL vidéo PixVerse manquante.');

  const sameOrigin = source.startsWith(location.origin) || source.startsWith('/');
  const candidates = sameOrigin ? [source] : [`/api/pixverse-video?url=${encodeURIComponent(source)}`, source];

  let lastError = null;
  for (const src of candidates) {
    let video = null;
    let objectUrl = '';
    try {
      if (src.startsWith('/') || src.startsWith(location.origin)) {
        objectUrl = await fetchAsObjectUrl(src);
        video = makeVideo(objectUrl);
      } else {
        video = makeVideo(src);
        video.crossOrigin = 'anonymous';
      }
      const result = await extractFromVideo(video, options);
      triggerBusinessCardSimulation(result);
      return result;
    } catch (e) {
      lastError = e;
    } finally {
      destroyVideo(video);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  throw lastError || new Error('Lecture de la vidéo PixVerse impossible.');
}

export {
  downloadExtractedFrame,
  showPixVerseFramesInSimulator,
  stopPixVerseSimulatorPreview
};
