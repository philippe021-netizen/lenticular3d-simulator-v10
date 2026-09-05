function isAllowedPixVerseHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'pixverse.ai' || host.endsWith('.pixverse.ai');
}

async function fetchVideo(url, method, range, signal) {
  const headers = { 'Accept-Encoding': 'identity' };
  if (range) headers.Range = range;
  return fetch(url, { method, headers, signal, redirect: 'follow' });
}

async function getFreshVideoUrl(videoId, signal) {
  const key = process.env.PIXVERSE_API_KEY;
  if (!key) throw new Error('PIXVERSE_API_KEY manquante');
  const r = await fetch(`https://app-api.pixverse.ai/openapi/v2/video/result/${videoId}`, {
    headers: { 'API-KEY': key, 'Ai-trace-id': crypto.randomUUID() },
    signal
  });
  if (!r.ok) throw new Error(`Statut PixVerse HTTP ${r.status}`);
  const d = await r.json();
  const url = d?.Resp?.url || d?.Resp?.video_url || d?.url || d?.video_url || d?.data?.url || d?.data?.video_url || '';
  if (!/^https:\/\//i.test(url)) throw new Error('URL vidéo PixVerse absente');
  return url;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).send('Method not allowed');

  const videoId = String(req.query.id || req.query.video_id || '').trim();
  let url = String(req.query.url || '').trim();
  if (!url && !/^\d+$/.test(videoId)) return res.status(400).send('URL ou video_id requis');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    // Avec un video_id, on redemande systématiquement une URL fraîche à PixVerse.
    // Cela évite les URL CDN temporaires déjà invalides au moment où Safari lit loadedmetadata.
    if (/^\d+$/.test(videoId)) url = await getFreshVideoUrl(videoId, controller.signal);
    if (!/^https:\/\//i.test(url)) return res.status(400).send('URL invalide');

    const u = new URL(url);
    if (!isAllowedPixVerseHost(u.hostname)) return res.status(403).send('Hôte vidéo PixVerse non autorisé');

    const method = req.method === 'HEAD' ? 'HEAD' : 'GET';
    const requestedRange = String(req.headers.range || '');
    let r = await fetchVideo(url, method, requestedRange, controller.signal);

    // Safari demande souvent une petite plage pour lire les métadonnées. Certains CDN
    // PixVerse refusent cette première plage : on retente sans Range.
    if (requestedRange && (r.status === 404 || r.status === 416)) {
      r = await fetchVideo(url, method, '', controller.signal);
    }

    // Une URL CDN peut changer entre le statut et la lecture. Si on dispose de l'id,
    // on redemande une seconde URL fraîche et on retente une fois.
    if (r.status === 404 && /^\d+$/.test(videoId)) {
      url = await getFreshVideoUrl(videoId, controller.signal);
      r = await fetchVideo(url, method, '', controller.signal);
    }

    if (!r.ok && r.status !== 206) return res.status(r.status).send('Vidéo inaccessible');

    const finalUrl = new URL(r.url || url);
    if (!isAllowedPixVerseHost(finalUrl.hostname)) return res.status(403).send('Redirection vidéo non autorisée');

    const contentType = r.headers.get('content-type') || 'video/mp4';
    if (!contentType.toLowerCase().startsWith('video/') && !/octet-stream/i.test(contentType)) {
      return res.status(415).send('Réponse PixVerse non vidéo');
    }

    const maxBytes = 100 * 1024 * 1024;
    const declaredLength = Number(r.headers.get('content-length') || 0);
    if (declaredLength > maxBytes) return res.status(413).send('Vidéo PixVerse trop volumineuse');

    res.setHeader('Content-Type', contentType.toLowerCase().startsWith('video/') ? contentType : 'video/mp4');
    res.setHeader('Accept-Ranges', r.headers.get('accept-ranges') || 'bytes');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    const contentRange = r.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (declaredLength) res.setHeader('Content-Length', String(declaredLength));

    if (req.method === 'HEAD') return res.status(r.status === 206 ? 206 : 200).end();

    const ab = await r.arrayBuffer();
    if (ab.byteLength > maxBytes) return res.status(413).send('Vidéo PixVerse trop volumineuse');
    if (!declaredLength) res.setHeader('Content-Length', String(ab.byteLength));
    res.status(r.status === 206 ? 206 : 200).send(Buffer.from(ab));
  } catch (e) {
    const message = e?.name === 'AbortError' ? 'Délai de récupération vidéo dépassé.' : (e?.message || 'Erreur proxy vidéo');
    res.status(500).send(message);
  } finally {
    clearTimeout(timeout);
  }
}
