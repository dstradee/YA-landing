import { Menu, X } from 'lucide-react';
import { useState } from 'react';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed w-full z-50 bg-ya-black/90 backdrop-blur-md border-b-2 border-ya-gray">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex-shrink-0">
            <a href="#" className="text-4xl font-black text-ya-lime tracking-tighter">YA</a>
          </div>
          
          <div className="hidden md:flex items-center space-x-8">
            <a href="#como-funciona" className="text-ya-white hover:text-ya-lime transition-colors font-bold">Cómo funciona</a>
            <a href="#productos" className="text-ya-white hover:text-ya-lime transition-colors font-bold">Productos</a>
            <a href="#lanzamiento" className="bg-ya-lime text-ya-black px-6 py-2 font-black uppercase hover:bg-white transition-colors border-2 border-transparent hover:border-ya-lime">
              Avísame
            </a>
          </div>

          <div className="md:hidden flex items-center">
            <button onClick={() => setIsOpen(!isOpen)} className="text-ya-white hover:text-ya-lime">
              {isOpen ? <X size={32} /> : <Menu size={32} />}
            </button>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="md:hidden bg-ya-gray border-b-2 border-ya-lime absolute w-full">
          <div className="px-4 pt-2 pb-6 space-y-4 flex flex-col">
            <a href="#como-funciona" onClick={() => setIsOpen(false)} className="block text-xl font-bold text-ya-white hover:text-ya-lime pt-4">Cómo funciona</a>
            <a href="#productos" onClick={() => setIsOpen(false)} className="block text-xl font-bold text-ya-white hover:text-ya-lime">Productos</a>
            <a href="#lanzamiento" onClick={() => setIsOpen(false)} className="block bg-ya-lime text-ya-black px-6 py-4 font-black uppercase text-center mt-4">
              Avísame
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
