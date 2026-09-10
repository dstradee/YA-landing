// ==============================================================================
// YA DELIVERY - RE-EXPORTADOR SERVER-SIDE PAYPAL
// Archivo: src/lib/paypalServer.ts
// Mantiene compatibilidad con el entorno local de desarrollo (Vite middleware)
// ==============================================================================

export * from '../../api/_lib/paypalServer.ts';
import { getPayPalMode, isPayPalSandboxMode, getPayPalBaseUrl } from '../../api/_lib/paypalServer.ts';

export const isPayPalSandbox = isPayPalSandboxMode();
export const PAYPAL_MODE = getPayPalMode();
export const PAYPAL_BASE_URL = getPayPalBaseUrl();
