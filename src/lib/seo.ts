// ==============================================================================
// YA DELIVERY - SEO & STRUCTURED DATA SUITE
// Archivo: src/lib/seo.ts
// ==============================================================================

import type { Product } from '../types/app';
import { isRealImageUrl, formatImageUrl } from './cloudinary';

/**
 * Resuelve la URL base canónica del proyecto.
 * Prioriza variable de entorno VITE_SITE_URL o VITE_APP_URL, origen de ventana o fallback seguro ya-delivery.es
 */
export function getCanonicalBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_SITE_URL || import.meta.env.VITE_APP_URL || '').trim();
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location.origin) {
    const origin = window.location.origin;
    // Si no es localhost, usar el origen real
    if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      return origin.replace(/\/+$/, '');
    }
  }
  return 'https://ya-delivery.es';
}

/**
 * Construye la URL canónica absoluta a partir de un path relativo.
 */
export function getCanonicalUrl(path: string = '/'): string {
  const base = getCanonicalBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

export interface SeoMetaConfig {
  title: string;
  description: string;
  canonical?: string;
  image?: string;
  type?: 'website' | 'article' | 'product';
  robots?: string;
  structuredData?: Record<string, any> | Array<Record<string, any>>;
}

/**
 * Metadata SEO base para Jerez de la Frontera
 */
export const DEFAULT_SEO: SeoMetaConfig = {
  title: 'YA Delivery Jerez — Lo necesitas. Lo tienes.',
  description: 'Servicio de delivery a domicilio en Jerez de la Frontera. Bebidas frías, energéticas, snacks y hielo directos a tu puerta en minutos.',
  image: 'https://ya-delivery.es/og-image-jerez.jpg',
  type: 'website',
  robots: 'index, follow',
};

/**
 * Schema.org: Organization
 */
export function getOrganizationSchema() {
  const base = getCanonicalBaseUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'YA Delivery',
    alternateName: ['YA', 'YA Jerez', 'YA Delivery Jerez'],
    url: base,
    logo: `${base}/logo.png`,
    description: 'Servicio de delivery y entrega a domicilio bajo demanda en Jerez de la Frontera, Cádiz.',
    areaServed: {
      '@type': 'City',
      name: 'Jerez de la Frontera',
      addressRegion: 'Cádiz',
      addressCountry: 'ES',
    },
    knowsAbout: [
      'Delivery en Jerez de la Frontera',
      'Bebidas a domicilio',
      'Hielo a domicilio',
      'Snacks a domicilio',
      'Reparto nocturno',
    ],
  };
}

/**
 * Schema.org: LocalBusiness / DeliveryService
 * NOTA: Los datos no definidos aún en el proyecto se indican estrictamente como PENDIENTE DE CONFIGURAR.
 */
export function getLocalBusinessSchema() {
  const base = getCanonicalBaseUrl();
  return {
    '@context': 'https://schema.org',
    '@type': ['DeliveryService', 'LocalBusiness'],
    name: 'YA Delivery Jerez',
    image: `${base}/logo.png`,
    url: base,
    priceRange: '€',
    description: 'Servicio de delivery a domicilio en Jerez de la Frontera: bebidas, energéticas, snacks, dulces y hielo.',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Jerez de la Frontera',
      addressRegion: 'Cádiz',
      postalCode: '11400',
      addressCountry: 'ES',
      streetAddress: 'Jerez de la Frontera (Operativa a domicilio. Dirección física comercial: PENDIENTE DE CONFIGURAR)',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 36.685,
      longitude: -6.126,
    },
    areaServed: [
      {
        '@type': 'City',
        name: 'Jerez de la Frontera',
        sameAs: 'https://es.wikipedia.org/wiki/Jerez_de_la_Frontera',
      },
    ],
    telephone: 'PENDIENTE DE CONFIGURAR',
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
        ],
        description: 'Servicio de entrega local según demanda activa en la aplicación.',
      },
    ],
  };
}

/**
 * Schema.org: WebSite con buscador
 */
export function getWebSiteSchema() {
  const base = getCanonicalBaseUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'YA Delivery',
    url: base,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${base}/app/buscar?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * Schema.org: Product & Offer
 */
export function getProductSchema(product: Product, canonicalUrl?: string) {
  const base = getCanonicalBaseUrl();
  const url = canonicalUrl || `${base}/app/producto/${product.slug || product.id}`;
  
  let imageUrl = `${base}/logo.png`;
  if (product.image && isRealImageUrl(product.image)) {
    imageUrl = formatImageUrl(product.image, 800);
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || `${product.name} disponible para entrega inmediata a domicilio en Jerez de la Frontera con YA.`,
    image: imageUrl,
    sku: product.id,
    brand: {
      '@type': 'Brand',
      name: extractBrand(product.name),
    },
    category: product.category,
    offers: {
      '@type': 'Offer',
      url: url,
      priceCurrency: 'EUR',
      price: Number(product.price).toFixed(2),
      priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      itemCondition: 'https://schema.org/NewCondition',
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: {
        '@type': 'Organization',
        name: 'YA Delivery Jerez',
      },
      areaServed: {
        '@type': 'City',
        name: 'Jerez de la Frontera',
      },
    },
  };
}

/**
 * Schema.org: Breadcrumbs
 */
export function getBreadcrumbSchema(items: { name: string; url: string }[]) {
  const base = getCanonicalBaseUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${base}${item.url.startsWith('/') ? item.url : `/${item.url}`}`,
    })),
  };
}

/**
 * Schema.org: FAQPage
 */
export function getFaqSchema(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

/**
 * Schema.org: ItemList (Colecciones de productos / Categorías)
 */
export function getItemListSchema(title: string, items: { name: string; url: string; image?: string; price?: number }[]) {
  const base = getCanonicalBaseUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: item.url.startsWith('http') ? item.url : `${base}${item.url.startsWith('/') ? item.url : `/${item.url}`}`,
      ...(item.image ? { image: item.image } : {}),
    })),
  };
}

/**
 * Extrae de forma heurística la marca conocida a partir del nombre del producto
 */
function extractBrand(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('red bull')) return 'Red Bull';
  if (n.includes('monster')) return 'Monster Energy';
  if (n.includes('coca-cola') || n.includes('cocacola')) return 'Coca-Cola';
  if (n.includes('fanta')) return 'Fanta';
  if (n.includes('aquarius')) return 'Aquarius';
  if (n.includes('lays') || n.includes('lay\'s')) return 'Lay\'s';
  if (n.includes('doritos')) return 'Doritos';
  if (n.includes('pringles')) return 'Pringles';
  if (n.includes('kitkat') || n.includes('kit kat')) return 'KitKat';
  if (n.includes('oreo')) return 'Oreo';
  return 'YA Delivery';
}
