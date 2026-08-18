const $ = id => document.getElementById(id);
const imageInput = $('imageInput');
const mode3d = $('mode3d');
const modeAnim = $('modeAnim');
const animControls = $('animationControls');
const generateBtn = $('generateBtn');
const exportVideoBtn = $('exportVideoBtn');
const exportViewsBtn = $('exportViewsBtn');
const downloadVideo = $('downloadVideo');
const animGenerate = $('animGenerate');
const animExtract = $('animExtract');
const animDownloadZip = $('animDownloadZip');
const animPrompt = $('animPrompt');
const animQuality = $('animQuality');
const animDuration = $('animDuration');
const animVideo = $('animationVideo');
const animViews = $('animationViews');
const statusBox = $('status');
const bar = $('bar');

let currentMode = '3d';
let videoProxyUrl = null;
let extractedBlobs = [];

function setStatus(message, progress) {
  statusBox.textContent = message;
  if (Number.isFinite(progress)) bar.style.width = `${progress}%`;
}

function setMode(mode) {
  currentMode = mode;
  const isAnim = mode === 'animation';
  mode3d.classList.toggle('active', !isAnim);
  modeAnim.classList.toggle('active', isAnim);
  animControls.classList.toggle('active', isAnim);
  [generateBtn, exportVideoBtn, exportViewsBtn, downloadVideo].forEach(el => el?.classList.toggle('hidden-by-mode', isAnim));
  if (isAnim) {
    animGenerate.disabled = !(imageInput.files && imageInput.files[0]);
    setStatus('Mode Animation IA : décrivez une action courte et simple.', 0);
  } else {
    setStatus('Mode 3D actif.', 0);
  }
}

mode3d.addEventListener('click', () => setMode('3d'));
modeAnim.addEventListener('click', () => setMode('animation'));
imageInput.addEventListener('change', () => {
  if (currentMode === 'animation') {
    animGenerate.disabled = !(imageInput.files && imageInput.files[0]);
    setStatus(animGenerate.disabled ? 'Choisissez une photo.' : 'Photo prête. Décrivez maintenant l’action.', 5);
  }
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

animGenerate.addEventListener('click', async () => {
  const file = imageInput.files && imageInput.files[0];
  if (!file) return setStatus('Choisissez d’abord une photo.', 0);
  const prompt = animPrompt.value.trim();
  if (!prompt) return setStatus('Décrivez l’action à réaliser.', 0);

  animGenerate.disabled = true;
  animExtract.disabled = true;
  animDownloadZip.disabled = true;
  animViews.innerHTML = '';
  extractedBlobs = [];
  videoProxyUrl = null;
  animVideo.classList.remove('active');
  setStatus('Envoi de la photo à PixVerse…', 12);

  try {
    const fd = new FormData();
    fd.append('image', file, file.name || 'photo.jpg');
    const qs = new URLSearchParams({
      prompt,
      quality: animQuality.value,
      duration: animDuration.value
    });
    const create = await fetch(`/api/pixverse-create?${qs}`, { method: 'POST', body: fd });
    const created = await create.json();
    if (!create.ok || !created.ok) throw new Error(created.error || 'Création PixVerse impossible.');

    setStatus('PixVerse génère la micro-vidéo…', 28);
    let result = null;
    for (let i = 0; i < 80; i++) {
      await sleep(3000);
      const r = await fetch(`/api/pixverse-status?video_id=${encodeURIComponent(created.video_id)}`, { cache: 'no-store' });
      const s = await r.json();
      if (!r.ok || !s.ok) throw new Error(s.error || 'Lecture du statut impossible.');
      if (s.status === 1 && s.url) { result = s; break; }
      if (s.status === 7) throw new Error('PixVerse a refusé cette génération (modération).');
      if (s.status === 8) throw new Error('PixVerse n’a pas réussi cette génération.');
      setStatus(`Génération PixVerse en cours… ${Math.min(85, 30 + i)}%`, Math.min(85, 30 + i));
    }
    if (!result) throw new Error('PixVerse met trop longtemps à répondre. Réessayez dans quelques instants.');

    videoProxyUrl = `/api/pixverse-video?url=${encodeURIComponent(result.url)}`;
    animVideo.src = videoProxyUrl;
    animVideo.classList.add('active');
    animVideo.load();
    animExtract.disabled = false;
    setStatus('Micro-vidéo prête. Vérifiez-la puis extrayez les 9 vues.', 92);
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Erreur PixVerse.', 0);
  } finally {
    animGenerate.disabled = false;
  }
});

function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    const onSeek = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('Lecture vidéo impossible.')); };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeek);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeek, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.currentTime = Math.max(0, Math.min(time, Math.max(0, video.duration - 0.001)));
  });
}

function drawCover(ctx, video, size) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const side = Math.min(vw, vh);
  const sx = (vw - side) / 2;
  const sy = (vh - side) / 2;
  ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG impossible.')), 'image/png'));
}

animExtract.addEventListener('click', async () => {
  if (!videoProxyUrl) return;
  animExtract.disabled = true;
  extractedBlobs = [];
  animViews.innerHTML = '';
  try {
    if (!Number.isFinite(animVideo.duration) || animVideo.duration <= 0) {
      await new Promise((resolve, reject) => {
        animVideo.addEventListener('loadedmetadata', resolve, { once: true });
        animVideo.addEventListener('error', reject, { once: true });
      });
    }
    const d = animVideo.duration;
    const start = d * 0.06, end = d * 0.94;
    for (let i = 0; i < 9; i++) {
      const t = start + (end - start) * (i / 8);
      await seekVideo(animVideo, t);
      const c = document.createElement('canvas');
      c.width = 772; c.height = 772;
      drawCover(c.getContext('2d'), animVideo, 772);
      const blob = await canvasBlob(c);
      extractedBlobs.push({ name: `vue-${String(i+1).padStart(2,'0')}.png`, blob });
      const thumb = document.createElement('canvas');
      thumb.width = 180; thumb.height = 180;
      thumb.getContext('2d').drawImage(c, 0, 0, 180, 180);
      animViews.appendChild(thumb);
      setStatus(`Extraction des 9 vues… ${i+1}/9`, 92 + (i+1) * 0.8);
    }
    animVideo.currentTime = 0;
    animDownloadZip.disabled = false;
    setStatus('9 vues 772×772 prêtes. Téléchargez le ZIP pour LentiPrint.', 100);
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Extraction impossible.', 0);
  } finally {
    animExtract.disabled = false;
  }
});

function crc32(bytes) {
  let crc = -1;
  for (const b of bytes) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}
function u16(n){ return new Uint8Array([n & 255, (n>>>8)&255]); }
function u32(n){ return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]); }
function concat(parts){ const len=parts.reduce((s,p)=>s+p.length,0); const out=new Uint8Array(len); let o=0; for(const p of parts){out.set(p,o);o+=p.length;} return out; }
async function makeZip(files) {
  const enc = new TextEncoder();
  const locals=[], centrals=[];
  let offset=0;
  for (const f of files) {
    const name=enc.encode(f.name), data=new Uint8Array(await f.blob.arrayBuffer()), crc=crc32(data);
    const local=concat([u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);
    locals.push(local);
    const central=concat([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);
    centrals.push(central); offset += local.length;
  }
  const centralData=concat(centrals);
  const end=concat([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralData.length),u32(offset),u16(0)]);
  return new Blob([concat([...locals,centralData,end])], {type:'application/zip'});
}

animDownloadZip.addEventListener('click', async () => {
  if (extractedBlobs.length !== 9) return;
  const zip = await makeZip(extractedBlobs);
  const url = URL.createObjectURL(zip);
  const a = document.createElement('a');
  a.href = url; a.download = '9-vues-animation-lenticulaire.zip';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});

setMode('3d');
