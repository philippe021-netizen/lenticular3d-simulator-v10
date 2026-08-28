function isAllowedPixVerseHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'pixverse.ai' || host.endsWith('.pixverse.ai');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

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
      const r = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!r.ok) return res.status(r.status).send('Vidéo inaccessible');

      const finalUrl = new URL(r.url || url);
      if (!isAllowedPixVerseHost(finalUrl.hostname)) {
        return res.status(403).send('Redirection vidéo non autorisée');
      }

      const contentType = r.headers.get('content-type') || 'video/mp4';
      if (!contentType.toLowerCase().startsWith('video/')) {
        return res.status(415).send('Réponse PixVerse non vidéo');
      }

      const declaredLength = Number(r.headers.get('content-length') || 0);
      const maxBytes = 100 * 1024 * 1024;
      if (declaredLength > maxBytes) {
        return res.status(413).send('Vidéo PixVerse trop volumineuse');
      }

      const ab = await r.arrayBuffer();
      if (ab.byteLength > maxBytes) {
        return res.status(413).send('Vidéo PixVerse trop volumineuse');
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(ab.byteLength));
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.status(200).send(Buffer.from(ab));
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    const message = e?.name === 'AbortError' ? 'Délai de récupération vidéo dépassé.' : (e?.message || 'Erreur proxy vidéo');
    res.status(500).send(message);
  }
}
