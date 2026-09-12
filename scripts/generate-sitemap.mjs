import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const BASE_URL = 'https://yadelivery.es';
const today = new Date().toISOString().split('T')[0];

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
</urlset>
`;

const publicDir = path.join(rootDir, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), xml.trim() + '\n', 'utf-8');
console.log(`[SEO] Sitemap successfully generated with ${urls.length} URLs at ${path.join(publicDir, 'sitemap.xml')}`);
