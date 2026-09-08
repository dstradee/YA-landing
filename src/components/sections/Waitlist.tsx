import { useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';

export function Waitlist() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setErrorMsg('');

    try {
      const { error } = await supabase
        .from('waitlist')
        .insert([{ email }]);

      if (error) {
        // Código de error 23505 en PostgreSQL significa violación de unicidad (Unique constraint)
        if (error.code === '23505') {
          setErrorMsg('¡Ya estás en la lista! Te avisaremos pronto.');
        } else {
          setErrorMsg('Hubo un error al guardarlo. Inténtalo de nuevo.');
        }
      } else {
        setSubmitted(true);
        setEmail('');
      }
    } catch (err) {
      setErrorMsg('Error de conexión. Inténtalo más tarde.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="lanzamiento" className="py-32 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="bg-ya-lime text-ya-black p-8 md:p-16 border-4 border-ya-gray relative"
      >
        <h2 className="text-4xl md:text-6xl font-black mb-6 uppercase tracking-tighter leading-none">
          Jerez, estamos preparando algo.
        </h2>
        <p className="text-xl md:text-2xl font-bold mb-10 max-w-2xl mx-auto">
          YA está naciendo en Jerez de la Frontera. Queremos que puedas pedir lo que necesitas sin tener que salir de casa.
        </p>

        {submitted ? (
          <div className="bg-ya-black text-ya-lime p-6 text-2xl font-black border-4 border-ya-black uppercase">
            ¡Apuntado! Te avisaremos cuando YA esté listo.
          </div>
        ) : (
          <div className="max-w-xl mx-auto">
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 mb-4">
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                placeholder="tu@email.com" 
                className="flex-1 bg-ya-white text-ya-black px-6 py-4 text-xl font-bold border-4 border-ya-black focus:outline-none focus:border-white disabled:opacity-50"
              />
              <button 
                type="submit" 
                disabled={loading}
                className="bg-ya-black text-ya-lime px-8 py-4 text-xl font-black uppercase border-4 border-ya-black hover:bg-white hover:text-ya-black transition-colors disabled:opacity-80 disabled:hover:bg-ya-black disabled:hover:text-ya-lime disabled:cursor-wait"
              >
                {loading ? 'Enviando...' : 'Avisarme'}
              </button>
            </form>
            
            {/* Mensajes de error o duplicado integrados con el diseño brutalista */}
            {errorMsg && (
              <div className="bg-ya-black text-ya-white p-3 font-bold border-2 border-ya-black uppercase text-sm">
                {errorMsg}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </section>
  );
}
