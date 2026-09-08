// ==============================================================================
// YA - TEST SUITE DE VALIDACIÓN: MOTOR COMERCIAL Y PACKS (PHASE 3B)
// Archivo: src/tests/commercialEngine.test.ts
// ==============================================================================

declare const process: any;

import {
  calculateCartPricing,
  getProductDiscount,
  isPackStockAvailable,
} from '../lib/pricing';
import type {
  CartLine,
  DbCommercialSettings,
  DbDiscount,
  DbPromotion,
  PackWithDetails,
  Product,
} from '../types/app';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

// ------------------------------------------------------------------------------
// CATÁLOGO MOCK PARA TESTS
// ------------------------------------------------------------------------------
const testProducts: Product[] = [
  {
    id: 'prod-rb-250',
    slug: 'prod-rb-250',
    name: 'Red Bull 250ml',
    description: 'Bebida energética',
    price: 2.2,
    category: 'energeticas',
    image: '⚡',
    inStock: true,
    active: true,
    estimatedCost: 1.0,
    internalInstructions: '',
  },
  {
    id: 'prod-monster-green',
    slug: 'prod-monster-green',
    name: 'Monster Energy Ultra 500ml',
    description: 'Bebida energética sin azúcar',
    price: 2.5,
    category: 'energeticas',
    image: '⚡',
    inStock: true,
    active: true,
    estimatedCost: 1.1,
    internalInstructions: '',
  },
  {
    id: 'prod-hielo-2kg',
    slug: 'prod-hielo-2kg',
    name: 'Bolsa de hielo macizo 2kg',
    description: 'Hielo en cubos macizos',
    price: 2.5,
    category: 'hielo',
    image: '🧊',
    inStock: true,
    active: true,
    estimatedCost: 0.8,
    internalInstructions: '',
  },
  {
    id: 'prod-doritos',
    slug: 'prod-doritos',
    name: 'Doritos Tex-Mex 140g',
    description: 'Tortilla de maíz sabor queso',
    price: 1.8,
    category: 'snacks',
    image: '🧀',
    inStock: true,
    active: true,
    estimatedCost: 0.9,
    internalInstructions: '',
  },
  {
    id: 'prod-lays',
    slug: 'prod-lays',
    name: 'Lay\'s Campesinas 150g',
    description: 'Patatas fritas',
    price: 1.9,
    category: 'snacks',
    image: '🥔',
    inStock: false, // AGOTADO PARA TESTS DE STOCK
    active: true,
    estimatedCost: 0.9,
    internalInstructions: '',
  },
];

const testSettings: DbCommercialSettings = {
  id: 'settings-test',
  min_order_enabled: true,
  min_order_amount: 10.0,
  free_shipping_enabled: true,
  free_shipping_threshold: 25.0,
  standard_delivery_fee: 2.9,
};

// ------------------------------------------------------------------------------
// TEST 1: DESCUENTO ESPECÍFICO DE PRODUCTO (PORCENTAJE Y FIJO)
// ------------------------------------------------------------------------------
console.log('\n--- TEST 1: DESCUENTO ESPECÍFICO DE PRODUCTO ---');
const productDiscounts: DbDiscount[] = [
  {
    id: 'disc-1',
    name: '10% Red Bull',
    scope: 'product',
    product_id: 'prod-rb-250',
    category_id: null,
    discount_type: 'percentage',
    discount_value: 10,
    active: true,
    created_at: new Date().toISOString(),
    description: null,
    starts_at: null,
    expires_at: null,
    updated_at: new Date().toISOString(),
  },
];

const d1 = getProductDiscount('prod-rb-250', 'energeticas', 2.2, productDiscounts);
// 2.2 - 10% (0.22) = 1.98
assert(d1.discountAmount === 0.22, 'Descuento del 10% sobre 2.20€ es 0.22€', `Obtenido: ${d1.discountAmount}`);
assert(d1.discountedPrice === 1.98, 'Precio con descuento es 1.98€', `Obtenido: ${d1.discountedPrice}`);

// ------------------------------------------------------------------------------
// TEST 2: DESCUENTO POR CATEGORÍA Y PRIORIDAD PRODUCTO > CATEGORÍA
// ------------------------------------------------------------------------------
console.log('\n--- TEST 2: DESCUENTO POR CATEGORÍA Y PRIORIDAD ---');
const mixedDiscounts: DbDiscount[] = [
  {
    id: 'disc-cat-snacks',
    name: '15% en Snacks',
    scope: 'category',
    product_id: null,
    category_id: 'snacks',
    discount_type: 'percentage',
    discount_value: 15,
    active: true,
    created_at: new Date().toISOString(),
    description: null,
    starts_at: null,
    expires_at: null,
    updated_at: new Date().toISOString(),
  },
  {
    id: 'disc-prod-doritos',
    name: '0.50€ off en Doritos',
    scope: 'product',
    product_id: 'prod-doritos',
    category_id: null,
    discount_type: 'fixed',
    discount_value: 0.5,
    active: true,
    created_at: new Date().toISOString(),
    description: null,
    starts_at: null,
    expires_at: null,
    updated_at: new Date().toISOString(),
  },
];

// Doritos debe recibir el descuento de producto (0.50€), ignorando el de categoría
const dDoritos = getProductDiscount('prod-doritos', 'snacks', 1.8, mixedDiscounts);
assert(dDoritos.discountAmount === 0.5, 'Descuento de producto prevalece sobre categoría', `Obtenido: ${dDoritos.discountAmount}`);
assert(dDoritos.discountedPrice === 1.3, 'Precio Doritos con 0.50€ de descuento es 1.30€', `Obtenido: ${dDoritos.discountedPrice}`);

// Otro producto de snacks sin descuento propio debe recibir el 15% de categoría
const dLays = getProductDiscount('prod-lays', 'snacks', 2.0, mixedDiscounts);
assert(dLays.discountAmount === 0.3, 'Producto de categoría snacks recibe 15% (0.30€ sobre 2.00€)', `Obtenido: ${dLays.discountAmount}`);
assert(dLays.discountedPrice === 1.7, 'Precio con descuento de categoría es 1.70€', `Obtenido: ${dLays.discountedPrice}`);

// ------------------------------------------------------------------------------
// TEST 3: PROMOCIÓN AUTOMÁTICA POR UMBRAL DE VOLUMEN
// ------------------------------------------------------------------------------
console.log('\n--- TEST 3: PROMOCIÓN AUTOMÁTICA POR VOLUMEN ---');
const promotions: DbPromotion[] = [
  {
    id: 'promo-15-20',
    code: 'AUTO15',
    name: '15% en pedidos > 20€',
    description: null,
    discount_type: 'percentage',
    discount_value: 15,
    minimum_order: 20.0,
    is_automatic: true,
    starts_at: null,
    expires_at: null,
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'promo-30-35',
    code: 'AUTO20',
    name: '20% en pedidos > 35€',
    description: null,
    discount_type: 'percentage',
    discount_value: 20,
    minimum_order: 35.0,
    is_automatic: true,
    starts_at: null,
    expires_at: null,
    active: true,
    created_at: new Date().toISOString(),
  },
];

// Carrito con 10 Red Bulls (10 * 2.2 = 22€) -> supera 20€, califica para AUTO15
const linesOver20: CartLine[] = [{ productId: 'prod-rb-250', quantity: 10 }];
const pOver20 = calculateCartPricing({
  lines: linesOver20,
  products: testProducts,
  packs: [],
  discounts: [],
  promotions,
  settings: testSettings,
});

assert(pOver20.appliedPromotion !== null, 'Promoción aplicada automáticamente');
assert(pOver20.appliedPromotion?.code === 'AUTO15', 'Código aplicado es AUTO15');
assert(pOver20.promotionDiscount === 3.3, 'Descuento del 15% sobre 22€ es 3.30€', `Obtenido: ${pOver20.promotionDiscount}`);

// ------------------------------------------------------------------------------
// TEST 4: ENVÍO GRATIS Y BARRA DE PROGRESO
// ------------------------------------------------------------------------------
console.log('\n--- TEST 4: REGLA DE ENVÍO GRATIS ---');
// Pedido con 22€ (subtotal < 25€ umbral de envío gratis)
assert(pOver20.isFreeShipping === false, 'Con 22€ no hay envío gratis (umbral 25€)');
assert(pOver20.deliveryFee === 2.9, 'Se aplica tarifa estándar de 2.90€');
assert(pOver20.freeShippingRemaining === 3.0, 'Faltan 3.00€ para envío gratis (25 - 22)', `Obtenido: ${pOver20.freeShippingRemaining}`);

// Carrito con 12 Red Bulls (12 * 2.2 = 26.40€) -> supera 25€
const linesOver25: CartLine[] = [{ productId: 'prod-rb-250', quantity: 12 }];
const pOver25 = calculateCartPricing({
  lines: linesOver25,
  products: testProducts,
  packs: [],
  discounts: [],
  promotions: [],
  settings: testSettings,
});

assert(pOver25.isFreeShipping === true, 'Con 26.40€ se activa el ENVÍO GRATIS');
assert(pOver25.deliveryFee === 0, 'Coste de entrega es 0.00€');
assert(pOver25.freeShippingProgress === 100, 'Progreso de envío gratis es 100%');

// ------------------------------------------------------------------------------
// TEST 5: VALIDACIÓN DE PEDIDO MÍNIMO
// ------------------------------------------------------------------------------
console.log('\n--- TEST 5: VALIDACIÓN DE PEDIDO MÍNIMO ---');
// 1 Red Bull = 2.20€ (mínimo configurado es 10€)
const linesBelowMin: CartLine[] = [{ productId: 'prod-rb-250', quantity: 1 }];
const pBelowMin = calculateCartPricing({
  lines: linesBelowMin,
  products: testProducts,
  packs: [],
  discounts: [],
  promotions: [],
  settings: testSettings,
});

assert(pBelowMin.minOrderEnabled === true, 'Pedido mínimo está activo');
assert(pBelowMin.isMinOrderSatisfied === false, 'Con 2.20€ no se satisface el pedido mínimo de 10€');
assert(pBelowMin.minOrderRemaining === 7.8, 'Faltan 7.80€ para alcanzar el pedido mínimo', `Obtenido: ${pBelowMin.minOrderRemaining}`);

// 5 Red Bulls = 11€ >= 10€
const linesAboveMin: CartLine[] = [{ productId: 'prod-rb-250', quantity: 5 }];
const pAboveMin = calculateCartPricing({
  lines: linesAboveMin,
  products: testProducts,
  packs: [],
  discounts: [],
  promotions: [],
  settings: testSettings,
});
assert(pAboveMin.isMinOrderSatisfied === true, 'Con 11.00€ se satisface el pedido mínimo');
assert(pAboveMin.minOrderRemaining === 0, 'Restante para pedido mínimo es 0€');

// ------------------------------------------------------------------------------
// TEST 6: PACK CERRADO Y VALIDACIÓN DE STOCK
// ------------------------------------------------------------------------------
console.log('\n--- TEST 6: PACK CERRADO Y STOCK ---');
const fixedPackWithStock: PackWithDetails = {
  id: 'pack-redbull-ice',
  name: 'Pack Energía Fría',
  slug: 'pack-energia-fria',
  description: '2 Red Bull + 1 Hielo',
  image: '⚡🧊',
  pack_type: 'fixed',
  price: 5.9,
  reference_price: 6.9,
  sort_order: 1,
  active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  items: [
    { id: 'i1', pack_id: 'pack-redbull-ice', product_id: 'prod-rb-250', quantity: 2, sort_order: 1, created_at: '' },
    { id: 'i2', pack_id: 'pack-redbull-ice', product_id: 'prod-hielo-2kg', quantity: 1, sort_order: 2, created_at: '' },
  ],
};

const stockRes1 = isPackStockAvailable(fixedPackWithStock, testProducts);
assert(stockRes1.available === true, 'Pack con items en stock está disponible');

// Pack cerrado que contiene producto agotado (prod-lays)
const fixedPackOutOfStock: PackWithDetails = {
  id: 'pack-snack-lays',
  name: 'Pack Aperitivo',
  slug: 'pack-aperitivo',
  description: 'Doritos + Lays',
  image: '🥔',
  pack_type: 'fixed',
  price: 3.2,
  reference_price: null,
  sort_order: 2,
  active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  items: [
    { id: 'i3', pack_id: 'pack-snack-lays', product_id: 'prod-lays', quantity: 1, sort_order: 1, created_at: '' },
  ],
};

const stockRes2 = isPackStockAvailable(fixedPackOutOfStock, testProducts);
assert(stockRes2.available === false, 'Pack que incluye producto agotado no está disponible');
assert(stockRes2.reason?.includes('agotado') === true, 'Razón de indisponibilidad detectada correctamente');

// ------------------------------------------------------------------------------
// TEST 7: PRICING DE PACK EN CARRITO
// ------------------------------------------------------------------------------
console.log('\n--- TEST 7: PRICING DE PACK EN CARRITO ---');
const packLine: CartLine = {
  productId: 'pack-redbull-ice',
  quantity: 2,
  isPack: true,
  packId: 'pack-redbull-ice',
  packName: 'Pack Energía Fría',
  unitPrice: 5.9,
};

const pPack = calculateCartPricing({
  lines: [packLine],
  products: testProducts,
  packs: [fixedPackWithStock],
  discounts: [],
  promotions: [],
  settings: testSettings,
});

// 2 packs * 5.90€ = 11.80€ (supera min_order 10€, no supera free_shipping 25€)
assert(pPack.subtotal === 11.8, 'Subtotal de 2 packs a 5.90€ es 11.80€', `Obtenido: ${pPack.subtotal}`);
assert(pPack.isMinOrderSatisfied === true, 'Con 11.80€ cumple pedido mínimo');
assert(pPack.deliveryFee === 2.9, 'Aplica envío estándar de 2.90€');
assert(pPack.total === 14.7, 'Total final es 11.80 + 2.90 = 14.70€', `Obtenido: ${pPack.total}`);

// ------------------------------------------------------------------------------
// RESUMEN FINAL
// ------------------------------------------------------------------------------
console.log('\n======================================================');
console.log(`RESULTADO DE TESTS: ${passed} pasados, ${failed} fallados.`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
