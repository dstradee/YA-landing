// ==============================================================================
// VERCEL SERVERLESS FUNCTION: /api/sitemap
// Generador dinámico de Sitemap XML con Content-Type: application/xml
// ==============================================================================

import type { VercelRequest, VercelResponse } from './_lib/types.ts';

const BASE_URL = 'https://yadelivery.es';

const categories = [
  'energeticas',
  'bebidas',
  'snacks',
  'dulces',
  'hielo',
  'comida',
  'mas',
];

const products = [
  'red-bull',
  'monster-energy',
  'coca-cola',
  'coca-cola-zero',
  'fanta-naranja',
  'aquarius-limon',
  'agua-mineral',
  'lays-campesinas',
  'doritos-tex-mex',
  'pringles-original',
  'kitkat',
  'oreo',
  'mix-gominolas',
  'bolsa-hielo',
  'pizza-barbacoa',
  'ramen-picante',
  'pilas-aa',
];

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const today = new Date().toISOString().split('T')[0];

  const urls = [
    { loc: `${BASE_URL}/`, priority: '1.0', changefreq: 'daily' },
    { loc: `${BASE_URL}/delivery-jerez`, priority: '0.9', changefreq: 'weekly' },
    { loc: `${BASE_URL}/app`, priority: '0.9', changefreq: 'daily' },
    ...categories.map((slug) => ({
      loc: `${BASE_URL}/app/categoria/${slug}`,
      priority: '0.8',
      changefreq: 'weekly',
    })),
    ...products.map((slug) => ({
      loc: `${BASE_URL}/app/producto/${slug}`,
      priority: '0.8',
      changefreq: 'weekly',
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Cache-Control',
    'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'
  );

  return res.status(200).send(xml);
}
