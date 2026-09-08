import type { CategorySlug, Product } from '../types/app';

export const categories: { slug: CategorySlug; name: string; icon: string; description: string }[] = [
  { slug: 'energeticas', name: 'Energéticas', icon: '⚡', description: 'Un empujón para seguir.' },
  { slug: 'bebidas', name: 'Bebidas', icon: '🥤', description: 'Frías, ahora mismo.' },
  { slug: 'snacks', name: 'Snacks', icon: '🥔', description: 'Para picar sin pensar.' },
  { slug: 'dulces', name: 'Dulces', icon: '🍫', description: 'El toque dulce.' },
  { slug: 'hielo', name: 'Hielo', icon: '🧊', description: 'Que no se caliente la noche.' },
  { slug: 'comida', name: 'Comida', icon: '🍕', description: 'Soluciones con hambre.' },
  { slug: 'mas', name: 'Más', icon: '✦', description: 'Lo que te salva el momento.' },
];

const product = (id: string, name: string, slug: string, price: number, category: CategorySlug, image: string, description: string): Product => ({
  id, name, slug, price, category, image, description, active: true, inStock: true,
  estimatedCost: price * .58, internalInstructions: 'Comprar en comercio local disponible.'
});

export const products: Product[] = [
  product('red-bull', 'Red Bull 250 ml', 'red-bull', 2.45, 'energeticas', '⚡', 'El clásico para aguantar el ritmo.'),
  product('monster', 'Monster Energy 500 ml', 'monster-energy', 3.15, 'energeticas', '🟢', 'Energía grande para noches largas.'),
  product('cocacola', 'Coca-Cola 2 L', 'coca-cola', 3.20, 'bebidas', '🥤', 'La de siempre, bien fría.'),
  product('cocacolazero', 'Coca-Cola Zero 2 L', 'coca-cola-zero', 3.20, 'bebidas', '◼', 'Todo el sabor, cero azúcar.'),
  product('fanta', 'Fanta Naranja 2 L', 'fanta-naranja', 2.95, 'bebidas', '🍊', 'Naranja y burbujas.'),
  product('aquarius', 'Aquarius Limón 1.5 L', 'aquarius-limon', 2.80, 'bebidas', '🍋', 'Refrescante y ligero.'),
  product('agua', 'Agua mineral 1.5 L', 'agua-mineral', 1.25, 'bebidas', '💧', 'Agua fresca, sin vueltas.'),
  product('lays', 'Lays Campesinas', 'lays-campesinas', 2.65, 'snacks', '🥔', 'Patatas crujientes de siempre.'),
  product('doritos', 'Doritos Tex-Mex', 'doritos-tex-mex', 2.85, 'snacks', '🔺', 'Sabor intenso para compartir.'),
  product('pringles', 'Pringles Original', 'pringles-original', 2.95, 'snacks', '🥫', 'Un tubo, cero migas.'),
  product('kitkat', 'KitKat 4 fingers', 'kitkat', 1.75, 'dulces', '🍫', 'Haz una pausa.'),
  product('oreo', 'Oreo Original', 'oreo', 2.60, 'dulces', '🍪', 'Galletas para abrir y no parar.'),
  product('gominolas', 'Mix de gominolas', 'mix-gominolas', 2.40, 'dulces', '🍬', 'Una mezcla para todos.'),
  product('hielo', 'Bolsa de hielo 2 kg', 'bolsa-hielo', 3.50, 'hielo', '🧊', 'Hielo de verdad para tus bebidas.'),
  product('pizza', 'Pizza individual barbacoa', 'pizza-barbacoa', 6.90, 'comida', '🍕', 'Una pizza individual lista para calentar.'),
  product('ramen', 'Ramen picante', 'ramen-picante', 2.55, 'comida', '🍜', 'Rápido, caliente y con carácter.'),
  product('pilas', 'Pilas AA x4', 'pilas-aa', 4.20, 'mas', '🔋', 'Para cuando el mando decide morir.'),
];
export const productById = (id: string) => products.find((item) => item.id === id);
export const euro = (amount: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);