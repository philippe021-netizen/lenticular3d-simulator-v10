export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.PIXVERSE_API_KEY;
  const keyPresent = Boolean(key);
  let pixverseBalance = null;

  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (keyPresent) {
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
      const text = await r.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

      if (!r.ok) {
        pixverseBalance = {
          ok: false,
          error: data?.ErrMsg || data?.message || `PixVerse balance HTTP ${r.status}`
        };
      } else if (Number(data?.ErrCode || 0) !== 0) {
        pixverseBalance = {
          ok: false,
          error: data?.ErrMsg || `PixVerse ErrCode ${data?.ErrCode}`
        };
      } else {
        const monthly = Math.max(0, Number(data?.Resp?.credit_monthly) || 0);
        const packageCredits = Math.max(0, Number(data?.Resp?.credit_package) || 0);
        pixverseBalance = {
          ok: true,
          account_id: data?.Resp?.account_id ?? null,
          credit_monthly: monthly,
          credit_package: packageCredits,
          credit_total: monthly + packageCredits,
          source: 'pixverse-api-platform'
        };
      }
    } catch (e) {
      pixverseBalance = {
        ok: false,
        error: e?.name === 'AbortError'
          ? 'Délai de lecture du solde PixVerse dépassé.'
          : (e?.message || 'Erreur lecture solde PixVerse')
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  res.status(200).json({
    pixverseKeyPresent: keyPresent,
    pixverseBalance,
    environment: process.env.VERCEL_ENV || 'unknown',
    gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    gitCommitRef: process.env.VERCEL_GIT_COMMIT_REF || null,
    deploymentUrl: process.env.VERCEL_URL || null,
    diagnosticVersion: 'pixverse-diag-v2-balance'
  });
}
