export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  try {
    const rawUrl = String(req.query?.url || '');
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || !(host === 'pixverse.ai' || host.endsWith('.pixverse.ai'))) {
      return res.status(400).json({ error: 'URL vidéo non autorisée.' });
    }

    const upstream = await fetch(u.toString());
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'Vidéo PixVerse inaccessible.' });

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Length', String(buf.length));
    return res.status(200).send(buf);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'URL vidéo invalide.' });
  }
}
