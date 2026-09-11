import { useMemo, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { euro } from '../data/products';
import { AppHeader, CategoryCard, EmptyState, ProductCard, QuantitySelector } from './components';
import { SearchBar } from './SearchBar';
import { useCart } from './CartContext';
import { useCatalog } from './CatalogContext';
import { PackCard } from './PackCard';

export function AppHome() {
  const { categories, products } = useCatalog();
  const { packs } = useCart();
  const currentHour = new Date().getHours();
  const greeting =
    currentHour >= 21 || currentHour < 6
      ? 'Buenas noches'
      : currentHour < 14
      ? 'Buenos días'
      : 'Buenas tardes';

  const featured = products.slice(0, 4);
  const popular = products.slice(4, 8);
  const activePacks = packs.filter((p) => p.active);

  return (
    <>
      <AppHeader />
      <main id="app-home-page" className="max-w-5xl mx-auto px-4 pt-6 pb-28">
        {/* Banner Superior & Saludo */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b-2 border-ya-gray pb-4">
          <div>
            <p className="text-xs font-black text-ya-lime uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles size={14} /> {greeting} · Entrega exprés en Jerez
            </p>
            <h1 className="text-4xl sm:text-6xl font-black tracking-tighter leading-none mt-2">
              ¿Qué <span className="text-ya-lime">necesitas?</span>
            </h1>
          </div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest sm:text-right mt-1 sm:mt-0">
            "Lo necesitas. Lo tienes."
          </p>
        </div>

        {/* Buscador Acceso Rápido */}
        <Link
          id="home-search-bar-link"
          to="/app/buscar"
          className="mt-6 bg-ya-white text-ya-black border-2 border-ya-white flex items-center justify-between p-4 font-black hover:bg-ya-lime hover:border-ya-lime transition-colors"
        >
          <span className="text-sm uppercase tracking-wider">BUSCAR PRODUCTOS (RED BULL, HIELO, SNACKS...)</span>
          <span className="bg-ya-black text-ya-white p-2 text-xs font-black">BUSCAR</span>
        </Link>

        {/* Categorías */}
        <section id="categories-section" className="mt-8">
          <div className="flex justify-between items-baseline mb-3">
            <h2 className="font-black text-2xl uppercase tracking-tight">Categorías</h2>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              {categories.length} Secciones
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {categories.map((item) => (
              <CategoryCard key={item.slug} slug={item.slug} />
            ))}
          </div>
        </section>

        {/* Productos Destacados */}
        <section id="featured-section" className="mt-10">
          <div className="flex justify-between items-baseline mb-4">
            <div>
              <h2 className="font-black text-3xl uppercase tracking-tight">Destacados</h2>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                Lo más pedido esta noche
              </p>
            </div>
            <Link
              to="/app/buscar"
              className="text-ya-lime font-black text-xs uppercase tracking-wider flex items-center gap-1 hover:text-white transition-colors"
            >
              VER TODO <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {featured.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>

        {/* Sección de Packs Especiales YA */}
        {activePacks.length > 0 && (
          <section id="packs-showcase-section" className="mt-10">
            <div className="flex justify-between items-baseline mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-ya-lime text-ya-black text-[10px] font-black uppercase px-2 py-0.5 tracking-wider">
                    AHORRO & COMBINADOS
                  </span>
                </div>
                <h2 className="font-black text-3xl uppercase tracking-tight mt-1">Packs YA</h2>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                  Combos cerrados y personalizables listos en minutos
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-ya-lime">
                {activePacks.length} packs activos
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {activePacks.map((pack) => (
                <PackCard key={pack.id} pack={pack} />
              ))}
            </div>
          </section>
        )}

        {/* Banner de llamada contextual */}
        <section className="mt-10 bg-ya-lime text-ya-black p-6 border-2 border-ya-lime">
          <p className="font-black uppercase text-xs tracking-widest text-black/80">
            Servicio nocturno activo
          </p>
          <h2 className="font-black text-3xl sm:text-4xl tracking-tighter mt-1">
            Bebidas frías. Hielo en minutos.<br />Directo a tu puerta.
          </h2>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/app/categoria/hielo"
              className="bg-ya-black text-ya-lime px-5 py-3 font-black text-sm uppercase tracking-wider hover:bg-white hover:text-ya-black transition-colors"
            >
              Pedir hielo →
            </Link>
            <Link
              to="/app/categoria/energeticas"
              className="border-2 border-ya-black text-ya-black px-5 py-3 font-black text-sm uppercase tracking-wider hover:bg-ya-black hover:text-white transition-colors"
            >
              Energéticas →
            </Link>
          </div>
        </section>

        {/* Populares */}
        <section id="popular-section" className="mt-10">
          <div className="flex justify-between items-baseline mb-4">
            <div>
              <h2 className="font-black text-3xl uppercase tracking-tight">Populares</h2>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                Snacks y dulces para picar
              </p>
            </div>
            <Link
              to="/app/categoria/snacks"
              className="text-ya-lime font-black text-xs uppercase tracking-wider flex items-center gap-1 hover:text-white transition-colors"
            >
              VER SNACKS <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {popular.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

export function CategoryPage() {
  const { slug } = useParams();
  const { categories, products } = useCatalog();
  const category = categories.find((item) => item.slug === slug);
  const items = products.filter((item) => item.category === slug && item.active);

  if (!category) {
    return (
      <>
        <AppHeader back />
        <main className="p-4 pb-28 max-w-5xl mx-auto">
          <EmptyState
            title="Categoría no encontrada"
            text="La categoría seleccionada no existe o no está activa en Jerez."
          />
          <Link
            to="/app"
            className="block bg-ya-lime text-ya-black font-black text-center p-4 mt-6 uppercase"
          >
            Volver a la tienda
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader back />
      <main id={`category-page-${category.slug}`} className="max-w-5xl mx-auto px-4 pt-6 pb-28">
        <div className="border-b-2 border-ya-gray pb-4">
          <span className="text-5xl block mb-2">{category.icon}</span>
          <h1 className="font-black text-4xl sm:text-5xl tracking-tighter uppercase">
            {category.name}
          </h1>
          <p className="text-gray-400 font-bold mt-1 text-sm">{category.description}</p>
        </div>

        <div className="mt-6 flex justify-between items-center text-xs font-bold text-gray-400">
          <span>{items.length} PRODUCTOS DISPONIBLES</span>
          <span className="text-ya-lime">ENTREGA INMEDIATA</span>
        </div>

        {items.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
            {items.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        ) : (
          <div className="mt-8">
            <EmptyState
              title="Sin productos en esta categoría"
              text="Estamos ampliando catálogo para esta categoría en Jerez."
            />
          </div>
        )}
      </main>
    </>
  );
}

export function SearchPage() {
  const { products } = useCatalog();
  const [query, setQuery] = useState('');

  const result = useMemo(() => {
    const term = query.toLowerCase().trim();
    if (!term) return products.filter((p) => p.active);
    return products.filter((item) =>
      item.active &&
      [item.name, item.category, item.description].join(' ').toLowerCase().includes(term)
    );
  }, [query, products]);

  return (
    <>
      <AppHeader back />
      <main id="search-page" className="max-w-5xl mx-auto px-4 pt-6 pb-28">
        <h1 className="font-black text-4xl uppercase tracking-tight">Buscar</h1>
        <p className="text-gray-400 font-bold text-xs uppercase tracking-wider mt-1">
          Encuentra cualquier producto de la app
        </p>

        <div className="mt-4">
          <SearchBar value={query} onChange={setQuery} />
        </div>

        <div className="mt-5 flex justify-between items-center text-xs font-bold text-gray-400">
          <span>{result.length} RESULTADOS</span>
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-ya-lime uppercase hover:underline"
            >
              Borrar filtro
            </button>
          )}
        </div>

        {result.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
            {result.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        ) : (
          <div className="mt-8">
            <EmptyState
              title="No encontramos ese producto"
              text={`No hay coincidencias para "${query}". Prueba con "Red Bull", "Coca-Cola", "hielo" o "patatas".`}
            />
          </div>
        )}
      </main>
    </>
  );
}

export function ProductPage() {
  const { id } = useParams();
  const { getProductById } = useCatalog();
  const product = getProductById(id ?? '');
  const { lines, addToCart, increaseQuantity, decreaseQuantity } = useCart();
  const [addedNotice, setAddedNotice] = useState(false);

  if (!product) {
    return (
      <>
        <AppHeader back />
        <main className="p-4 pb-28 max-w-2xl mx-auto">
          <EmptyState
            title="Producto no disponible"
            text="Este producto no se encuentra en el inventario o ha cambiado su identificador."
          />
          <Link
            to="/app"
            className="block bg-ya-lime text-ya-black font-black text-center p-4 mt-6 uppercase"
          >
            Volver al catálogo
          </Link>
        </main>
      </>
    );
  }

  const quantity = lines.find((line) => line.productId === product.id)?.quantity ?? 0;
  const isImageEmoji = !product.image.startsWith('http') && !product.image.startsWith('/');

  const handleAdd = () => {
    addToCart(product.id);
    setAddedNotice(true);
    setTimeout(() => setAddedNotice(false), 2000);
  };

  return (
    <>
      <AppHeader back />
      <main id={`product-page-${product.id}`} className="max-w-2xl mx-auto px-4 pt-6 pb-28">
        {/* Visual Box */}
        <div className="h-64 sm:h-80 bg-ya-gray border-2 border-ya-gray grid place-items-center text-8xl sm:text-9xl relative overflow-hidden">
          {isImageEmoji ? (
            <span>{product.image}</span>
          ) : (
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          )}
          <span className="absolute top-3 left-3 bg-ya-black border border-ya-gray px-2 py-1 text-[10px] font-black text-ya-lime uppercase tracking-widest">
            {product.category}
          </span>
          {!product.inStock ? (
            <span className="absolute top-3 right-3 bg-red-600 text-white px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border border-red-400">
              Agotado
            </span>
          ) : product.stockMode === 'in_stock' && (product.stockQuantity ?? 0) <= (product.minStock ?? 5) ? (
            <span className="absolute top-3 right-3 bg-amber-500 text-ya-black px-2.5 py-1 text-[10px] font-black uppercase tracking-widest font-mono">
              Últimas {product.stockQuantity} u.
            </span>
          ) : (
            <span className="absolute top-3 right-3 bg-ya-lime text-ya-black px-2 py-1 text-[10px] font-black uppercase tracking-widest">
              En stock
            </span>
          )}
        </div>

        <p className="font-bold text-ya-lime uppercase tracking-widest text-xs mt-6">
          {product.inStock ? 'Disponible para entrega inmediata en Jerez' : 'Temporalmente fuera de inventario'}
        </p>
        <h1 className="font-black text-3xl sm:text-5xl tracking-tighter mt-2">{product.name}</h1>
        <p className="font-black text-3xl mt-4 text-ya-lime">{euro(product.price)}</p>
        <p className="text-gray-300 text-base sm:text-lg mt-4 leading-relaxed">
          {product.description}
        </p>

        {/* Alerta de producto agotado */}
        {!product.inStock && (
          <div className="mt-6 bg-red-950/60 border-2 border-red-500/60 p-4 text-red-200 text-xs sm:text-sm font-bold flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <span>
              Este producto se encuentra <strong>agotado</strong> en nuestro almacén de Jerez. No es posible tramitar pedidos de este artículo hasta su próxima reposición.
            </span>
          </div>
        )}

        {/* Feedback visual al añadir */}
        {addedNotice && (
          <div
            role="status"
            className="mt-4 bg-ya-lime text-ya-black p-3 font-black text-sm uppercase tracking-wider text-center"
          >
            ✓ ¡Añadido al carrito con éxito!
          </div>
        )}

        {/* Controles de compra */}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          {quantity > 0 && (
            <div className="flex items-center justify-between sm:justify-start gap-3 bg-ya-gray p-2 border-2 border-ya-gray">
              <span className="text-xs font-bold uppercase text-gray-400 px-2">En carrito:</span>
              <QuantitySelector
                quantity={quantity}
                max={product.stockMode === 'in_stock' ? product.stockQuantity : undefined}
                onAdd={() => increaseQuantity(product.id)}
                onRemove={() => decreaseQuantity(product.id)}
              />
            </div>
          )}

          {!product.inStock ? (
            <button
              id={`sold-out-btn-${product.id}`}
              disabled
              className="flex-1 min-h-12 bg-ya-gray border-2 border-red-500/40 text-red-400 font-black uppercase text-base tracking-wider cursor-not-allowed opacity-80 py-3 px-6"
            >
              Producto Agotado
            </button>
          ) : (
            <button
              id={`add-to-cart-btn-${product.id}`}
              onClick={handleAdd}
              className="flex-1 min-h-12 bg-ya-lime text-ya-black font-black uppercase text-base tracking-wider hover:bg-white transition-colors py-3 px-6"
            >
              {quantity ? 'Añadir otra unidad' : 'Añadir al carrito'}
            </button>
          )}
        </div>

        {/* Acceso directo al carrito si ya hay artículos */}
        {quantity > 0 && (
          <Link
            to="/app/carrito"
            className="block mt-4 text-center border-2 border-ya-gray p-3 font-black text-sm uppercase tracking-wider text-gray-300 hover:border-ya-lime hover:text-ya-lime transition-colors"
          >
            Ver carrito con {quantity} {quantity === 1 ? 'unidad' : 'unidades'} →
          </Link>
        )}
      </main>
    </>
  );
}
