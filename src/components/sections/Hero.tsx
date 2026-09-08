import { motion } from 'framer-motion';
import { Zap, CupSoda, Cookie, Snowflake } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto min-h-screen flex items-center">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <motion.div initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} className="z-10">
          <div className="inline-block bg-ya-gray border-2 border-ya-lime text-ya-lime px-4 py-1 mb-6 font-bold tracking-widest uppercase text-sm">Muy pronto en Jerez</div>
          <h1 className="text-7xl lg:text-8xl font-black mb-6 leading-none tracking-tighter">Lo necesitas.<br/><span className="text-ya-lime">Lo tienes.</span></h1>
          <p className="text-xl lg:text-2xl text-gray-300 mb-10 max-w-lg font-medium leading-snug">Delivery bajo demanda en Jerez de la Frontera. Pide lo que necesitas y nosotros nos encargamos de llevártelo.</p>
          <div className="flex flex-col sm:flex-row gap-4"><a href="#lanzamiento" className="bg-ya-lime text-ya-black border-2 border-ya-lime px-8 py-5 text-xl font-black uppercase text-center hover:bg-ya-black hover:text-ya-lime transition-all">Quiero saber cuándo</a><a href="#como-funciona" className="bg-transparent border-2 border-ya-gray px-8 py-5 text-xl font-black uppercase text-center hover:border-ya-white transition-all">Ver cómo funciona</a></div>
        </motion.div>
        <motion.div initial={{ opacity: 0, rotate: 5, y: 50 }} animate={{ opacity: 1, rotate: -3, y: 0 }} transition={{ duration: 0.8, delay: 0.2 }} className="relative mx-auto w-full max-w-md">
          <div className="absolute inset-0 bg-ya-lime translate-x-4 translate-y-4"></div>
          <div className="relative bg-ya-black border-4 border-ya-gray p-8 sm:p-10 z-10 flex flex-col">
            <div className="absolute -top-5 -right-5 bg-ya-lime text-ya-black font-black py-2 px-6 text-2xl border-2 border-ya-black">03:17</div>
            <h3 className="text-3xl font-black text-ya-white mb-8 uppercase tracking-tight">¿Qué necesitas?</h3>
            <ul className="space-y-5 mb-10 text-xl font-bold"><li className="flex items-center gap-4 bg-ya-gray/50 p-3 border border-ya-gray"><Zap className="text-ya-lime" size={28} /> Red Bull</li><li className="flex items-center gap-4 bg-ya-gray/50 p-3 border border-ya-gray"><CupSoda className="text-ya-lime" size={28} /> Coca-Cola</li><li className="flex items-center gap-4 bg-ya-gray/50 p-3 border border-ya-gray"><Cookie className="text-ya-lime" size={28} /> Snacks</li><li className="flex items-center gap-4 bg-ya-gray/50 p-3 border border-ya-gray"><Snowflake className="text-ya-lime" size={28} /> Hielo</li></ul>
            <a href="/app" className="w-full bg-ya-white text-ya-black border-2 border-ya-white font-black text-2xl py-4 hover:bg-ya-lime hover:border-ya-lime transition-colors uppercase text-center">[ PEDIR YA ]</a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}