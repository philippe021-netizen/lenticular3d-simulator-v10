export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).json({
    pixverseKeyPresent: Boolean(process.env.PIXVERSE_API_KEY),
    environment: process.env.VERCEL_ENV || 'unknown',
    gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    gitCommitRef: process.env.VERCEL_GIT_COMMIT_REF || null,
    deploymentUrl: process.env.VERCEL_URL || null,
    diagnosticVersion: 'pixverse-diag-v1'
  });
}
