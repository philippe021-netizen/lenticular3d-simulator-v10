export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const url = String(req.query.url || '');
  if (!/^https:\/\//i.test(url)) return res.status(400).send('URL invalide');
  try {
    const u = new URL(url);
    const allowed = /(^|\.)pixverse\.(ai|media)$|(^|\.)media\.pixverse\.ai$/i.test(u.hostname) || /pixverse/i.test(u.hostname);
    if (!allowed) return res.status(403).send('Hôte vidéo non autorisé');
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).send('Vidéo inaccessible');
    res.setHeader('Content-Type', r.headers.get('content-type') || 'video/mp4');
    res.setHeader('Cache-Control', 'private, max-age=300');
    const ab = await r.arrayBuffer();
    res.status(200).send(Buffer.from(ab));
  } catch (e) {
    res.status(500).send(e.message || 'Erreur proxy vidéo');
  }
}
