// ==============================================================================
// YA DELIVERY — INTEGRACIÓN CLOUDINARY OFICIAL (FREE TIER)
// Archivo: src/lib/cloudinary.ts
// Cloudinary Upload Widget oficial + Transformaciones gratuitas (f_auto, q_auto)
// ==============================================================================

declare global {
  interface Window {
    cloudinary?: {
      createUploadWidget: (
        options: Record<string, any>,
        callback: (error: any, result: any) => void
      ) => {
        open: () => void;
        close: (options?: any) => void;
        destroy: (options?: any) => void;
      };
    };
  }
}

/**
 * Obtiene la configuración de Cloudinary para el frontend (Cloud Name y Upload Preset unsigned).
 * NO requiere ni expone ninguna clave secreta (API Secret).
 */
export function getCloudinaryConfig() {
  const cloudName = (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '').trim();
  const uploadPreset = (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '').trim();

  return {
    cloudName: cloudName || 'ya-delivery',
    uploadPreset: uploadPreset || 'ya_delivery_preset',
    isCustomConfigured: Boolean(cloudName && uploadPreset),
  };
}

/**
 * Carga el script oficial del Cloudinary Upload Widget de forma segura si no está presente en el DOM.
 */
export function loadCloudinaryWidgetScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.cloudinary && typeof window.cloudinary.createUploadWidget === 'function') {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    // Si ya existe la etiqueta de script en el documento
    const existing =
      document.querySelector('script[src*="upload-widget.cloudinary.com"]') ||
      document.querySelector('script[src*="widget.cloudinary.com"]');

    if (existing) {
      if (window.cloudinary) {
        return resolve(true);
      }
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }

    // Inyectar la etiqueta del script oficial
    const script = document.createElement('script');
    script.src = 'https://upload-widget.cloudinary.com/latest/global/all.js';
    script.async = true;
    script.type = 'text/javascript';
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.error('Error cargando el script de Cloudinary Upload Widget');
      resolve(false);
    };
    document.head.appendChild(script);
  });
}

/**
 * Valida de forma rigurosa si un valor corresponde a una URL real de imagen y no a un emoji o texto suelto.
 */
export function isRealImageUrl(val: string | null | undefined): boolean {
  if (!val) return false;
  const s = val.trim();
  if (s.length === 0) return false;

  // URLs estándar o data URIs
  if (
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('//') ||
    s.startsWith('/') ||
    s.startsWith('data:image/')
  ) {
    return true;
  }

  // Dominio de Cloudinary
  if (s.includes('cloudinary.com') || s.includes('res.cloudinary.com')) {
    return true;
  }

  // Extensiones de archivo de imagen conocidas
  if (/\.(jpeg|jpg|png|webp|gif|svg|avif)($|\?)/i.test(s)) {
    return true;
  }

  return false;
}

/**
 * Optimiza URLs de Cloudinary aplicando transformaciones gratuitas automáticas:
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
 * Formatea y normaliza cualquier URL de imagen garantizando HTTPS y optimización de Cloudinary.
 */
export function formatImageUrl(val: string | null | undefined, width?: number): string {
  if (!val) return '';
  let s = val.trim();

  if (s.startsWith('//')) {
    s = 'https:' + s;
  } else if (s.startsWith('res.cloudinary.com')) {
    s = 'https://' + s;
  } else if (s.startsWith('http://res.cloudinary.com')) {
    s = s.replace('http://', 'https://');
  }

  // Si se guardó previamente un public_id de Cloudinary sin dominio completo
  if (!isRealImageUrl(s) && s.length > 8 && (s.includes('/') || s.includes('_') || s.startsWith('v'))) {
    const { cloudName } = getCloudinaryConfig();
    s = `https://res.cloudinary.com/${cloudName}/image/upload/${s}`;
  }

  return getOptimizedImageUrl(s, width);
}

export interface OpenWidgetOptions {
  onSuccess: (secureUrl: string, info: any) => void;
  onError?: (error: string) => void;
  folder?: string;
  maxFiles?: number;
}

/**
 * Abre el Cloudinary Upload Widget oficial sobre la aplicación.
 * Permite subir desde PC (Mis archivos), pegar URL, usar cámara, etc.
 * Al completarse con éxito, devuelve la URL HTTPS REAL (https://res.cloudinary.com/...)
 * con optimizaciones f_auto,q_auto aplicadas.
 */
export async function openCloudinaryUploadWidget({
  onSuccess,
  onError,
  folder = 'ya_delivery',
  maxFiles = 1,
}: OpenWidgetOptions): Promise<void> {
  const loaded = await loadCloudinaryWidgetScript();

  if (!loaded || !window.cloudinary || typeof window.cloudinary.createUploadWidget !== 'function') {
    const errMsg = 'No se pudo inicializar el Cloudinary Upload Widget. Comprueba tu conexión a Internet.';
    onError?.(errMsg);
    return;
  }

  const { cloudName, uploadPreset } = getCloudinaryConfig();

  try {
    const widget = window.cloudinary.createUploadWidget(
      {
        cloudName: cloudName,
        uploadPreset: uploadPreset,
        sources: ['local', 'url', 'camera', 'unsplash'],
        multiple: maxFiles > 1,
        maxFiles: maxFiles,
        resourceType: 'image',
        clientAllowedFormats: ['png', 'jpeg', 'jpg', 'webp', 'svg', 'gif', 'avif'],
        maxFileSize: 5 * 1024 * 1024, // 5 MB (límite del plan gratuito de Cloudinary)
        folder: folder,
        cropping: false,
        showPoweredBy: false,
        theme: 'dark',
        language: 'es',
        text: {
          es: {
            or: 'O',
            back: 'Atrás',
            advanced: 'Avanzado',
            close: 'Cerrar',
            no_results: 'Sin resultados',
            search_placeholder: 'Buscar imágenes',
            about_uw: 'Subida oficial Cloudinary',
            menu: {
              files: 'Mis archivos (PC)',
              web: 'Dirección web (URL)',
              camera: 'Cámara',
            },
            local: {
              browse: 'Seleccionar archivo del ordenador',
              dd_title_single: 'Arrastra y suelta tu imagen aquí',
              drop_title_single: 'Suelta la imagen para subir',
            },
            url: {
              inner_title: 'Pega la dirección URL de la imagen:',
              input_placeholder: 'https://...',
              btn_title: 'Subir imagen',
            },
          },
        },
        styles: {
          palette: {
            window: '#0A0A0A',
            windowBorder: '#262626',
            tabIcon: '#B6FF00',
            menuIcons: '#B6FF00',
            textDark: '#000000',
            textLight: '#FFFFFF',
            link: '#B6FF00',
            action: '#B6FF00',
            inactiveTabIcon: '#737373',
            error: '#EF4444',
            inProgress: '#B6FF00',
            complete: '#22C55E',
            sourceBg: '#141414',
          },
          fonts: {
            default: null,
            "'Space Grotesk', sans-serif": {
              url: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap',
              active: true,
            },
          },
        },
      },
      (error: any, result: any) => {
        if (error) {
          console.error('Cloudinary Upload Widget error:', error);
          const errorMsg =
            typeof error === 'string'
              ? error
              : error?.message || 'Error durante la subida en Cloudinary.';
          onError?.(errorMsg);
          return;
        }

        if (result && result.event === 'success') {
          const info = result.info;

          // Extraer URL HTTPS REAL de Cloudinary
          let rawUrl = info.secure_url || info.url || '';
          if (rawUrl.startsWith('http://')) {
            rawUrl = rawUrl.replace('http://', 'https://');
          }

          if (rawUrl) {
            // Aplicar optimización f_auto,q_auto directamente
            const finalUrl = getOptimizedImageUrl(rawUrl);
            onSuccess(finalUrl, info);
          } else {
            onError?.('Cloudinary no devolvió una URL válida de la imagen subida.');
          }
        }
      }
    );

    widget.open();
  } catch (err: any) {
    console.error('Error abriendo Cloudinary Upload Widget:', err);
    onError?.(err?.message || 'Error abriendo el widget de Cloudinary');
  }
}

/**
 * Función fallback de subida directa HTTP para llamadas programáticas si fuera requerida.
 * Devuelve siempre URL segura https://res.cloudinary.com/... sin convertir a base64 ruidoso.
 */
export async function uploadImageToCloudinary(
  file: File,
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
  } catch (err: any) {
    return { url: null, error: err.message || 'Error de conexión con Cloudinary.' };
  }
}
