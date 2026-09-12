// ==============================================================================
// YA DELIVERY - COMPONENTE SEO HEAD DINÁMICO
// Archivo: src/components/seo/SeoHead.tsx
// ==============================================================================

import { useEffect } from 'react';
import { getCanonicalUrl, DEFAULT_SEO, type SeoMetaConfig } from '../../lib/seo';

interface SeoHeadProps extends Partial<SeoMetaConfig> {
  path?: string;
  structuredData?: Record<string, any> | Array<Record<string, any>>;
}

/**
 * Gestiona de forma reactiva y limpia los meta-tags, canonical link,
 * Open Graph, Twitter Cards y Schema.org JSON-LD en el <head> del documento.
 */
export function SeoHead({
  title,
  description,
  canonical,
  image,
  type = 'website',
  robots = 'index, follow',
  path,
  structuredData,
}: SeoHeadProps) {
  const finalTitle = title || DEFAULT_SEO.title;
  const finalDesc = description || DEFAULT_SEO.description;
  const finalCanonical = canonical || (path ? getCanonicalUrl(path) : getCanonicalUrl('/'));
  const finalImage = image || DEFAULT_SEO.image;
  const finalRobots = robots || DEFAULT_SEO.robots;

  useEffect(() => {
    // 1. Título
    document.title = finalTitle;

    // Helper para actualizar o crear meta tags
    const setMetaTag = (attribute: 'name' | 'property', attrValue: string, content?: string) => {
      if (!content) return;
      let element = document.querySelector(`meta[${attribute}="${attrValue}"]`) as HTMLMetaElement | null;
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, attrValue);
        document.head.appendChild(element);
      }
      element.content = content;
    };

    // 2. Meta tags estándar
    setMetaTag('name', 'description', finalDesc);
    setMetaTag('name', 'robots', finalRobots);

    // 3. Link Canonical
    let linkCanonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!linkCanonical) {
      linkCanonical = document.createElement('link');
      linkCanonical.rel = 'canonical';
      document.head.appendChild(linkCanonical);
    }
    linkCanonical.href = finalCanonical;

    // 4. Open Graph
    setMetaTag('property', 'og:title', finalTitle);
    setMetaTag('property', 'og:description', finalDesc);
    setMetaTag('property', 'og:url', finalCanonical);
    setMetaTag('property', 'og:type', type);
    setMetaTag('property', 'og:site_name', 'YA Delivery');
    setMetaTag('property', 'og:locale', 'es_ES');
    if (finalImage) {
      setMetaTag('property', 'og:image', finalImage);
    }

    // 5. Twitter Cards
    setMetaTag('name', 'twitter:card', 'summary_large_image');
    setMetaTag('name', 'twitter:title', finalTitle);
    setMetaTag('name', 'twitter:description', finalDesc);
    if (finalImage) {
      setMetaTag('name', 'twitter:image', finalImage);
    }

    // 6. Structured Data (JSON-LD)
    const scriptId = 'ya-structured-data';
    let scriptTag = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (structuredData) {
      if (!scriptTag) {
        scriptTag = document.createElement('script');
        scriptTag.id = scriptId;
        scriptTag.type = 'application/ld+json';
        document.head.appendChild(scriptTag);
      }
      scriptTag.text = JSON.stringify(structuredData);
    } else if (scriptTag) {
      scriptTag.remove();
    }
  }, [finalTitle, finalDesc, finalCanonical, finalImage, type, finalRobots, structuredData]);

  return null;
}
