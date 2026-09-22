// ==============================================================================
// YA AGENT API — CLOUDINARY SERVERLESS HELPER (NODE.JS / VERCEL COMPATIBLE)
// Archivo: api/agent/_cloudinary.ts
// Reimplementación pura sin dependencias de navegador (window, document, localStorage)
// ==============================================================================

function getCloudinaryConfig(): { cloudName: string; uploadPreset: string } {
  const cloudName = (
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.VITE_CLOUDINARY_CLOUD_NAME ||
    'ya-delivery'
  ).trim();

  const uploadPreset = (
    process.env.CLOUDINARY_UPLOAD_PRESET ||
    process.env.VITE_CLOUDINARY_UPLOAD_PRESET ||
    'ya_delivery_preset'
  ).trim();

  return {
    cloudName: cloudName || 'ya-delivery',
    uploadPreset: uploadPreset || 'ya_delivery_preset',
  };
}

/**
 * Optimiza URLs de Cloudinary aplicando transformaciones automáticas gratuitas:
 * f_auto (formato webp/avif automático según navegador)
 * q_auto (compresión inteligente sin pérdida apreciable)
 * c_limit + ancho máximo opcional
 */
export function getOptimizedImageUrl(
  url: string | null | undefined,
  width?: number
): string {
  if (!url) return '';
  const trimmed = url.trim();

  // Si no es URL de Cloudinary, retornar tal cual
  if (!trimmed.includes('cloudinary.com')) return trimmed;

  // Si ya tiene f_auto o q_auto, no duplicar transformaciones
  if (trimmed.includes('/f_auto') || trimmed.includes('/q_auto')) return trimmed;

  const transform = width ? `f_auto,q_auto,w_${width},c_limit` : 'f_auto,q_auto';
  return trimmed.replace('/upload/', `/upload/${transform}/`);
}

/**
 * Sube una imagen directamente al endpoint REST de Cloudinary mediante fetch y FormData nativo de Node.js.
 * Devuelve siempre una URL HTTPS segura y optimizada con f_auto,q_auto.
 */
export async function uploadImageToCloudinary(
  file: File | Blob,
  folder: string = 'ya_delivery'
): Promise<{ url: string | null; error: string | null }> {
  try {
    if (!file.type.startsWith('image/')) {
      return { url: null, error: 'El archivo seleccionado no es una imagen válida.' };
    }

    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return { url: null, error: 'La imagen excede el límite de 5 MB de Cloudinary gratuito.' };
    }

    const { cloudName, uploadPreset } = getCloudinaryConfig();

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    formData.append('folder', folder);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const data = await response.json();
      const secureUrl = getOptimizedImageUrl(data.secure_url || data.url);
      return { url: secureUrl, error: null };
    }

    const errorJson = await response.json().catch(() => null);
    const msg = errorJson?.error?.message || 'Error al subir la imagen a Cloudinary.';
    return { url: null, error: msg };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error de conexión con Cloudinary.';
    return { url: null, error: errorMsg };
  }
}
