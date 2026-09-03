function isAllowedPixVerseHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'pixverse.ai' || host.endsWith('.pixverse.ai');
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
      const range = String(req.headers.range || '');
      const headers = {};
      if (range) headers.Range = range;
      headers['Accept-Encoding'] = 'identity';

      const r = await fetch(url, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers,
        signal: controller.signal,
        redirect: 'follow'
      });

      if (!r.ok && r.status !== 206) return res.status(r.status).send('Vidéo inaccessible');

      const finalUrl = new URL(r.url || url);
      if (!isAllowedPixVerseHost(finalUrl.hostname)) {
        return res.status(403).send('Redirection vidéo non autorisée');
      }

      const contentType = r.headers.get('content-type') || 'video/mp4';
      if (!contentType.toLowerCase().startsWith('video/')) {
        return res.status(415).send('Réponse PixVerse non vidéo');
      }

      const maxBytes = 100 * 1024 * 1024;
      const declaredLength = Number(r.headers.get('content-length') || 0);
      if (declaredLength > maxBytes) return res.status(413).send('Vidéo PixVerse trop volumineuse');

      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', r.headers.get('accept-ranges') || 'bytes');
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');

      const contentRange = r.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);
      if (declaredLength) res.setHeader('Content-Length', String(declaredLength));

      if (req.method === 'HEAD') return res.status(r.status === 206 ? 206 : 200).end();

      const ab = await r.arrayBuffer();
      if (ab.byteLength > maxBytes) return res.status(413).send('Vidéo PixVerse trop volumineuse');
      if (!declaredLength) res.setHeader('Content-Length', String(ab.byteLength));

      // Safari/iPad demande souvent des plages d'octets pour lire les métadonnées MP4.
      // On conserve donc le 206 du CDN PixVerse au lieu de transformer la réponse en 200.
      res.status(r.status === 206 ? 206 : 200).send(Buffer.from(ab));
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    const message = e?.name === 'AbortError' ? 'Délai de récupération vidéo dépassé.' : (e?.message || 'Erreur proxy vidéo');
    res.status(500).send(message);
  }
}
