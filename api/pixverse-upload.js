export const config = { api: { bodyParser: false } };

const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_MEDIA_UPLOAD_BYTES = 100 * 1024 * 1024;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.PIXVERSE_API_KEY;
  if (!key) return res.status(500).json({ error: 'PIXVERSE_API_KEY manquante dans Vercel.' });

  try {
    const contentType = req.headers['content-type'];
    if (!contentType?.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'multipart/form-data requis' });
    }

    const kind = String(req.query.kind || 'image').toLowerCase() === 'media' ? 'media' : 'image';
    const maxBytes = kind === 'media' ? MAX_MEDIA_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
    const declaredLength = Number(req.headers['content-length'] || 0);
    if (declaredLength > maxBytes) {
      return res.status(413).json({ error: kind === 'media' ? 'Média trop volumineux pour PixVerse.' : 'Image trop volumineuse pour PixVerse.' });
    }

    const chunks = [];
    let received = 0;
    for await (const chunk of req) {
      received += chunk.length;
      if (received > maxBytes) {
        return res.status(413).json({ error: kind === 'media' ? 'Média trop volumineux pour PixVerse.' : 'Image trop volumineuse pour PixVerse.' });
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    const endpoint = kind === 'media'
      ? 'https://app-api.pixverse.ai/openapi/v2/media/upload'
      : 'https://app-api.pixverse.ai/openapi/v2/image/upload';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'API-KEY': key,
          'Ai-trace-id': crypto.randomUUID(),
          'Content-Type': contentType
        },
        body,
        signal: controller.signal
      });
      const text = await r.text();
      res.status(r.status).setHeader('Content-Type', 'application/json').send(text);
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    const message = e?.name === 'AbortError' ? 'Délai upload PixVerse dépassé.' : (e?.message || 'Erreur upload PixVerse');
    res.status(500).json({ error: message });
  }
}
