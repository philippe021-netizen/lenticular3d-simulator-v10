export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.PIXVERSE_API_KEY;
  if (!key) return res.status(500).json({ error: 'PIXVERSE_API_KEY manquante dans Vercel.' });

  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const r = await fetch('https://app-api.pixverse.ai/openapi/v2/account/balance', {
      headers: {
        'API-KEY': key,
        'Ai-trace-id': crypto.randomUUID()
      },
      signal: controller.signal,
      cache: 'no-store'
    });

    const textBody = await r.text();
    let data;
    try { data = textBody ? JSON.parse(textBody) : {}; }
    catch { data = { raw: textBody }; }

    if (!r.ok) {
      return res.status(r.status).json({
        error: data?.ErrMsg || data?.message || `PixVerse balance HTTP ${r.status}`,
        upstream: data
      });
    }

    if (Number(data?.ErrCode || 0) !== 0) {
      return res.status(502).json({
        error: data?.ErrMsg || `PixVerse ErrCode ${data?.ErrCode}`,
        upstream: data
      });
    }

    const monthly = Math.max(0, Number(data?.Resp?.credit_monthly) || 0);
    const packageCredits = Math.max(0, Number(data?.Resp?.credit_package) || 0);
    const total = monthly + packageCredits;

    return res.status(200).json({
      ok: true,
      source: 'pixverse-api-platform',
      account_id: data?.Resp?.account_id ?? null,
      credit_monthly: monthly,
      credit_package: packageCredits,
      credit_total: total
    });
  } catch (e) {
    const message = e?.name === 'AbortError'
      ? 'Délai de lecture du solde PixVerse dépassé.'
      : (e?.message || 'Erreur lecture solde PixVerse');
    return res.status(500).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
}
