import { motion } from 'framer-motion';

const categories = [
  { name: "Energéticas", icon: "⚡", soon: false },
  { name: "Bebidas", icon: "🥤", soon: false },
  { name: "Snacks", icon: "🍫", soon: false },
  { name: "Hielo", icon: "🧊", soon: false },
  { name: "Chucherías", icon: "🍬", soon: true },
  { name: "Más cosas", icon: "🛒", soon: true },
];

export function Categories() {
  return (
    <section id="productos" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto bg-ya-gray/30 border-y-2 border-ya-gray">
      <h2 className="text-5xl md:text-7xl font-black mb-16 tracking-tighter text-center">¿Qué quieres?</h2>
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-8">
        {categories.map((cat, idx) => (
          <motion.div
            key={idx}
            whileHover={{ y: -5, borderColor: '#B6FF00' }}
            className="relative bg-ya-black border-2 border-ya-gray p-6 md:p-10 flex flex-col items-center text-center transition-colors cursor-pointer group"
          >
            {cat.soon && (
              <span className="absolute top-3 right-3 bg-ya-gray text-[10px] sm:text-xs font-bold px-2 py-1 uppercase tracking-wider group-hover:bg-ya-lime group-hover:text-ya-black transition-colors">
                Próximamente
              </span>
            )}
            <span className="text-5xl md:text-7xl mb-4 grayscale group-hover:grayscale-0 transition-all">{cat.icon}</span>
            <h3 className="text-xl md:text-3xl font-black uppercase tracking-tight">{cat.name}</h3>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
