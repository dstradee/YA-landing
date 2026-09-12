import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export function Local() {
  return (
    <section className="py-24 overflow-hidden bg-ya-black border-t-2 border-ya-gray">
      <div className="text-center mb-8 px-4">
        <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-ya-lime">Empezamos aquí.</h2>
        <p className="text-xl md:text-2xl font-bold text-gray-400 mt-4 max-w-xl mx-auto">
          Jerez de la Frontera es nuestra ciudad de lanzamiento y operaciones locales.
        </p>
        <div className="mt-6">
          <Link
            to="/delivery-jerez"
            className="inline-flex items-center gap-2 border-2 border-ya-lime bg-ya-gray px-6 py-3 font-mono font-bold text-xs uppercase tracking-wider text-ya-lime hover:bg-ya-lime hover:text-ya-black transition-colors"
          >
            <span>Conoce toda la información de reparto en Jerez</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
      
      <div className="w-full flex whitespace-nowrap overflow-hidden py-8">
        <div className="animate-[marquee_20s_linear_infinite] flex gap-8 items-center">
          <span className="text-8xl md:text-[12rem] font-black tracking-tighter text-ya-gray select-none">JEREZ DE LA FRONTERA</span>
          <span className="text-6xl text-ya-lime">✦</span>
          <span className="text-8xl md:text-[12rem] font-black tracking-tighter text-ya-gray select-none">JEREZ DE LA FRONTERA</span>
          <span className="text-6xl text-ya-lime">✦</span>
        </div>
      </div>
    </section>
  );
}
