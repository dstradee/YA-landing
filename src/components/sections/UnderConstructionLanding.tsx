import React, { useState } from 'react';
import {
  MapPin,
  Check,
  ArrowRight,
  Sparkles,
  Clock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SeoHead } from '../seo/SeoHead';
import {
  getOrganizationSchema,
  getLocalBusinessSchema,
  getWebSiteSchema,
} from '../../lib/seo';

export function UnderConstructionLanding() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setErrorMsg('');

    try {
      const { error } = await supabase.from('waitlist').insert([{ email: email.trim().toLowerCase() }]);

      if (error) {
        if (error.code === '23505') {
          setErrorMsg('¡Ya estás en la lista! Te avisaremos en cuanto abramos en Jerez.');
        } else {
          setErrorMsg('Hubo un error al guardar tu email. Inténtalo de nuevo.');
        }
      } else {
        setSubmitted(true);
        setEmail('');
      }
    } catch {
      setErrorMsg('Error de conexión. Inténtalo más tarde.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-ya-black text-ya-white selection:bg-ya-lime selection:text-ya-black overflow-x-hidden">
      <SeoHead
        title="YA Delivery Jerez — En Construcción | Próximamente"
        description="YA está naciendo en Jerez de la Frontera. Servicio de entrega rápida a domicilio de conveniencia, bebidas, snacks y hielo. Apertura en octubre."
        path="/"
        structuredData={[
          getOrganizationSchema(),
          getLocalBusinessSchema(),
          getWebSiteSchema(),
        ]}
      />

      {/* 1. BARRA SUPERIOR NEO-BRUTALISTA */}
      <header className="w-full border-b-2 border-ya-gray py-4 px-4 sm:px-6 lg:px-8 bg-ya-black/95 sticky top-0 z-50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl sm:text-4xl font-black text-ya-lime tracking-tighter leading-none select-none">
              YA
            </span>
            <span className="hidden sm:inline-block border-l-2 border-ya-gray pl-3 text-[11px] font-mono font-bold tracking-widest text-gray-400 uppercase">
              DELIVERY JEREZ
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 bg-yellow-500/10 border-2 border-yellow-500/50 text-yellow-400 text-[11px] sm:text-xs font-mono font-bold uppercase px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(234,179,8,0.3)]">
              <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse shrink-0" />
              <span>EN CONSTRUCCIÓN</span>
            </div>
            <span className="hidden md:inline-flex bg-ya-lime/10 border-2 border-ya-lime text-ya-lime text-[11px] font-mono font-black uppercase px-3 py-1.5">
              ABRIMOS EN OCTUBRE
            </span>
          </div>
        </div>
      </header>

      {/* 2. HERO / PRESENTACIÓN DE PRE-LANZAMIENTO */}
      <section className="relative pt-12 sm:pt-20 pb-16 px-4 sm:px-6 lg:px-8 border-b-2 border-ya-gray">
        <div className="max-w-6xl mx-auto">
          {/* Badge superior */}
          <div className="inline-flex items-center gap-2 bg-ya-gray/80 border-2 border-ya-gray px-3.5 py-1.5 text-xs font-mono font-bold uppercase tracking-wider text-ya-lime mb-6">
            <Sparkles size={14} className="text-ya-lime" />
            <span>PRE-LANZAMIENTO OFICIAL · JEREZ DE LA FRONTERA</span>
          </div>

          {/* Titular contundente */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8">
              <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black uppercase tracking-tighter leading-[0.9] text-white">
                YA ESTÁ <br />
                <span className="text-ya-lime underline decoration-4 decoration-ya-lime underline-offset-8">
                  NACIENDO.
                </span>
              </h1>

              <p className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-gray-300 mt-6 sm:mt-8">
                JEREZ, YA CASI.
              </p>

              <p className="text-base sm:text-lg text-gray-300 max-w-2xl mt-4 leading-relaxed font-medium">
                Estamos preparando el lanzamiento de un nuevo servicio de entrega rápida a domicilio en Jerez de la Frontera. Pensado para cubrir lo que necesitas cuando no quieres o no puedes salir de casa.
              </p>

              {/* Mensaje de apertura */}
              <div className="mt-6 inline-flex items-center gap-3 bg-ya-gray/40 border-2 border-ya-lime/40 px-4 py-2.5 text-xs sm:text-sm font-mono font-bold text-ya-lime">
                <Clock size={16} className="text-ya-lime shrink-0" />
                <span>ESTAMOS PREPARANDO EL LANZAMIENTO · ABRIMOS EN OCTUBRE</span>
              </div>
            </div>

            {/* Caja de Lista de Espera Hero */}
            <div className="lg:col-span-4 w-full">
              <div className="bg-ya-lime text-ya-black p-6 sm:p-8 border-4 border-ya-white shadow-[6px_6px_0px_0px_#FFFFFF]">
                <span className="inline-block bg-ya-black text-ya-lime text-[10px] font-mono font-black uppercase tracking-widest px-2.5 py-1 mb-3">
                  ACCESO PREFERENTE
                </span>
                <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight leading-tight mb-2">
                  ENTÉRATE CUANDO ABRAMOS.
                </h2>
                <p className="text-xs sm:text-sm font-bold text-black/80 mb-6 leading-snug">
                  Sé el primero en saber cuándo YA empieza a rodar por las calles de Jerez de la Frontera.
                </p>

                {submitted ? (
                  <div className="bg-ya-black text-ya-lime p-5 border-4 border-ya-black text-center">
                    <Check size={28} className="mx-auto mb-2 text-ya-lime" />
                    <p className="text-lg font-black uppercase leading-tight">
                      ¡Apuntado en la lista!
                    </p>
                    <p className="text-xs font-mono font-bold text-gray-300 mt-1">
                      Te enviaremos un aviso directo en cuanto abramos las puertas.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleWaitlistSubmit} className="space-y-3">
                    <div>
                      <label htmlFor="waitlist-email-hero" className="sr-only">
                        Correo electrónico
                      </label>
                      <input
                        id="waitlist-email-hero"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading}
                        placeholder="tu@email.com"
                        className="w-full bg-white text-ya-black px-4 py-3.5 text-sm sm:text-base font-bold border-3 border-ya-black focus:outline-none focus:ring-2 focus:ring-ya-black placeholder:text-gray-500 disabled:opacity-50"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-ya-black text-ya-lime px-5 py-3.5 text-sm font-black uppercase tracking-wider border-3 border-ya-black hover:bg-white hover:text-ya-black transition-colors flex items-center justify-center gap-2 disabled:opacity-80"
                    >
                      {loading ? (
                        'Guardando...'
                      ) : (
                        <>
                          <span>QUIERO ENTERARME</span>
                          <ArrowRight size={16} />
                        </>
                      )}
                    </button>

                    {errorMsg && (
                      <div className="bg-ya-black text-white p-2.5 text-xs font-bold border-2 border-ya-black">
                        {errorMsg}
                      </div>
                    )}
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. ¿QUÉ ES YA? */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 border-b-2 border-ya-gray bg-zinc-950">
        <div className="max-w-6xl mx-auto">
          <div className="border-b-2 border-ya-gray pb-4 mb-10 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <span className="text-xs font-mono font-bold text-ya-lime uppercase tracking-widest block mb-1">
                01 / EL CONCEPTO
              </span>
              <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter">
                ¿QUÉ ES YA?
              </h2>
            </div>
            <p className="text-xs font-mono text-gray-400 uppercase">
              ENTREGA RÁPIDA · CONVENIENCIA · JEREZ
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch">
            {/* Declaración de propuesta */}
            <div className="md:col-span-7 bg-ya-gray/50 border-2 border-ya-gray p-6 sm:p-10 flex flex-col justify-between">
              <div>
                <p className="text-xs font-mono text-ya-lime uppercase tracking-widest font-black mb-3">
                  LA PROPUESTA ES SENCILLA
                </p>
                <div className="space-y-2 mb-6">
                  <p className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white">
                    Necesitas algo.
                  </p>
                  <p className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white">
                    Lo pides.
                  </p>
                  <p className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-ya-lime">
                    YA te lo lleva.
                  </p>
                </div>
                <p className="text-sm sm:text-base text-gray-300 leading-relaxed font-medium">
                  YA es un servicio de entrega rápida a domicilio en Jerez de la Frontera. Está diseñado para esos momentos en los que necesitas un producto con urgencia o conveniencia y prefieres que alguien te lo acerque a tu puerta en minutos.
                </p>
              </div>

              <div className="mt-8 pt-6 border-t-2 border-ya-gray/60">
                <span className="text-xs font-mono text-gray-400 uppercase tracking-wider block mb-1">
                  FOCO INICIAL
                </span>
                <p className="text-sm font-bold text-white">
                  Productos de conveniencia, bebidas frías, hielo y necesidades de última hora.
                </p>
              </div>
            </div>

            {/* Lo que somos vs lo que no somos */}
            <div className="md:col-span-5 bg-ya-black border-2 border-ya-gray p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-mono font-black uppercase tracking-widest text-ya-lime mb-4">
                  CÓMO ENTENDER YA
                </h3>

                <div className="space-y-4">
                  <div className="p-4 bg-zinc-900 border-l-4 border-ya-lime">
                    <p className="font-black text-sm uppercase text-white">
                      ✓ SOLUCIÓN INMEDIATA DE CONVENIENCIA
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Para cuando estás en casa, trabajando o con amigos y te falta hielo, bebida o un snack.
                    </p>
                  </div>

                  <div className="p-4 bg-zinc-900 border-l-4 border-red-500/70">
                    <p className="font-black text-sm uppercase text-gray-300">
                      ✗ NO SOMOS UN RESTAURANTE
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      No cocinamos platos calientes ni somos una plataforma de comida elaborada.
                    </p>
                  </div>

                  <div className="p-4 bg-zinc-900 border-l-4 border-red-500/70">
                    <p className="font-black text-sm uppercase text-gray-300">
                      ✗ NO SOMOS UN SÚPER TRADICIONAL
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      No hacemos la compra del mes de 80 artículos; entregamos rápidamente lo que te urge YA.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-ya-gray text-xs font-mono text-gray-400">
                Sin rodeos, sin pedidos mínimos desorbitados.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. ¿DÓNDE FUNCIONARÁ? (ZONA CONFIRMADA) */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 border-b-2 border-ya-gray bg-ya-black">
        <div className="max-w-6xl mx-auto">
          <div className="border-b-2 border-ya-gray pb-4 mb-10 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <span className="text-xs font-mono font-bold text-ya-lime uppercase tracking-widest block mb-1">
                02 / COBERTURA LOCAL
              </span>
              <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter">
                ¿DÓNDE FUNCIONARÁ?
              </h2>
            </div>
            <p className="text-xs font-mono text-gray-400 uppercase">
              BASE DE OPERACIONES: JEREZ
            </p>
          </div>

          <div className="border-4 border-ya-gray bg-zinc-950 p-6 sm:p-12 relative">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              <div className="md:col-span-8">
                <div className="inline-flex items-center gap-2 bg-ya-lime text-ya-black px-3 py-1 font-black text-xs uppercase tracking-wider mb-4">
                  <MapPin size={16} />
                  <span>ZONA DE LANZAMIENTO CONFIRMADA</span>
                </div>

                <h3 className="text-4xl sm:text-6xl font-black uppercase tracking-tighter text-white">
                  📍 JEREZ DE LA FRONTERA
                </h3>

                <p className="text-base sm:text-lg text-gray-300 mt-4 leading-relaxed font-medium max-w-2xl">
                  La primera zona de lanzamiento será exclusivamente el núcleo urbano de <strong className="text-white">Jerez de la Frontera</strong>.
                </p>

                <p className="text-sm text-gray-400 mt-3 leading-relaxed max-w-2xl">
                  No prometemos abarcar toda la provincia ni zonas no confirmadas. Preferimos asegurar un servicio ágil, cercano y de calidad en nuestra propia ciudad antes de pensar en otras localidades.
                </p>

                <div className="mt-6 flex flex-wrap gap-2 text-xs font-mono">
                  <span className="bg-ya-gray/70 border border-ya-gray px-3 py-1.5 text-gray-300">
                    ● Núcleo urbano de Jerez
                  </span>
                  <span className="bg-ya-gray/70 border border-ya-gray px-3 py-1.5 text-gray-300">
                    ● Servicio de proximidad
                  </span>
                  <span className="bg-ya-gray/70 border border-ya-gray px-3 py-1.5 text-gray-300">
                    ● Reparto local directo
                  </span>
                </div>
              </div>

              <div className="md:col-span-4 border-2 border-ya-gray bg-ya-black p-6 text-center">
                <span className="text-4xl mb-3 block">🛵</span>
                <h4 className="text-lg font-black uppercase text-white">
                  EN TU PUERTA
                </h4>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Directo a tu domicilio, trabajo o reunión en Jerez de la Frontera.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. ¿QUÉ SE PODRÁ PEDIR? (CATEGORÍAS CONFIRMADAS) */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 border-b-2 border-ya-gray bg-zinc-950">
        <div className="max-w-6xl mx-auto">
          <div className="border-b-2 border-ya-gray pb-4 mb-10 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <span className="text-xs font-mono font-bold text-ya-lime uppercase tracking-widest block mb-1">
                03 / CATÁLOGO DE CONVENIENCIA
              </span>
              <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter">
                ¿QUÉ PODRÁS PEDIR?
              </h2>
            </div>
            <p className="text-xs font-mono text-gray-400 uppercase">
              LO QUE NECESITAS CUANDO NO QUIERES SALIR
            </p>
          </div>

          <p className="text-lg sm:text-xl font-bold text-gray-300 mb-8 max-w-3xl">
            Un catálogo curado para emergencias, antojos y conveniencia cotidiana en Jerez:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Categoría 1 */}
            <div className="border-2 border-ya-gray bg-ya-black p-5 flex flex-col justify-between hover:border-ya-lime transition-colors">
              <div>
                <span className="text-3xl block mb-2">⚡</span>
                <h3 className="text-lg font-black uppercase tracking-tight text-white">
                  Energéticas
                </h3>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Red Bull, Monster y tus marcas preferidas bien frías para recargar pilas.
                </p>
              </div>
              <span className="text-[10px] font-mono text-ya-lime uppercase mt-4 block">
                Disponibles frías
              </span>
            </div>

            {/* Categoría 2 */}
            <div className="border-2 border-ya-gray bg-ya-black p-5 flex flex-col justify-between hover:border-ya-lime transition-colors">
              <div>
                <span className="text-3xl block mb-2">🥤</span>
                <h3 className="text-lg font-black uppercase tracking-tight text-white">
                  Refrescos y Bebidas
                </h3>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Coca-Cola, Nestea, Aquarius, zumos y agua mineral sin moverte.
                </p>
              </div>
              <span className="text-[10px] font-mono text-ya-lime uppercase mt-4 block">
                Marcas principales
              </span>
            </div>

            {/* Categoría 3 */}
            <div className="border-2 border-ya-gray bg-ya-black p-5 flex flex-col justify-between hover:border-ya-lime transition-colors">
              <div>
                <span className="text-3xl block mb-2">🧊</span>
                <h3 className="text-lg font-black uppercase tracking-tight text-white">
                  Hielo en Minutos
                </h3>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Bolsas de hielo en cubitos para cuando se acaba a mitad de reunión o fiesta.
                </p>
              </div>
              <span className="text-[10px] font-mono text-ya-lime uppercase mt-4 block">
                Bolsas de 2 kg
              </span>
            </div>

            {/* Categoría 4 */}
            <div className="border-2 border-ya-gray bg-ya-black p-5 flex flex-col justify-between hover:border-ya-lime transition-colors">
              <div>
                <span className="text-3xl block mb-2">🍿</span>
                <h3 className="text-lg font-black uppercase tracking-tight text-white">
                  Snacks y Aperitivos
                </h3>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Patatas fritas, frutos secos, aceitunas y picoteo salado.
                </p>
              </div>
              <span className="text-[10px] font-mono text-ya-lime uppercase mt-4 block">
                Para picar YA
              </span>
            </div>

            {/* Categoría 5 */}
            <div className="border-2 border-ya-gray bg-ya-black p-5 flex flex-col justify-between hover:border-ya-lime transition-colors">
              <div>
                <span className="text-3xl block mb-2">🍫</span>
                <h3 className="text-lg font-black uppercase tracking-tight text-white">
                  Dulces y Chocolates
                </h3>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Chocolatinas, barritas y gominolas para cuando ataca el antojo nocturno.
                </p>
              </div>
              <span className="text-[10px] font-mono text-ya-lime uppercase mt-4 block">
                Antojos dulces
              </span>
            </div>

            {/* Categoría 6 */}
            <div className="border-2 border-ya-gray bg-ya-black p-5 flex flex-col justify-between hover:border-ya-lime transition-colors">
              <div>
                <span className="text-3xl block mb-2">📦</span>
                <h3 className="text-lg font-black uppercase tracking-tight text-white">
                  Packs YA
                </h3>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Combinaciones listas con bebida + hielo + snacks con ventajas de precio.
                </p>
              </div>
              <span className="text-[10px] font-mono text-ya-lime uppercase mt-4 block">
                Combos preparados
              </span>
            </div>

            {/* Categoría 7 */}
            <div className="border-2 border-ya-gray bg-ya-black p-5 flex flex-col justify-between hover:border-ya-lime transition-colors">
              <div>
                <span className="text-3xl block mb-2">🛒</span>
                <h3 className="text-lg font-black uppercase tracking-tight text-white">
                  Conveniencia
                </h3>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Esos artículos de última hora que te salvan el apuro cuando todo está cerrado.
                </p>
              </div>
              <span className="text-[10px] font-mono text-ya-lime uppercase mt-4 block">
                Básicos de urgencia
              </span>
            </div>

            {/* Bloque CTA Sugerencias */}
            <div className="border-2 border-ya-lime bg-ya-lime/10 p-5 flex flex-col justify-between">
              <div>
                <span className="text-3xl block mb-2">💡</span>
                <h3 className="text-lg font-black uppercase tracking-tight text-white">
                  ¿Falta algo?
                </h3>
                <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                  Durante el pre-lanzamiento iremos sumando los productos que los propios jerezanos nos vayan pidiendo.
                </p>
              </div>
              <span className="text-[10px] font-mono text-ya-lime font-black uppercase mt-4 block">
                Catálogo en expansión
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 6. ¿CÓMO FUNCIONARÁ? (3 PASOS ULTRA-SENCILLOS) */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 border-b-2 border-ya-gray bg-ya-black">
        <div className="max-w-6xl mx-auto">
          <div className="border-b-2 border-ya-gray pb-4 mb-10 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <span className="text-xs font-mono font-bold text-ya-lime uppercase tracking-widest block mb-1">
                04 / PROCESO
              </span>
              <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter">
                ¿CÓMO FUNCIONARÁ?
              </h2>
            </div>
            <p className="text-xs font-mono text-gray-400 uppercase">
              SIN COMPLICACIONES
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Paso 01 */}
            <div className="border-4 border-ya-gray bg-zinc-950 p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <span className="text-5xl sm:text-6xl font-black text-ya-lime font-mono tracking-tighter block mb-4">
                  01
                </span>
                <h3 className="text-2xl font-black uppercase tracking-tight text-white mb-2">
                  ELIGE
                </h3>
                <p className="text-sm text-gray-300 leading-relaxed font-medium">
                  Entra desde el navegador de tu móvil, selecciona tus bebidas, snacks o hielo y añádelos a tu cesta en pocos segundos.
                </p>
              </div>
              <div className="mt-8 pt-4 border-t border-ya-gray text-xs font-mono text-gray-400">
                Catálogo claro y transparente
              </div>
            </div>

            {/* Paso 02 */}
            <div className="border-4 border-ya-gray bg-zinc-950 p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <span className="text-5xl sm:text-6xl font-black text-ya-lime font-mono tracking-tighter block mb-4">
                  02
                </span>
                <h3 className="text-2xl font-black uppercase tracking-tight text-white mb-2">
                  PIDE
                </h3>
                <p className="text-sm text-gray-300 leading-relaxed font-medium">
                  Indica tu dirección en Jerez y confirma tu pedido online con pago seguro o en efectivo según tu preferencia.
                </p>
              </div>
              <div className="mt-8 pt-4 border-t border-ya-gray text-xs font-mono text-gray-400">
                Confirmación instantánea
              </div>
            </div>

            {/* Paso 03 */}
            <div className="border-4 border-ya-lime bg-ya-lime text-ya-black p-6 sm:p-8 flex flex-col justify-between shadow-[4px_4px_0px_0px_#FFFFFF]">
              <div>
                <span className="text-5xl sm:text-6xl font-black text-ya-black font-mono tracking-tighter block mb-4">
                  03
                </span>
                <h3 className="text-2xl font-black uppercase tracking-tight text-ya-black mb-2">
                  RECIBE
                </h3>
                <p className="text-sm text-black font-bold leading-relaxed">
                  Un repartidor local te lleva el pedido directo a tu ubicación en Jerez de la Frontera sin que tengas que moverte.
                </p>
              </div>
              <div className="mt-8 pt-4 border-t border-black/20 text-xs font-mono font-black text-black">
                Lo necesitas. Lo tienes.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. ¿CUÁNDO? / ESTADO DE LANZAMIENTO */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 border-b-2 border-ya-gray bg-zinc-950">
        <div className="max-w-6xl mx-auto">
          <div className="border-4 border-ya-lime bg-ya-black p-8 sm:p-12">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-8">
                <span className="inline-block bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 text-xs font-mono font-bold uppercase tracking-wider px-3 py-1 mb-4">
                  ESTADO DEL PROYECTO
                </span>
                <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter text-white">
                  ESTAMOS PREPARANDO EL LANZAMIENTO.
                </h2>
                <p className="text-xl sm:text-2xl font-black text-ya-lime uppercase mt-2">
                  YA ABRE EN OCTUBRE.
                </p>
                <p className="text-sm sm:text-base text-gray-300 mt-4 leading-relaxed max-w-2xl font-medium">
                  Actualmente nos encontramos ultimando la plataforma técnica, la logística de reparto en Jerez de la Frontera y los acuerdos de aprovisionamiento para que el servicio arranque con la máxima solvencia.
                </p>
              </div>

              <div className="lg:col-span-4 bg-zinc-900 border-2 border-ya-gray p-6 text-center">
                <p className="text-xs font-mono text-gray-400 uppercase tracking-wider mb-2">
                  FECHA OBJETIVO
                </p>
                <p className="text-4xl font-black text-white uppercase tracking-tight">
                  OCTUBRE
                </p>
                <p className="text-xs font-mono text-ya-lime uppercase mt-1 font-bold">
                  2026 · JEREZ DE LA FRA.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. QUIÉN ESTÁ DETRÁS / PROYECTO LOCAL */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-b-2 border-ya-gray bg-ya-black">
        <div className="max-w-4xl mx-auto text-center">
          <span className="text-xs font-mono font-bold text-ya-lime uppercase tracking-widest block mb-2">
            PROYECTO LOCAL
          </span>
          <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tighter text-white mb-4">
            PENSADO POR Y PARA JEREZ
          </h2>
          <p className="text-sm sm:text-base text-gray-300 leading-relaxed font-medium">
            YA nace como una iniciativa independiente y local para dar respuesta a una necesidad real en Jerez de la Frontera: contar con un servicio de conveniencia ágil, directo y sin intermediarios impersonales. Cuidamos cada detalle para ofrecer la mejor experiencia a nuestros vecinos.
          </p>
        </div>
      </section>

      {/* 9. LISTA DE ESPERA FINAL */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 border-b-2 border-ya-gray bg-zinc-950">
        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-block bg-ya-lime text-ya-black text-xs font-mono font-black uppercase tracking-widest px-3 py-1 mb-4">
            LISTA DE ESPERA EXCLUSIVA
          </span>
          <h2 className="text-4xl sm:text-6xl font-black uppercase tracking-tighter text-white mb-4 leading-none">
            QUIERO ENTERARME.
          </h2>
          <p className="text-base sm:text-lg text-gray-300 font-medium mb-8 max-w-xl mx-auto">
            Déjanos tu correo electrónico y te avisaremos en el instante exacto en que abramos el servicio en Jerez de la Frontera.
          </p>

          {submitted ? (
            <div className="bg-ya-lime text-ya-black p-6 border-4 border-ya-white shadow-[4px_4px_0px_0px_#FFFFFF] max-w-md mx-auto">
              <Check size={32} className="mx-auto mb-2 text-ya-black" />
              <p className="text-xl font-black uppercase">¡Ya estás en la lista!</p>
              <p className="text-xs font-bold text-black/80 mt-1">
                Recibirás la confirmación del lanzamiento en tu bandeja de entrada.
              </p>
            </div>
          ) : (
            <div className="max-w-md mx-auto">
              <form onSubmit={handleWaitlistSubmit} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  placeholder="tu@email.com"
                  className="flex-1 bg-white text-ya-black px-4 py-3.5 text-base font-bold border-3 border-ya-white focus:outline-none focus:ring-2 focus:ring-ya-lime placeholder:text-gray-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-ya-lime text-ya-black px-6 py-3.5 text-sm font-black uppercase tracking-wider border-3 border-ya-lime hover:bg-white hover:border-white transition-colors disabled:opacity-80"
                >
                  {loading ? 'Guardando...' : 'AVISARME'}
                </button>
              </form>

              {errorMsg && (
                <div className="mt-3 bg-red-500/20 text-red-300 p-2.5 text-xs font-bold border border-red-500/40">
                  {errorMsg}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 10. CIERRE DE MARCA Y FOOTER PRE-LANZAMIENTO */}
      <footer className="py-16 px-4 sm:px-6 lg:px-8 bg-ya-black">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8 text-center md:text-left">
          <div>
            <span className="text-6xl sm:text-7xl font-black text-ya-lime tracking-tighter leading-none block select-none">
              YA
            </span>
            <p className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white mt-1">
              Lo necesitas. Lo tienes.
            </p>
            <p className="text-xs text-gray-400 font-mono mt-1">
              Servicio de conveniencia y delivery a domicilio · Jerez de la Frontera (Cádiz)
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 text-xs font-mono text-gray-400">
            <span className="border border-ya-gray px-3 py-1.5 bg-zinc-900 text-gray-300">
              ● Estado: En preparación de lanzamiento
            </span>
            <span>© {new Date().getFullYear()} YA Delivery. Todos los derechos reservados.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
