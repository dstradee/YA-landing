// ==============================================================================
// YA DELIVERY - PÁGINA SEO LOCAL JEREZ DE LA FRONTERA
// Archivo: src/app/DeliveryJerezPage.tsx
// ==============================================================================

import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight, Zap, CupSoda, Cookie, Snowflake, ShieldCheck, Clock, MapPin, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { SeoHead } from '../components/seo/SeoHead';
import { Breadcrumbs } from '../components/seo/Breadcrumbs';
import { getLocalBusinessSchema, getBreadcrumbSchema, getFaqSchema } from '../lib/seo';
import { products } from '../data/products';

const JEREZ_FAQS = [
  {
    question: '¿Qué es YA Delivery?',
    answer: 'YA es un servicio de delivery y entrega a domicilio rápido enfocado en productos de conveniencia, bebidas frías, bebidas energéticas, aperitivos, dulces y hielo en Jerez de la Frontera.',
  },
  {
    question: '¿Dónde reparte YA en Jerez de la Frontera?',
    answer: 'El servicio opera en la zona urbana de Jerez de la Frontera (Cádiz), facilitando pedidos directos a viviendas, oficinas y puntos de encuentro dentro del área de servicio activa.',
  },
  {
    question: '¿Qué productos puedo pedir a domicilio en Jerez?',
    answer: 'Puedes pedir bebidas energéticas (Red Bull, Monster), refrescos (Coca-Cola, Fanta, Aquarius), snacks y patatas, chocolatinas y chuches, hielo y productos básicos de salvación inmediata.',
  },
  {
    question: '¿Cómo se realiza un pedido?',
    answer: 'Es muy sencillo: navegas por la aplicación web, seleccionas los productos que necesitas, añades tu dirección en Jerez y confirmas el pago mediante tarjeta bancaria segura o Bizum/Stripe.',
  },
  {
    question: '¿Hay pedido mínimo o costes ocultos?',
    answer: 'No hay comisiones ocultas. Los precios y el coste de entrega se detallan de forma 100% transparente en el carrito antes de completar cualquier pago.',
  },
];

export function DeliveryJerezPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const breadcrumbs = [
    { name: 'Delivery en Jerez de la Frontera', url: '/delivery-jerez' },
  ];

  const featuredProducts = products.slice(0, 6);

  const structuredData = [
    getLocalBusinessSchema(),
    getBreadcrumbSchema(breadcrumbs),
    getFaqSchema(JEREZ_FAQS),
  ];

  return (
    <div className="min-h-screen flex flex-col bg-ya-black text-white font-sans selection:bg-ya-lime selection:text-ya-black">
      <SeoHead
        title="Delivery en Jerez de la Frontera | YA Delivery a Domicilio"
        description="Servicio de delivery bajo demanda en Jerez de la Frontera. Pide bebidas frías, energéticas, snacks y hielo directos a tu puerta en minutos."
        path="/delivery-jerez"
        structuredData={structuredData}
      />

      <Navbar />

      <main className="flex-grow pt-28 pb-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto w-full">
        {/* Breadcrumbs */}
        <Breadcrumbs items={breadcrumbs} className="mb-6" />

        {/* Hero Section Local */}
        <section className="border-b-4 border-ya-gray pb-12">
          <div className="inline-flex items-center gap-2 bg-ya-gray/60 border border-ya-lime/40 text-ya-lime px-3.5 py-1 text-xs font-mono font-bold uppercase tracking-wider mb-4">
            <Sparkles size={14} /> Servicio Local · Jerez de la Frontera (Cádiz)
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tighter uppercase leading-none">
            Delivery a Domicilio en <span className="text-ya-lime">Jerez</span>
          </h1>

          <p className="mt-4 text-lg sm:text-xl text-gray-300 max-w-3xl leading-relaxed">
            ¿Te has quedado sin hielo, sin bebidas o te apetece un snack? <strong>YA Delivery</strong> es el servicio de entrega inmediata en <strong>Jerez de la Frontera</strong>. Sin rodeos ni esperas eternas: lo que necesitas, cuando lo necesitas.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              to="/app"
              className="bg-ya-lime text-ya-black px-8 py-4 font-black uppercase text-base tracking-wider hover:bg-white transition-colors border-2 border-ya-lime shadow-[4px_4px_0px_0px_#B6FF00]"
            >
              Pedir Ahora en Jerez →
            </Link>
            <Link
              to="/app/buscar"
              className="border-2 border-ya-gray hover:border-white px-8 py-4 font-black uppercase text-base tracking-wider text-white transition-colors"
            >
              Explorar Catálogo
            </Link>
          </div>
        </section>

        {/* ¿Qué puedes pedir? */}
        <section className="mt-14">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8">
            <div>
              <span className="text-xs font-mono font-black text-ya-lime uppercase tracking-widest">
                CATÁLOGO DE ENTREGA RÁPIDA
              </span>
              <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight mt-1">
                ¿Qué llevamos a tu puerta?
              </h2>
            </div>
            <Link
              to="/app"
              className="mt-2 sm:mt-0 text-xs font-mono font-bold text-gray-400 hover:text-ya-lime uppercase flex items-center gap-1"
            >
              Ver todas las categorías <ArrowRight size={13} />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              to="/app/categoria/energeticas"
              className="p-6 border-2 border-ya-gray hover:border-ya-lime bg-zinc-950 transition group"
            >
              <div className="w-12 h-12 bg-ya-gray grid place-items-center mb-4 group-hover:bg-ya-lime transition-colors">
                <Zap size={24} className="text-ya-lime group-hover:text-ya-black transition-colors" />
              </div>
              <h3 className="font-black text-xl uppercase tracking-tight">Bebidas Energéticas</h3>
              <p className="mt-2 text-xs text-gray-400 leading-relaxed">
                Red Bull, Monster Energy y complementos para mantener la concentración y la energía.
              </p>
              <span className="mt-4 inline-block font-mono text-xs font-bold text-ya-lime">
                Ver energéticas →
              </span>
            </Link>

            <Link
              to="/app/categoria/bebidas"
              className="p-6 border-2 border-ya-gray hover:border-ya-lime bg-zinc-950 transition group"
            >
              <div className="w-12 h-12 bg-ya-gray grid place-items-center mb-4 group-hover:bg-ya-lime transition-colors">
                <CupSoda size={24} className="text-ya-lime group-hover:text-ya-black transition-colors" />
              </div>
              <h3 className="font-black text-xl uppercase tracking-tight">Refrescos y Bebidas</h3>
              <p className="mt-2 text-xs text-gray-400 leading-relaxed">
                Coca-Cola, Fanta, Aquarius y agua mineral fría directa a tu mesa o reunión.
              </p>
              <span className="mt-4 inline-block font-mono text-xs font-bold text-ya-lime">
                Ver bebidas →
              </span>
            </Link>

            <Link
              to="/app/categoria/hielo"
              className="p-6 border-2 border-ya-gray hover:border-ya-lime bg-zinc-950 transition group"
            >
              <div className="w-12 h-12 bg-ya-gray grid place-items-center mb-4 group-hover:bg-ya-lime transition-colors">
                <Snowflake size={24} className="text-ya-lime group-hover:text-ya-black transition-colors" />
              </div>
              <h3 className="font-black text-xl uppercase tracking-tight">Hielo en Minutos</h3>
              <p className="mt-2 text-xs text-gray-400 leading-relaxed">
                Bolsas de hielo macizo para que no se te caliente la noche ni te quedes sin copas frías.
              </p>
              <span className="mt-4 inline-block font-mono text-xs font-bold text-ya-lime">
                Pedir hielo →
              </span>
            </Link>

            <Link
              to="/app/categoria/snacks"
              className="p-6 border-2 border-ya-gray hover:border-ya-lime bg-zinc-950 transition group"
            >
              <div className="w-12 h-12 bg-ya-gray grid place-items-center mb-4 group-hover:bg-ya-lime transition-colors">
                <Cookie size={24} className="text-ya-lime group-hover:text-ya-black transition-colors" />
              </div>
              <h3 className="font-black text-xl uppercase tracking-tight">Snacks y Pica-Pica</h3>
              <p className="mt-2 text-xs text-gray-400 leading-relaxed">
                Patatas Lays, Doritos, Pringles y dulces KitKat u Oreo listos para devorar.
              </p>
              <span className="mt-4 inline-block font-mono text-xs font-bold text-ya-lime">
                Ver aperitivos →
              </span>
            </Link>
          </div>
        </section>

        {/* Productos Top en Jerez */}
        <section className="mt-16">
          <div className="flex justify-between items-baseline mb-6">
            <div>
              <span className="text-xs font-mono font-black text-ya-lime uppercase tracking-widest">
                LO MÁS PEDIDO EN JEREZ
              </span>
              <h2 className="text-3xl font-black uppercase tracking-tight mt-1">
                Favoritos de la ciudad
              </h2>
            </div>
            <Link
              to="/app"
              className="text-ya-lime font-mono text-xs font-black uppercase hover:underline"
            >
              Ver carta completa →
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {featuredProducts.map((p) => (
              <Link
                key={p.id}
                to={`/app/producto/${p.slug || p.id}`}
                className="border-2 border-ya-gray hover:border-ya-lime bg-ya-gray/30 p-3 flex flex-col justify-between transition group"
              >
                <div className="h-24 bg-ya-gray grid place-items-center text-4xl mb-3">
                  <span>{p.image}</span>
                </div>
                <div>
                  <h4 className="font-black text-xs uppercase group-hover:text-ya-lime transition-colors line-clamp-2">
                    {p.name}
                  </h4>
                  <p className="text-ya-lime font-black text-sm mt-1 font-mono">
                    {p.price.toFixed(2)} €
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Cómo funciona el delivery en Jerez */}
        <section className="mt-16 border-t-2 border-ya-gray pt-12">
          <span className="text-xs font-mono font-black text-ya-lime uppercase tracking-widest">
            PROCESO SIMPLE Y TRANSPARENTE
          </span>
          <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight mt-1 mb-8">
            ¿Cómo pedir a domicilio en Jerez?
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 border-2 border-ya-gray bg-zinc-950">
              <span className="font-mono text-3xl font-black text-ya-lime">01</span>
              <h3 className="text-lg font-black uppercase mt-3">Elige tus productos</h3>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                Entra a nuestra tienda web sin necesidad de descargas pesadas. Añade bebidas, snacks o hielo a tu carrito en dos clics.
              </p>
            </div>

            <div className="p-6 border-2 border-ya-gray bg-zinc-950">
              <span className="font-mono text-3xl font-black text-ya-lime">02</span>
              <h3 className="text-lg font-black uppercase mt-3">Indica tu dirección</h3>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                Introduce tu calle, portal y piso en Jerez de la Frontera. Un repartidor local se asigna de forma inmediata.
              </p>
            </div>

            <div className="p-6 border-2 border-ya-gray bg-zinc-950">
              <span className="font-mono text-3xl font-black text-ya-lime">03</span>
              <h3 className="text-lg font-black uppercase mt-3">Recíbelo en tu puerta</h3>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                Pago protegido y entrega ágil en mano. Puedes seguir el estado de tu pedido en tiempo real desde la web.
              </p>
            </div>
          </div>
        </section>

        {/* Ventajas de YA en Jerez */}
        <section className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-4 border-y-2 border-ya-gray py-8">
          <div className="flex items-center gap-4 p-4 bg-ya-gray/30">
            <MapPin size={32} className="text-ya-lime shrink-0" />
            <div>
              <h4 className="font-black text-sm uppercase">Reparto Local</h4>
              <p className="text-[11px] text-gray-400">Centrados 100% en Jerez de la Frontera.</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-ya-gray/30">
            <Clock size={32} className="text-ya-lime shrink-0" />
            <div>
              <h4 className="font-black text-sm uppercase">Rapidez Máxima</h4>
              <p className="text-[11px] text-gray-400">Bebidas frías cuando más las necesitas.</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-ya-gray/30">
            <ShieldCheck size={32} className="text-ya-lime shrink-0" />
            <div>
              <h4 className="font-black text-sm uppercase">Pago Seguro</h4>
              <p className="text-[11px] text-gray-400">Pasarela protegida y sin costes ocultos.</p>
            </div>
          </div>
        </section>

        {/* Sección FAQ */}
        <section className="mt-16">
          <span className="text-xs font-mono font-black text-ya-lime uppercase tracking-widest">
            RESOLVEMOS TUS DUDAS
          </span>
          <h2 className="text-3xl font-black uppercase tracking-tight mt-1 mb-6">
            Preguntas Frecuentes sobre el Delivery en Jerez
          </h2>

          <div className="space-y-3">
            {JEREZ_FAQS.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={index}
                  className="border-2 border-ya-gray bg-zinc-950 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full text-left p-4 sm:p-5 flex items-center justify-between gap-4 font-black text-base sm:text-lg uppercase hover:text-ya-lime transition-colors"
                  >
                    <span>{faq.question}</span>
                    <ChevronDown
                      size={20}
                      className={`text-ya-lime shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-5 sm:px-5 text-xs sm:text-sm text-gray-300 border-t border-ya-gray pt-3 leading-relaxed">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Banner Final de Conversión */}
        <section className="mt-16 bg-ya-lime text-ya-black p-8 sm:p-12 border-4 border-ya-lime text-center shadow-[6px_6px_0px_0px_#FFFFFF]">
          <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter leading-none">
            ¿Listo para hacer tu pedido en Jerez?
          </h2>
          <p className="mt-3 text-base sm:text-lg font-bold text-black/80 max-w-xl mx-auto">
            Accede al catálogo interactivo y recibe tus bebidas, hielo o aperitivos sin moverte de casa.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <Link
              to="/app"
              className="bg-ya-black text-ya-lime px-8 py-4 font-black uppercase text-base tracking-wider hover:bg-white hover:text-ya-black transition-colors"
            >
              Abrir Tienda YA →
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
export default DeliveryJerezPage;
