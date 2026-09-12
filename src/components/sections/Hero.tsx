import { motion } from 'framer-motion';
import { Zap, CupSoda, Cookie, Snowflake, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Hero() {
  return (
    <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto min-h-screen flex items-center">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <motion.div initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} className="z-10">
          <Link
            to="/delivery-jerez"
            className="inline-flex items-center gap-2 bg-ya-gray border-2 border-ya-lime text-ya-lime px-4 py-1.5 mb-6 font-bold tracking-widest uppercase text-xs hover:bg-ya-lime hover:text-ya-black transition-colors"
          >
            <span>Delivery en Jerez de la Frontera</span>
            <ArrowRight size={12} />
          </Link>
          <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black mb-6 leading-none tracking-tighter uppercase">
            Lo necesitas.<br/><span className="text-ya-lime">Lo tienes.</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-300 mb-8 max-w-lg font-medium leading-snug">
            Servicio de delivery bajo demanda en <strong>Jerez de la Frontera</strong>. Bebidas frías, energéticas, aperitivos y hielo directos a tu puerta en minutos.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              to="/app"
              className="bg-ya-lime text-ya-black border-2 border-ya-lime px-8 py-5 text-xl font-black uppercase text-center hover:bg-white transition-all shadow-[4px_4px_0px_0px_#B6FF00]"
            >
              Pedir Ahora
            </Link>
            <Link
              to="/delivery-jerez"
              className="bg-transparent border-2 border-ya-gray px-8 py-5 text-xl font-black uppercase text-center hover:border-ya-white transition-all text-white"
            >
              Servicio Jerez
            </Link>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, rotate: 5, y: 50 }} animate={{ opacity: 1, rotate: -3, y: 0 }} transition={{ duration: 0.8, delay: 0.2 }} className="relative mx-auto w-full max-w-md">
          <div className="absolute inset-0 bg-ya-lime translate-x-4 translate-y-4"></div>
          <div className="relative bg-ya-black border-4 border-ya-gray p-8 sm:p-10 z-10 flex flex-col">
            <div className="absolute -top-5 -right-5 bg-ya-lime text-ya-black font-black py-2 px-6 text-2xl border-2 border-ya-black">03:17</div>
            <h2 className="text-3xl font-black text-ya-white mb-8 uppercase tracking-tight">¿Qué necesitas?</h2>
            <ul className="space-y-4 mb-8 text-lg font-bold">
              <li>
                <Link to="/app/producto/red-bull" className="flex items-center justify-between bg-ya-gray/50 p-3 border border-ya-gray hover:border-ya-lime transition-colors">
                  <span className="flex items-center gap-3"><Zap className="text-ya-lime" size={24} /> Red Bull 250ml</span>
                  <span className="text-xs font-mono text-ya-lime font-bold">2,45 €</span>
                </Link>
              </li>
              <li>
                <Link to="/app/producto/coca-cola" className="flex items-center justify-between bg-ya-gray/50 p-3 border border-ya-gray hover:border-ya-lime transition-colors">
                  <span className="flex items-center gap-3"><CupSoda className="text-ya-lime" size={24} /> Coca-Cola 2L</span>
                  <span className="text-xs font-mono text-ya-lime font-bold">3,20 €</span>
                </Link>
              </li>
              <li>
                <Link to="/app/categoria/snacks" className="flex items-center justify-between bg-ya-gray/50 p-3 border border-ya-gray hover:border-ya-lime transition-colors">
                  <span className="flex items-center gap-3"><Cookie className="text-ya-lime" size={24} /> Snacks & Patatas</span>
                  <span className="text-xs font-mono text-gray-400 font-bold">Ver carta</span>
                </Link>
              </li>
              <li>
                <Link to="/app/categoria/hielo" className="flex items-center justify-between bg-ya-gray/50 p-3 border border-ya-gray hover:border-ya-lime transition-colors">
                  <span className="flex items-center gap-3"><Snowflake className="text-ya-lime" size={24} /> Bolsa de Hielo 2kg</span>
                  <span className="text-xs font-mono text-ya-lime font-bold">3,50 €</span>
                </Link>
              </li>
            </ul>
            <Link to="/app" className="w-full bg-ya-white text-ya-black border-2 border-ya-white font-black text-2xl py-4 hover:bg-ya-lime hover:border-ya-lime transition-colors uppercase text-center block">[ PEDIR YA ]</Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}