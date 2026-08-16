

export default async function handler(req, res) {
  const key =
    process.env.STABILITY_API_KEY ||
    process.env['CLÉ_API_STABILITÉ'] ||
    process.env.CLE_API_STABILITE ||
    Object.entries(process.env).find(([k]) => {
      const n = k.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
      return n === 'CLE_API_STABILITE' || n === 'STABILITY_API_KEY';
    })?.[1];

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    keyConfigured: Boolean(key)
  });
}
