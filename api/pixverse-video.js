function isAllowedPixVerseHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'pixverse.ai' || host.endsWith('.pixverse.ai');
}

async function fetchVideo(url, method, range, signal) {
  const headers = { 'Accept-Encoding': 'identity' };
  if (range) headers.Range = range;
  return fetch(url, {
    method,
    headers,
    signal,
    redirect: 'follow'
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).send('Method not allowed');

  const url = String(req.query.url || '');
  if (!/^https:\/\//i.test(url)) return res.status(400).send('URL invalide');

  try {
    const u = new URL(url);
    if (!isAllowedPixVerseHost(u.hostname)) {
      return res.status(403).send('Hôte vidéo PixVerse non autorisé');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const method = req.method === 'HEAD' ? 'HEAD' : 'GET';
      const requestedRange = String(req.headers.range || '');
      let r = await fetchVideo(url, method, requestedRange, controller.signal);

      // Certains CDN PixVerse renvoient 404/416 lorsqu'un premier GET Safari contient Range.
      // On refait alors la requête complète : Safari peut lire les métadonnées depuis un 200 MP4.
      if (requestedRange && (r.status === 404 || r.status === 416)) {
        r = await fetchVideo(url, method, '', controller.signal);
      }

      if (!r.ok && r.status !== 206) return res.status(r.status).send('Vidéo inaccessible');

      const finalUrl = new URL(r.url || url);
      if (!isAllowedPixVerseHost(finalUrl.hostname)) {
        return res.status(403).send('Redirection vidéo non autorisée');
      }

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
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    const message = e?.name === 'AbortError' ? 'Délai de récupération vidéo dépassé.' : (e?.message || 'Erreur proxy vidéo');
    res.status(500).send(message);
  }
}
