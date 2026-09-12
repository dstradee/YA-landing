// ==============================================================================
// YA - MOTOR DE CÁLCULO COMERCIAL (PHASE 3B)
// Archivo: src/lib/pricing.ts
// ==============================================================================
// PRIORIDAD DE REGLAS DE PRECIO (DETERMINISTA Y SEGURA):
// 1. Precio base del catálogo (o precio fijado del pack).
// 2. Descuento específico de producto (si está activo y en fecha).
// 3. Si NO existe descuento de producto, descuento de categoría (si está activo y en fecha).
//    * REGLA: Nunca se aplican a la vez descuento de producto y de categoría.
// 4. Subtotal de líneas (suma de líneas con descuento unitario aplicado).
// 5. Promoción automática por importe mínimo:
//    * REGLA: Se evalúa una sola promoción automática por pedido (la más favorable para el cliente).
//    * Requiere que el subtotal alcance el minimum_order.
// 6. Cálculo del coste de envío (tarifa estándar configurada).
// 7. Aplicación de regla de Envío Gratis:
//    * Si el subtotal de compra alcanza o supera el umbral configurado, el envío es 0,00 €.
// 8. Validación de Pedido Mínimo:
//    * Si el subtotal de compra es inferior al mínimo configurado, se bloquea el checkout.
// 9. Total final = max(0, subtotal - descuento_promoción) + coste_envio.
// ==============================================================================

import type {
  CartLine,
  DbCommercialSettings,
  DbDiscount,
  DbPromotion,
  DbPack,
  PackWithDetails,
  Product,
  DbProduct,
  YaPlusBenefits,
} from '../types/app';

export const DEFAULT_COMMERCIAL_SETTINGS: DbCommercialSettings = {
  id: 'default',
  min_order_enabled: true,
  min_order_amount: 10.0,
  free_shipping_enabled: true,
  free_shipping_threshold: 30.0,
  standard_delivery_fee: 2.9,
};

export type LinePricingDetail = {
  lineId: string;
  isPack: boolean;
  name: string;
  image: string;
  quantity: number;
  originalUnitPrice: number;
  discountedUnitPrice: number;
  unitDiscount: number;
  lineSubtotal: number;
  discountReason?: string;
  packSelectionsSummary?: string[];
  stockWarning?: string;
};

export type CartPricingSummary = {
  rawSubtotal: number;
  totalLineDiscounts: number;
  subtotal: number;
  appliedPromotion: DbPromotion | null;
  promotionDiscount: number;
  subtotalAfterPromotion: number;
  standardDeliveryFee: number;
  deliveryFee: number;
  freeShippingEnabled: boolean;
  isFreeShipping: boolean;
  freeShippingThreshold: number;
  freeShippingRemaining: number;
  freeShippingProgress: number; // 0 - 100%
  minOrderEnabled: boolean;
  minOrderAmount: number;
  isMinOrderSatisfied: boolean;
  minOrderRemaining: number;
  total: number;
  totalSavings: number;
  lines: LinePricingDetail[];
  // YA+ Membresía
  isYaPlusApplied?: boolean;
  yaPlusFreeShipping?: boolean;
  yaPlusOrderDiscount?: number;
  yaPlusTotalSavings?: number;
  // Mejoras de Packs
  hasPackFreeShipping?: boolean;
  hasPackSkipMinOrder?: boolean;
};

/**
 * Redondeo matemático seguro a 2 decimales para importes en euros
 */
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Comprueba si un descuento o promoción está dentro del rango temporal válido
 */
export function isDiscountActiveNow(
  active: boolean,
  startsAt: string | null | undefined,
  expiresAt: string | null | undefined
): boolean {
  if (!active) return false;
  const now = new Date();
  if (startsAt && new Date(startsAt) > now) return false;
  if (expiresAt && new Date(expiresAt) < now) return false;
  return true;
}

/**
 * Calcula el descuento aplicable a un producto individual con prioridad:
 * Descuento de producto > Descuento de categoría.
 */
export function getProductDiscount(
  productId: string,
  categoryId: string | null | undefined,
  basePrice: number,
  discounts: DbDiscount[] = []
): { discountedPrice: number; discountAmount: number; reason?: string } {
  // 1. Buscar descuento específico de producto
  const productDiscount = discounts.find(
    (d) =>
      d.scope === 'product' &&
      d.product_id === productId &&
      isDiscountActiveNow(d.active, d.starts_at, d.expires_at)
  );

  if (productDiscount) {
    let discountAmount = 0;
    if (productDiscount.discount_type === 'percentage') {
      discountAmount = round2(basePrice * (productDiscount.discount_value / 100));
    } else {
      discountAmount = Math.min(basePrice, productDiscount.discount_value);
    }
    const discountedPrice = round2(Math.max(0, basePrice - discountAmount));
    return {
      discountedPrice,
      discountAmount,
      reason: productDiscount.name || `Descuento ${productDiscount.discount_value}%`,
    };
  }

  // 2. Si no hay de producto, buscar descuento por categoría
  if (categoryId) {
    const categoryDiscount = discounts.find(
      (d) =>
        d.scope === 'category' &&
        d.category_id === categoryId &&
        isDiscountActiveNow(d.active, d.starts_at, d.expires_at)
    );

    if (categoryDiscount) {
      let discountAmount = 0;
      if (categoryDiscount.discount_type === 'percentage') {
        discountAmount = round2(basePrice * (categoryDiscount.discount_value / 100));
      } else {
        discountAmount = Math.min(basePrice, categoryDiscount.discount_value);
      }
      const discountedPrice = round2(Math.max(0, basePrice - discountAmount));
      return {
        discountedPrice,
        discountAmount,
        reason: categoryDiscount.name || `Descuento categoría`,
      };
    }
  }

  // Sin descuento aplicable
  return {
    discountedPrice: basePrice,
    discountAmount: 0,
  };
}

/**
 * Motor central de cálculo del carrito y checkout
 */
export function calculateCartPricing(params: {
  cartLines?: CartLine[];
  lines?: CartLine[];
  products: (Product | DbProduct)[];
  packs?: (DbPack | PackWithDetails)[];
  discounts?: DbDiscount[];
  promotions?: DbPromotion[];
  settings?: DbCommercialSettings;
  yaPlusBenefits?: YaPlusBenefits | null;
}): CartPricingSummary {
  const cartLines = params.cartLines || params.lines || [];
  const {
    products,
    packs = [],
    discounts = [],
    promotions = [],
    settings = DEFAULT_COMMERCIAL_SETTINGS,
    yaPlusBenefits = null,
  } = params;

  let rawSubtotal = 0;
  let subtotal = 0;
  let totalLineDiscounts = 0;
  const lineDetails: LinePricingDetail[] = [];
  let hasPackFreeShipping = false;
  let hasPackSkipMinOrder = false;

  for (const line of cartLines) {
    const isPack = Boolean(line.isPack || line.packId);
    const quantity = Math.max(1, line.quantity || 1);

    if (isPack) {
      // Cálculo de línea de Pack (incluyendo suplementos de opciones)
      const packId = line.packId || line.productId;
      const foundPack = packs.find((p) => p.id === packId || p.slug === packId);

      // Evaluar si el pack tiene ventajas especiales
      if (foundPack?.free_shipping || line.packFreeShipping) {
        hasPackFreeShipping = true;
      }
      if (foundPack?.skip_min_order || line.packSkipMinOrder) {
        hasPackSkipMinOrder = true;
      }

      // Sumar suplementos de opciones seleccionadas
      const optionsSupplement = (line.packSelections || []).reduce(
        (acc, sel) => acc + (Number(sel.priceSupplement) || 0),
        0
      );

      const basePackPrice = foundPack ? Number(foundPack.price) : Number(line.unitPrice || 0);
      const unitPrice = round2(basePackPrice + optionsSupplement);
      const originalPrice = foundPack?.reference_price
        ? round2(Number(foundPack.reference_price) + optionsSupplement)
        : unitPrice;
      const lineSub = round2(unitPrice * quantity);
      const rawLineSub = round2(originalPrice * quantity);

      rawSubtotal += rawLineSub;
      subtotal += lineSub;
      const unitDiscount = round2(Math.max(0, originalPrice - unitPrice));
      totalLineDiscounts += round2(unitDiscount * quantity);

      const selectionsSummary: string[] = [];
      if (line.packSelections && line.packSelections.length > 0) {
        for (const s of line.packSelections) {
          const suppText = s.priceSupplement && s.priceSupplement > 0 ? ` (+${round2(s.priceSupplement)} €)` : '';
          selectionsSummary.push(`${s.groupName}: ${s.productName}${suppText}`);
        }
      }

      lineDetails.push({
        lineId: line.lineId || `${packId}-${JSON.stringify(line.packSelections || '')}`,
        isPack: true,
        name: foundPack ? `[PACK] ${foundPack.name}` : line.packName || '[PACK]',
        image: foundPack?.image || line.packImage || '📦',
        quantity,
        originalUnitPrice: originalPrice,
        discountedUnitPrice: unitPrice,
        unitDiscount,
        lineSubtotal: lineSub,
        discountReason:
          originalPrice > unitPrice
            ? `Ahorras ${round2(originalPrice - unitPrice)} € por pack`
            : undefined,
        packSelectionsSummary: selectionsSummary,
      });
    } else {
      // Cálculo de línea de Producto individual
      const product = products.find(
        (p) => p.id === line.productId || ('slug' in p && p.slug === line.productId)
      );

      const basePrice = product ? Number(product.price) : Number(line.unitPrice || 0);
      const categoryId =
        product && 'category_id' in product
          ? (product as DbProduct).category_id
          : product && 'category' in product
          ? (product as Product).category
          : null;

      const discountResult = getProductDiscount(
        product?.id || line.productId,
        categoryId,
        basePrice,
        discounts
      );

      const unitPrice = discountResult.discountedPrice;
      const unitDiscount = discountResult.discountAmount;
      const lineSub = round2(unitPrice * quantity);
      const rawLineSub = round2(basePrice * quantity);

      rawSubtotal += rawLineSub;
      subtotal += lineSub;
      totalLineDiscounts += round2(unitDiscount * quantity);

      lineDetails.push({
        lineId: line.lineId || line.productId,
        isPack: false,
        name: product?.name || 'Producto',
        image: product?.image || '🛒',
        quantity,
        originalUnitPrice: basePrice,
        discountedUnitPrice: unitPrice,
        unitDiscount,
        lineSubtotal: lineSub,
        discountReason: discountResult.reason,
      });
    }
  }

  rawSubtotal = round2(rawSubtotal);
  subtotal = round2(subtotal);
  totalLineDiscounts = round2(totalLineDiscounts);

  // 5. EVALUACIÓN DE PROMOCIÓN AUTOMÁTICA (incluyendo 2x1)
  let appliedPromotion: DbPromotion | null = null;
  let promotionDiscount = 0;

  const eligiblePromos = promotions.filter(
    (promo) =>
      isDiscountActiveNow(promo.active, promo.starts_at, promo.expires_at) &&
      (promo.is_automatic ?? true) &&
      subtotal >= Number(promo.minimum_order)
  );

  for (const promo of eligiblePromos) {
    let calcDiscount = 0;
    if (promo.discount_type === 'two_for_one' || promo.is_two_for_one) {
      // Promoción 2x1: por cada 2 unidades, 1 es gratis
      for (const detail of lineDetails) {
        if (!detail.isPack) {
          if (!promo.applicable_product_id || detail.lineId === promo.applicable_product_id) {
            const freeUnits = Math.floor(detail.quantity / 2);
            calcDiscount += round2(freeUnits * detail.discountedUnitPrice);
          }
        }
      }
    } else if (promo.discount_type === 'percentage') {
      calcDiscount = round2(subtotal * (Number(promo.discount_value) / 100));
    } else {
      calcDiscount = Math.min(subtotal, Number(promo.discount_value));
    }

    if (calcDiscount > promotionDiscount) {
      promotionDiscount = calcDiscount;
      appliedPromotion = promo;
    }
  }

  promotionDiscount = round2(promotionDiscount);
  const subtotalAfterPromotion = round2(Math.max(0, subtotal - promotionDiscount));

  // 6 y 7. ENVÍO Y ENVÍO GRATIS
  const standardFee = Number(settings.standard_delivery_fee ?? 2.9);
  const freeShippingThreshold = Number(settings.free_shipping_threshold ?? 30.0);
  const freeShippingEnabled = Boolean(settings.free_shipping_enabled);

  let isFreeShipping = (freeShippingEnabled && subtotal >= freeShippingThreshold) || hasPackFreeShipping;
  let deliveryFee = isFreeShipping ? 0.0 : standardFee;

  // Beneficios de YA+ en Envío
  let yaPlusFreeShipping = false;
  if (yaPlusBenefits) {
    if (yaPlusBenefits.free_shipping) {
      isFreeShipping = true;
      deliveryFee = 0.0;
      yaPlusFreeShipping = true;
    } else if (
      yaPlusBenefits.free_shipping_min_order !== undefined &&
      subtotal >= yaPlusBenefits.free_shipping_min_order
    ) {
      isFreeShipping = true;
      deliveryFee = 0.0;
      yaPlusFreeShipping = true;
    } else if (yaPlusBenefits.shipping_discount_fixed) {
      deliveryFee = Math.max(0, round2(deliveryFee - yaPlusBenefits.shipping_discount_fixed));
    } else if (yaPlusBenefits.shipping_discount_percent) {
      deliveryFee = Math.max(0, round2(deliveryFee * (1 - yaPlusBenefits.shipping_discount_percent / 100)));
    }
  }

  const freeShippingRemaining = Math.max(0, round2(freeShippingThreshold - subtotal));
  const freeShippingProgress = freeShippingThreshold > 0
    ? Math.min(100, Math.round((subtotal / freeShippingThreshold) * 100))
    : 100;

  // 8. PEDIDO MÍNIMO
  const minOrderEnabled = Boolean(settings.min_order_enabled);
  const minOrderAmount = Number(settings.min_order_amount ?? 10.0);
  const isMinOrderSatisfied = hasPackSkipMinOrder || !minOrderEnabled || subtotal >= minOrderAmount;
  const minOrderRemaining = Math.max(0, round2(minOrderAmount - subtotal));

  // Beneficios de YA+ en Descuento de Pedido
  let yaPlusOrderDiscount = 0;
  if (yaPlusBenefits?.order_discount_percent && yaPlusBenefits.order_discount_percent > 0) {
    yaPlusOrderDiscount = round2(subtotalAfterPromotion * (yaPlusBenefits.order_discount_percent / 100));
  }

  const yaPlusDeliverySavings = yaPlusFreeShipping ? standardFee : Math.max(0, round2(standardFee - deliveryFee));
  const yaPlusTotalSavings = round2(yaPlusOrderDiscount + (yaPlusFreeShipping ? yaPlusDeliverySavings : 0));
  const isYaPlusApplied = Boolean(yaPlusBenefits && (yaPlusFreeShipping || yaPlusOrderDiscount > 0));

  // 9. TOTAL FINAL
  const total = round2(Math.max(0, subtotalAfterPromotion - yaPlusOrderDiscount) + deliveryFee);
  const totalSavings = round2(totalLineDiscounts + promotionDiscount + yaPlusOrderDiscount + (yaPlusFreeShipping ? yaPlusDeliverySavings : 0));

  return {
    rawSubtotal,
    totalLineDiscounts,
    subtotal,
    appliedPromotion,
    promotionDiscount,
    subtotalAfterPromotion,
    standardDeliveryFee: standardFee,
    deliveryFee,
    freeShippingEnabled,
    isFreeShipping,
    freeShippingThreshold,
    freeShippingRemaining,
    freeShippingProgress,
    minOrderEnabled,
    minOrderAmount,
    isMinOrderSatisfied,
    minOrderRemaining,
    total,
    totalSavings,
    lines: lineDetails,
    isYaPlusApplied,
    yaPlusFreeShipping,
    yaPlusOrderDiscount,
    yaPlusTotalSavings,
    hasPackFreeShipping,
    hasPackSkipMinOrder,
  };
}

/**
 * Valida la disponibilidad y stock de un pack
 */
export function isPackStockAvailable(
  pack: PackWithDetails,
  products: (Product | DbProduct)[]
): { available: boolean; reason?: string } {
  if (!pack.active) {
    return { available: false, reason: 'Pack inactivo' };
  }

  if (pack.pack_type === 'fixed') {
    if (!pack.items || pack.items.length === 0) {
      return { available: true };
    }

    for (const item of pack.items) {
      const prod = products.find((p) => p.id === item.product_id);
      if (!prod) continue;

      if ('active' in prod && !(prod as any).active) {
        return {
          available: false,
          reason: `Producto "${prod.name}" no disponible`,
        };
      }

      if ('stock_mode' in prod) {
        const dbProd = prod as DbProduct;
        if (dbProd.stock_mode === 'out_of_stock') {
          return {
            available: false,
            reason: `Producto "${dbProd.name}" agotado`,
          };
        }
        if (dbProd.stock_mode === 'in_stock' && dbProd.stock_quantity < item.quantity) {
          return {
            available: false,
            reason: `Stock insuficiente de "${dbProd.name}" (${dbProd.stock_quantity} disp.)`,
          };
        }
      } else if ('inStock' in prod && !(prod as Product).inStock) {
        return {
          available: false,
          reason: `Producto "${prod.name}" agotado`,
        };
      }
    }
    return { available: true };
  } else {
    // Configurable: verificar que cada grupo tiene al menos min_select opciones con stock
    if (!pack.groups || pack.groups.length === 0) return { available: true };

    for (const group of pack.groups) {
      const options = group.options || [];
      let availableOptionsCount = 0;

      for (const opt of options) {
        const prod = products.find((p) => p.id === opt.product_id);
        if (!prod || ('active' in prod && !(prod as any).active)) continue;

        let hasStock = true;
        if ('stock_mode' in prod) {
          if ((prod as DbProduct).stock_mode === 'out_of_stock') hasStock = false;
        } else if ('inStock' in prod && !(prod as Product).inStock) {
          hasStock = false;
        }

        if (hasStock) availableOptionsCount++;
      }

      if (availableOptionsCount < group.min_select) {
        return {
          available: false,
          reason: `Grupo "${group.name}" sin opciones suficientes en stock`,
        };
      }
    }

    return { available: true };
  }
}
