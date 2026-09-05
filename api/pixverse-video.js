function isAllowedPixVerseHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'pixverse.ai' || host.endsWith('.pixverse.ai');
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function getFreshVideoUrl(videoId, signal) {
  const key = process.env.PIXVERSE_API_KEY;
  if (!key) throw new Error('PIXVERSE_API_KEY manquante');
  const r = await fetch(`https://app-api.pixverse.ai/openapi/v2/video/result/${videoId}`, {
    headers: { 'API-KEY': key, 'Ai-trace-id': crypto.randomUUID() },
    signal,
    cache: 'no-store'
  });
  if (!r.ok) throw new Error(`Statut PixVerse HTTP ${r.status}`);
  const d = await r.json();
  const url = d?.Resp?.url || d?.Resp?.video_url || d?.url || d?.video_url || d?.data?.url || d?.data?.video_url || '';
  if (!/^https:\/\//i.test(url)) throw new Error('URL vidéo PixVerse absente');
  return url;
}

async function fetchReadyVideo(videoId, fallbackUrl, signal) {
  let lastStatus = 0;
  let lastUrl = fallbackUrl || '';

  for (let attempt = 0; attempt < 15; attempt++) {
    if (videoId) {
      try { lastUrl = await getFreshVideoUrl(videoId, signal); } catch (_) {}
    }
    if (!/^https:\/\//i.test(lastUrl)) {
      await wait(1200);
      continue;
    }

    const u = new URL(lastUrl);
    if (!isAllowedPixVerseHost(u.hostname)) throw new Error('Hôte vidéo PixVerse non autorisé');

    const r = await fetch(lastUrl, {
      method: 'GET',
      headers: { 'Accept-Encoding': 'identity' },
      signal,
      redirect: 'follow',
      cache: 'no-store'
    });
    lastStatus = r.status;

    if (r.ok) {
      const type = (r.headers.get('content-type') || '').toLowerCase();
      if (type.startsWith('video/') || /octet-stream/.test(type) || !type) return { response: r, url: lastUrl };
    }

    if (![403, 404, 416, 425, 429, 500, 502, 503, 504].includes(r.status)) break;
    await wait(Math.min(3000, 900 + attempt * 180));
  }

  throw new Error(`Vidéo PixVerse pas encore disponible${lastStatus ? ` (HTTP ${lastStatus})` : ''}`);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).send('Method not allowed');

  const videoId = String(req.query.id || req.query.video_id || '').trim();
  const fallbackUrl = String(req.query.url || '').trim();
  if (!fallbackUrl && !/^\d+$/.test(videoId)) return res.status(400).send('URL ou video_id requis');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 115000);

  try {
    const { response: r } = await fetchReadyVideo(/^\d+$/.test(videoId) ? videoId : '', fallbackUrl, controller.signal);
    const ab = await r.arrayBuffer();
    const maxBytes = 100 * 1024 * 1024;
    if (ab.byteLength > maxBytes) return res.status(413).send('Vidéo PixVerse trop volumineuse');

    const contentType = r.headers.get('content-type') || 'video/mp4';
    res.setHeader('Content-Type', contentType.toLowerCase().startsWith('video/') ? contentType : 'video/mp4');
    res.setHeader('Content-Length', String(ab.byteLength));
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-HappyHolo-Video-Ready', '1');

    if (req.method === 'HEAD') return res.status(200).end();

    // On renvoie volontairement un MP4 complet en 200. Safari peut demander Range,
    // mais le buffering intégral côté serveur évite le 404 CDN pendant loadedmetadata.
    return res.status(200).send(Buffer.from(ab));
  } catch (e) {
    const message = e?.name === 'AbortError'
      ? 'Délai de récupération vidéo dépassé.'
      : (e?.message || 'Erreur proxy vidéo');
    return res.status(503).send(message);
  } finally {
    clearTimeout(timeout);
  }
}
