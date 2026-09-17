import { useMemo, useState } from 'react';
import { ArrowRight, Sparkles, Lightbulb, Gift } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { euro } from '../data/products';
import { AppHeader, CategoryCard, EmptyState, ProductCard, QuantitySelector } from './components';
import { SearchBar } from './SearchBar';
import { useCart } from './CartContext';
import { useCatalog } from './CatalogContext';
import { PackCard } from './PackCard';
import { getProductDiscount } from '../lib/pricing';
import { isRealImageUrl, formatImageUrl } from '../lib/cloudinary';
import { SeoHead } from '../components/seo/SeoHead';
import { Breadcrumbs } from '../components/seo/Breadcrumbs';
import { ProductSuggestionModal } from '../components/ProductSuggestionModal';
import {
  getProductSchema,
  getItemListSchema,
  getBreadcrumbSchema,
  getWebSiteSchema,
  getOrganizationSchema,
  getCanonicalUrl,
} from '../lib/seo';

export function AppHome() {
  const { categories, products } = useCatalog();
  const { packs } = useCart();
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
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
      <SeoHead
        title="Tienda Online YA Delivery Jerez — Bebidas, Snacks y Hielo"
        description="Pide bebidas frías, energéticas, aperitivos, dulces y bolsas de hielo con entrega urgente en Jerez de la Frontera. Lo necesitas. Lo tienes."
        path="/app"
        structuredData={[getWebSiteSchema(), getOrganizationSchema()]}
      />
      <AppHeader />
      <main id="app-home-page" className="max-w-5xl mx-auto px-4 pt-6 pb-28">
        <Breadcrumbs items={[{ name: 'Tienda Jerez', url: '/app' }]} className="mb-3" />
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

        {/* Sección Integrada: Drops semanales / Sorteo mensual */}
        <section id="home-drops-section" className="mt-10">
          <div className="bg-ya-gray/30 border-2 border-ya-gray p-5 hover:border-ya-lime transition-colors">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 bg-ya-lime text-ya-black shrink-0 font-black">
                  <Gift size={22} />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-ya-lime">
                    RECOMPENSAS CON TUS PEDIDOS
                  </span>
                  <h3 className="text-lg sm:text-xl font-black uppercase text-white tracking-tight">
                    Drops semanales / Sorteo mensual
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Gana premios directos en cada pedido y acumula participaciones en el sorteo de cada mes.
                  </p>
                </div>
              </div>
              <Link
                to="/app/drops"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-ya-lime text-ya-black font-black text-xs uppercase tracking-wider hover:bg-white transition-colors shrink-0"
              >
                VER DROPS Y PREMIOS <ArrowRight size={14} />
              </Link>
            </div>
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

        {/* Banner CTA Sugerencias de productos */}
        <section className="mt-12 border-2 border-ya-gray bg-zinc-900/60 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-ya-lime/10 border border-ya-lime text-ya-lime shrink-0">
              <Lightbulb size={24} />
            </div>
            <div>
              <h3 className="font-black text-lg uppercase tracking-tight text-white">
                ¿Echas en falta algún producto o marca?
              </h3>
              <p className="text-xs text-gray-400 mt-1 max-w-xl font-medium">
                Dinos qué artículo necesitas en Jerez y nuestro equipo de abastecimiento lo conseguirá y añadirá al catálogo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSuggestionOpen(true)}
            className="shrink-0 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-xs px-5 py-3 hover:bg-white transition-colors flex items-center gap-2"
          >
            <Lightbulb size={16} /> Sugerir producto
          </button>
        </section>

        <ProductSuggestionModal
          isOpen={isSuggestionOpen}
          onClose={() => setIsSuggestionOpen(false)}
        />
      </main>
    </>
  );
}

export function CategoryPage() {
  const { slug } = useParams();
  const { categories, products } = useCatalog();
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const category = categories.find((item) => item.slug === slug);
  const items = products.filter((item) => item.category === slug && item.active);

  if (!category) {
    return (
      <>
        <SeoHead
          title="Categoría no encontrada | YA Delivery Jerez"
          description="La categoría seleccionada no existe o no está activa en Jerez de la Frontera."
          robots="noindex, follow"
        />
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

  const breadcrumbs = [
    { name: 'Catálogo', url: '/app' },
    { name: category.name, url: `/app/categoria/${category.slug}` },
  ];

  const structuredData = [
    getItemListSchema(
      `${category.name} en Jerez`,
      items.map((p) => ({
        name: p.name,
        url: `/app/producto/${p.slug || p.id}`,
        price: p.price,
      }))
    ),
    getBreadcrumbSchema(breadcrumbs),
  ];

  return (
    <>
      <SeoHead
        title={`Comprar ${category.name} a Domicilio en Jerez | YA Delivery`}
        description={`${category.description} Pide ${category.name.toLowerCase()} a domicilio en Jerez de la Frontera con entrega inmediata.`}
        path={`/app/categoria/${category.slug}`}
        structuredData={structuredData}
      />
      <AppHeader back />
      <main id={`category-page-${category.slug}`} className="max-w-5xl mx-auto px-4 pt-6 pb-28">
        <Breadcrumbs items={breadcrumbs} className="mb-4" />
        <div className="border-b-2 border-ya-gray pb-4">
          <span className="text-5xl block mb-2">{category.icon}</span>
          <h1 className="font-black text-4xl sm:text-5xl tracking-tighter uppercase">
            {category.name}
          </h1>
          <p className="text-gray-400 font-bold mt-1 text-sm">{category.description}</p>
        </div>

        <div className="mt-6 flex justify-between items-center text-xs font-bold text-gray-400">
          <span>{items.length} PRODUCTOS DISPONIBLES EN JEREZ</span>
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

        {/* CTA Sugerir en categoría */}
        <div className="mt-10 border-2 border-ya-gray bg-zinc-900/40 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-ya-lime/10 border border-ya-lime text-ya-lime shrink-0">
              <Lightbulb size={20} />
            </div>
            <div>
              <p className="font-black text-sm uppercase tracking-tight text-white">
                ¿No ves tu producto o marca preferida en {category.name}?
              </p>
              <p className="text-xs text-gray-400">
                Pídelo y lo buscaremos para abastecerlo en Jerez.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSuggestionOpen(true)}
            className="bg-ya-lime text-ya-black font-black uppercase text-xs px-4 py-2.5 hover:bg-white transition-colors flex items-center gap-1.5 shrink-0"
          >
            <Lightbulb size={14} /> Sugerir artículo
          </button>
        </div>

        <ProductSuggestionModal
          isOpen={isSuggestionOpen}
          onClose={() => setIsSuggestionOpen(false)}
        />
      </main>
    </>
  );
}

export function SearchPage() {
  const { products } = useCatalog();
  const [query, setQuery] = useState('');
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);

  const result = useMemo(() => {
    const term = query.toLowerCase().trim();
    if (!term) return products.filter((p) => p.active);
    return products.filter((item) =>
      item.active &&
      [item.name, item.category, item.description].join(' ').toLowerCase().includes(term)
    );
  }, [query, products]);

  const breadcrumbs = [
    { name: 'Catálogo', url: '/app' },
    { name: 'Buscador', url: '/app/buscar' },
  ];

  return (
    <>
      <SeoHead
        title="Buscar Productos | YA Delivery Jerez"
        description="Encuentra bebidas frías, energéticas, aperitivos y hielo a domicilio en Jerez de la Frontera."
        path="/app/buscar"
        robots="noindex, follow"
      />
      <AppHeader back />
      <main id="search-page" className="max-w-5xl mx-auto px-4 pt-6 pb-28">
        <Breadcrumbs items={breadcrumbs} className="mb-4" />
        <h1 className="font-black text-4xl uppercase tracking-tight">Buscar Productos</h1>
        <p className="text-gray-400 font-bold text-xs uppercase tracking-wider mt-1">
          Encuentra cualquier producto en el catálogo de Jerez
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
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
              {result.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>

            {/* Banner permanente en buscador */}
            <div className="mt-10 border-2 border-ya-gray bg-zinc-900/40 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-ya-lime/10 border border-ya-lime text-ya-lime shrink-0">
                  <Lightbulb size={18} />
                </div>
                <div>
                  <p className="font-black text-xs sm:text-sm uppercase tracking-tight text-white">
                    ¿Echas en falta algún producto en YA Jerez?
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Dinos qué necesitas y lo añadiremos al catálogo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSuggestionOpen(true)}
                className="bg-ya-lime text-ya-black font-black uppercase text-xs px-4 py-2 hover:bg-white transition-colors flex items-center gap-1.5 shrink-0"
              >
                <Lightbulb size={13} /> Sugerir producto
              </button>
            </div>
          </>
        ) : (
          <div className="mt-8 space-y-4">
            <EmptyState
              title="No encontramos ese producto"
              text={`No hay coincidencias para "${query}". Prueba con "Red Bull", "Coca-Cola", "hielo" o "patatas".`}
            />
            <div className="border-2 border-ya-lime bg-ya-lime/10 p-5 text-center flex flex-col items-center">
              <div className="p-2 bg-ya-lime text-ya-black mb-2">
                <Lightbulb size={20} />
              </div>
              <p className="font-black text-sm uppercase text-white">
                ¿Buscabas un producto que no está en el catálogo?
              </p>
              <p className="text-xs text-gray-300 mt-1 max-w-md">
                Indícanoslo y el equipo de YA lo buscará en comercios locales de Jerez para incorporarlo.
              </p>
              <button
                type="button"
                onClick={() => setIsSuggestionOpen(true)}
                className="mt-3 bg-ya-lime text-ya-black font-black uppercase text-xs px-6 py-2.5 hover:bg-white transition-colors inline-flex items-center gap-2"
              >
                <Lightbulb size={15} /> Sugerir producto
              </button>
            </div>
          </div>
        )}

        <ProductSuggestionModal
          isOpen={isSuggestionOpen}
          onClose={() => setIsSuggestionOpen(false)}
        />
      </main>
    </>
  );
}

export function ProductPage() {
  const { id } = useParams();
  const { products, categories, getProductById } = useCatalog();
  const product = products.find((p) => p.id === id || p.slug === id) || getProductById(id ?? '');
  const { lines, addToCart, increaseQuantity, decreaseQuantity, activeDiscounts } = useCart();
  const [addedNotice, setAddedNotice] = useState(false);

  if (!product) {
    return (
      <>
        <SeoHead
          title="Producto no encontrado | YA Delivery Jerez"
          description="El producto solicitado no está disponible actualmente en Jerez de la Frontera."
          robots="noindex, follow"
        />
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

  const category = categories.find((c) => c.slug === product.category);
  const canonicalPath = `/app/producto/${product.slug || product.id}`;
  const breadcrumbs = [
    { name: 'Catálogo', url: '/app' },
    { name: category?.name ?? product.category, url: `/app/categoria/${product.category}` },
    { name: product.name, url: canonicalPath },
  ];

  const structuredData = [
    getProductSchema(product, getCanonicalUrl(canonicalPath)),
    getBreadcrumbSchema(breadcrumbs),
  ];

  const relatedProducts = products
    .filter((p) => p.category === product.category && p.id !== product.id && p.active)
    .slice(0, 4);

  // Variantes del producto
  const hasVariants = Boolean(product.hasVariants && product.variants && product.variants.length > 0);
  const variantsList = product.variants || [];
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(() => {
    if (!hasVariants) return null;
    const firstActive = variantsList.find((v) => v.active && v.stock > 0) || variantsList.find((v) => v.active) || variantsList[0];
    return firstActive?.id || null;
  });

  const selectedVariant = variantsList.find((v) => v.id === selectedVariantId) || null;

  // Si tiene variante seleccionada, el precio y stock provienen de ella
  const basePrice = selectedVariant ? Number(selectedVariant.price) : Number(product.price);
  const discountResult = getProductDiscount(product.id, category?.id, basePrice, activeDiscounts);
  const hasDiscount = discountResult.discountAmount > 0;
  const discountedPrice = discountResult.discountedPrice;
  const discountPercent = hasDiscount && basePrice > 0 ? Math.round((discountResult.discountAmount / basePrice) * 100) : 0;

  const isVariantOutOfStock = selectedVariant ? (!selectedVariant.active || selectedVariant.stock <= 0) : false;
  const isProductOutOfStock = !product.inStock || (product.stockMode === 'in_stock' && (product.stockQuantity ?? 0) <= 0);
  const isEffectiveOutOfStock = hasVariants ? isVariantOutOfStock : isProductOutOfStock;

  // Galería e imagen activa
  const gallery = useMemo(() => {
    const list: string[] = [];
    if (selectedVariant?.image) {
      list.push(selectedVariant.image);
    }
    if (product?.images && Array.isArray(product.images) && product.images.length > 0) {
      product.images.forEach((img) => {
        if (!list.includes(img)) list.push(img);
      });
    } else if (product?.image && !list.includes(product.image)) {
      list.push(product.image);
    }
    return list;
  }, [product, selectedVariant]);

  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const currentImage = gallery[activeImageIdx] || selectedVariant?.image || product?.image || '📦';
  const isImageEmoji = !isRealImageUrl(currentImage);

  // Cantidad en carrito según si tiene variantes o no
  const matchingLine = hasVariants && selectedVariant
    ? lines.find((line) => line.productId === product.id && line.variantId === selectedVariant.id)
    : lines.find((line) => line.productId === product.id && !line.variantId);

  const quantity = matchingLine?.quantity ?? 0;
  const lineKey = matchingLine?.lineId || (hasVariants && selectedVariant ? `prod-${product.id}-var-${selectedVariant.id}` : product.id);

  const handleAdd = () => {
    if (hasVariants && !selectedVariant) {
      return;
    }
    if (hasVariants && selectedVariant) {
      addToCart(product.id, 1, {
        variantId: selectedVariant.id,
        variantName: selectedVariant.name,
        variantImage: selectedVariant.image || product.image,
        variantPrice: Number(selectedVariant.price),
        categoryId: category?.id,
        categorySlug: category?.slug || product.category,
      });
    } else {
      addToCart(product.id, 1, {
        categoryId: category?.id,
        categorySlug: category?.slug || product.category,
      });
    }
    setAddedNotice(true);
    setTimeout(() => setAddedNotice(false), 2000);
  };

  return (
    <>
      <SeoHead
        title={`${product.name} a Domicilio en Jerez (${euro(product.price)}) | YA Delivery`}
        description={`${product.name} disponible por ${euro(product.price)} en Jerez de la Frontera. ${product.description} ${
          product.inStock ? 'En stock con entrega inmediata a domicilio.' : 'Temporalmente sin stock.'
        }`}
        path={canonicalPath}
        type="product"
        structuredData={structuredData}
      />
      <AppHeader back />
      <main id={`product-page-${product.slug || product.id}`} className="max-w-2xl mx-auto px-4 pt-6 pb-28">
        <Breadcrumbs items={breadcrumbs} className="mb-4" />
        {/* Visual Box */}
        <div className="h-64 sm:h-84 bg-zinc-950 border-2 border-ya-gray flex items-center justify-center text-8xl sm:text-9xl relative overflow-hidden p-4 sm:p-6">
          {isImageEmoji ? (
            <span>{currentImage}</span>
          ) : (
            <img
              src={formatImageUrl(currentImage, 800)}
              alt={`${product.name} - Reparto a domicilio en Jerez YA Delivery`}
              loading="eager"
              decoding="async"
              className="w-full h-full object-contain object-center"
              referrerPolicy="no-referrer"
            />
          )}
          <span className="absolute top-3 left-3 bg-ya-black border border-ya-gray px-2 py-1 text-[10px] font-black text-ya-lime uppercase tracking-widest z-10">
            {category?.name ?? product.category}
          </span>
          {hasDiscount && (
            <span className="absolute top-11 left-3 bg-ya-lime text-ya-black px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border border-ya-lime z-10">
              -{discountPercent}% DTO
            </span>
          )}
          {!product.inStock ? (
            <span className="absolute top-3 right-3 bg-red-600 text-white px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border border-red-400 z-10">
              Agotado
            </span>
          ) : product.stockMode === 'in_stock' && (product.stockQuantity ?? 0) <= (product.minStock ?? 5) ? (
            <span className="absolute top-3 right-3 bg-amber-500 text-ya-black px-2.5 py-1 text-[10px] font-black uppercase tracking-widest font-mono z-10">
              Últimas {product.stockQuantity} u.
            </span>
          ) : (
            <span className="absolute top-3 right-3 bg-ya-lime text-ya-black px-2 py-1 text-[10px] font-black uppercase tracking-widest z-10">
              En stock
            </span>
          )}
        </div>

        {/* Miniaturas de galería si tiene más de 1 imagen */}
        {gallery.length > 1 && (
          <div className="flex gap-2.5 mt-3 overflow-x-auto pb-1">
            {gallery.map((img, idx) => {
              const isImg = isRealImageUrl(img);
              const isSelected = idx === activeImageIdx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveImageIdx(idx)}
                  className={`w-14 h-14 shrink-0 border-2 overflow-hidden bg-zinc-950 flex items-center justify-center p-1 transition-all ${
                    isSelected ? 'border-ya-lime scale-105 shadow-md' : 'border-ya-gray/70 opacity-60 hover:opacity-100'
                  }`}
                  aria-label={`Ver foto ${idx + 1}`}
                >
                  {isImg ? (
                    <img
                      src={formatImageUrl(img, 120)}
                      alt={`${product.name} detalle ${idx + 1}`}
                      loading="lazy"
                      className="w-full h-full object-contain object-center"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="text-xl">{img}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <p className="font-bold text-ya-lime uppercase tracking-widest text-xs mt-6">
          {!isEffectiveOutOfStock ? 'Disponible para entrega inmediata en Jerez' : 'Temporalmente fuera de inventario'}
        </p>
        <h1 className="font-black text-3xl sm:text-5xl tracking-tighter mt-2">{product.name}</h1>
        {hasDiscount ? (
          <div className="mt-4 flex items-baseline gap-3 flex-wrap">
            <span className="font-black text-3xl sm:text-5xl text-ya-lime">
              {euro(discountedPrice)}
            </span>
            <span className="font-bold text-xl sm:text-2xl text-gray-400 line-through">
              {euro(basePrice)}
            </span>
            <span className="font-black text-xs uppercase px-2.5 py-1 bg-ya-lime text-ya-black border border-ya-lime tracking-wider">
              -{discountPercent}% DTO
            </span>
          </div>
        ) : (
          <p className="font-black text-3xl mt-4 text-ya-lime">{euro(basePrice)}</p>
        )}
        <p className="text-gray-300 text-base sm:text-lg mt-4 leading-relaxed">
          {product.description}
        </p>

        {/* Selector de Opciones / Variantes */}
        {hasVariants && (
          <div className="mt-8 border-t-2 border-ya-gray pt-6">
            <div className="flex flex-wrap justify-between items-baseline gap-2 mb-3">
              <h2 className="font-black text-sm uppercase tracking-wider text-white">
                {product.variantsTitle || 'Opciones disponibles'}:
              </h2>
              {selectedVariant && (
                <span className="text-xs font-mono font-bold text-ya-lime break-words">
                  Seleccionado: {selectedVariant.name}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 gap-2.5">
              {variantsList.map((variant) => {
                const isSelected = variant.id === selectedVariantId;
                const isVarOut = !variant.active || variant.stock <= 0;
                const isVarLow = variant.active && variant.stock > 0 && variant.stock <= 5;
                const vBase = Number(variant.price);
                const vDisc = getProductDiscount(product.id, category?.id, vBase, activeDiscounts);
                const vHasDisc = vDisc.discountAmount > 0;

                return (
                  <button
                    key={variant.id}
                    id={`variant-btn-${variant.id}`}
                    type="button"
                    onClick={() => {
                      setSelectedVariantId(variant.id);
                      if (variant.image) {
                        const imgIdx = gallery.indexOf(variant.image);
                        if (imgIdx !== -1) setActiveImageIdx(imgIdx);
                      }
                    }}
                    className={`min-h-[64px] p-2.5 sm:p-3 border-2 text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                      isSelected
                        ? 'border-ya-lime bg-ya-lime/10 shadow-md ring-1 ring-ya-lime'
                        : isVarOut
                        ? 'border-zinc-800 bg-zinc-900/40 opacity-50 cursor-pointer hover:border-zinc-700'
                        : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 w-full min-w-0">
                      {variant.image && (
                        <div className="w-9 h-9 shrink-0 bg-ya-black border border-zinc-700 overflow-hidden flex items-center justify-center p-0.5">
                          <img
                            src={formatImageUrl(variant.image, 80)}
                            alt={variant.name}
                            className="w-full h-full object-contain object-center"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="font-black text-xs sm:text-sm text-white block break-words whitespace-normal leading-snug">
                          {variant.name}
                        </span>
                        {vHasDisc ? (
                          <div className="flex items-baseline gap-1.5 mt-1">
                            <span className="font-black text-xs text-ya-lime font-mono">
                              {euro(vDisc.discountedPrice)}
                            </span>
                            <span className="text-[10px] text-gray-400 line-through font-mono">
                              {euro(vBase)}
                            </span>
                          </div>
                        ) : (
                          <span className="font-black text-xs text-ya-lime font-mono mt-1 block">
                            {euro(variant.price)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2.5 pt-1 border-t border-zinc-800/80 flex items-center justify-between w-full gap-2">
                      <div className="min-w-0 flex-1">
                        {isVarOut ? (
                          <span className="text-[9px] font-black uppercase text-red-400 bg-red-950/80 px-1.5 py-0.5 border border-red-500/40 inline-block">
                            Agotado
                          </span>
                        ) : isVarLow ? (
                          <span className="text-[9px] font-bold text-amber-400 block truncate">
                            Quedan {variant.stock} u.
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-emerald-400 block truncate">
                            En stock
                          </span>
                        )}
                      </div>

                      {isSelected && (
                        <span className="text-ya-lime text-xs font-black shrink-0">✓</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Alerta de producto o variante agotado */}
        {isEffectiveOutOfStock && (
          <div className="mt-6 bg-red-950/60 border-2 border-red-500/60 p-4 text-red-200 text-xs sm:text-sm font-bold flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <span>
              {hasVariants
                ? `La opción seleccionada (${selectedVariant?.name || 'variante'}) se encuentra agotada temporalmente.`
                : 'Este producto se encuentra agotado en nuestro almacén de Jerez. No es posible tramitar pedidos de este artículo hasta su próxima reposición.'}
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
                max={hasVariants && selectedVariant ? selectedVariant.stock : product.stockMode === 'in_stock' ? product.stockQuantity : undefined}
                onAdd={() => increaseQuantity(lineKey)}
                onRemove={() => decreaseQuantity(lineKey)}
              />
            </div>
          )}

          {isEffectiveOutOfStock ? (
            <button
              id={`sold-out-btn-${product.id}`}
              disabled
              className="flex-1 min-h-12 bg-ya-gray border-2 border-red-500/40 text-red-400 font-black uppercase text-base tracking-wider cursor-not-allowed opacity-80 py-3 px-6"
            >
              {hasVariants ? 'Opción Agotada' : 'Producto Agotado'}
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

        {/* Productos relacionados de la misma categoría */}
        {relatedProducts.length > 0 && (
          <section className="mt-14 border-t-2 border-ya-gray pt-8">
            <div className="flex justify-between items-baseline mb-4">
              <div>
                <h2 className="font-black text-2xl uppercase tracking-tight text-white">
                  Más de {category?.name ?? product.category}
                </h2>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                  Otros productos disponibles en Jerez
                </p>
              </div>
              <Link
                to={`/app/categoria/${product.category}`}
                className="text-xs font-mono font-bold text-ya-lime hover:underline"
              >
                Ver categoría →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {relatedProducts.map((rp) => (
                <ProductCard key={rp.id} product={rp} />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
