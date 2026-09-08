import { motion } from 'framer-motion';

const steps = [
  { num: "01", title: "Elige", desc: "Encuentra lo que necesitas." },
  { num: "02", title: "Pide", desc: "Añádelo al carrito y realiza tu pedido." },
  { num: "03", title: "Recibe", desc: "Nosotros nos encargamos del resto." }
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="py-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <h2 className="text-5xl md:text-7xl font-black mb-20 tracking-tighter">Así de fácil.</h2>
      
      <div className="grid md:grid-cols-3 gap-12">
        {steps.map((step, idx) => (
          <motion.div 
            key={idx}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.2 }}
            className="border-t-4 border-ya-lime pt-8"
          >
            <div className="text-8xl font-black text-ya-gray mb-6 leading-none select-none">{step.num}</div>
            <h3 className="text-4xl font-black uppercase mb-4 text-ya-lime">{step.title}</h3>
            <p className="text-2xl font-bold text-gray-400">{step.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
