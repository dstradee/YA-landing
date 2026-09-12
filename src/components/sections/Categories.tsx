import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

const categories = [
  { name: "Energéticas", icon: "⚡", slug: "energeticas", desc: "Red Bull, Monster" },
  { name: "Bebidas", icon: "🥤", slug: "bebidas", desc: "Coca-Cola, Fanta, Aquarius" },
  { name: "Snacks", icon: "🥔", slug: "snacks", desc: "Patatas, Doritos, Pringles" },
  { name: "Hielo", icon: "🧊", slug: "hielo", desc: "Bolsas de hielo macizo" },
  { name: "Dulces", icon: "🍫", slug: "dulces", desc: "KitKat, Oreo, Gominolas" },
  { name: "Comida y Más", icon: "🍕", slug: "comida", desc: "Pizza, ramen, pilas" },
];

export function Categories() {
  return (
    <section id="productos" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto bg-ya-gray/30 border-y-2 border-ya-gray">
      <div className="text-center mb-16">
        <span className="text-xs font-mono font-black text-ya-lime uppercase tracking-widest">
          CATÁLOGO EN JEREZ
        </span>
        <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase mt-2">
          ¿Qué necesitas pedir?
        </h2>
        <p className="text-sm md:text-base text-gray-400 max-w-xl mx-auto mt-2 font-medium">
          Selecciona una categoría para explorar productos disponibles con entrega inmediata a domicilio.
        </p>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-8">
        {categories.map((cat) => (
          <Link
            key={cat.slug}
            to={`/app/categoria/${cat.slug}`}
            className="block group"
            title={`Comprar ${cat.name} a domicilio en Jerez`}
          >
            <motion.div
              whileHover={{ y: -5, borderColor: '#B6FF00' }}
              className="relative bg-ya-black border-2 border-ya-gray p-6 md:p-8 flex flex-col items-center text-center transition-colors group-hover:border-ya-lime h-full"
            >
              <span className="text-5xl md:text-6xl mb-4 grayscale group-hover:grayscale-0 transition-all">{cat.icon}</span>
              <h3 className="text-lg md:text-2xl font-black uppercase tracking-tight group-hover:text-ya-lime transition-colors">
                {cat.name}
              </h3>
              <p className="text-xs text-gray-400 mt-1 font-mono">
                {cat.desc}
              </p>
            </motion.div>
          </Link>
        ))}
      </div>
    </section>
  );
}
