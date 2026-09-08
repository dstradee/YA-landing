import { motion } from 'framer-motion';

export function Problem() {
  return (
    <section className="py-32 bg-ya-lime text-ya-black relative overflow-hidden">
      <div className="absolute top-10 left-10 text-9xl font-black opacity-10 rotate-12 select-none">03:47</div>
      <div className="absolute bottom-10 right-10 text-9xl font-black opacity-10 -rotate-12 select-none">02:58</div>
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-5xl md:text-7xl font-black uppercase tracking-tighter mb-8"
        >
          Son las 3 de la mañana.
        </motion.h2>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="text-2xl md:text-3xl font-bold mb-16 leading-tight"
        >
          Te has quedado sin bebida. Tus amigos quieren algo para picar. Estás jugando, viendo una película o simplemente no quieres salir.
        </motion.p>
        
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
        >
          <h3 className="text-4xl md:text-5xl font-black mb-4">¿Y ahora qué?</h3>
          <p className="text-8xl md:text-9xl font-black tracking-tighter text-ya-white drop-shadow-[0_4px_0_rgba(10,10,10,1)]">YA.</p>
        </motion.div>
      </div>
    </section>
  );
}
