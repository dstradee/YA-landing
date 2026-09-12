import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed w-full z-50 bg-ya-black/90 backdrop-blur-md border-b-2 border-ya-gray">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex-shrink-0">
            <Link to="/" className="text-4xl font-black text-ya-lime tracking-tighter" title="YA Delivery Jerez">
              YA
            </Link>
          </div>
          
          <div className="hidden md:flex items-center space-x-8">
            <Link to="/delivery-jerez" className="text-ya-white hover:text-ya-lime transition-colors font-bold text-sm uppercase tracking-wider">
              Delivery Jerez
            </Link>
            <a href="/#como-funciona" className="text-ya-white hover:text-ya-lime transition-colors font-bold text-sm uppercase tracking-wider">
              Cómo funciona
            </a>
            <Link to="/app" className="text-ya-white hover:text-ya-lime transition-colors font-bold text-sm uppercase tracking-wider">
              Catálogo
            </Link>
            <Link to="/app" className="bg-ya-lime text-ya-black px-6 py-2 font-black uppercase text-sm tracking-wider hover:bg-white transition-colors border-2 border-transparent hover:border-ya-lime shadow-[2px_2px_0px_0px_#B6FF00]">
              Pedir YA
            </Link>
          </div>

          <div className="md:hidden flex items-center">
            <button onClick={() => setIsOpen(!isOpen)} aria-label="Abrir menú" className="text-ya-white hover:text-ya-lime">
              {isOpen ? <X size={32} /> : <Menu size={32} />}
            </button>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="md:hidden bg-ya-gray border-b-2 border-ya-lime absolute w-full">
          <div className="px-4 pt-2 pb-6 space-y-4 flex flex-col">
            <Link to="/delivery-jerez" onClick={() => setIsOpen(false)} className="block text-lg font-bold text-ya-white hover:text-ya-lime pt-2 uppercase">
              Delivery Jerez
            </Link>
            <a href="/#como-funciona" onClick={() => setIsOpen(false)} className="block text-lg font-bold text-ya-white hover:text-ya-lime uppercase">
              Cómo funciona
            </a>
            <Link to="/app" onClick={() => setIsOpen(false)} className="block text-lg font-bold text-ya-white hover:text-ya-lime uppercase">
              Catálogo Online
            </Link>
            <Link to="/app" onClick={() => setIsOpen(false)} className="block bg-ya-lime text-ya-black px-6 py-3 font-black uppercase text-center mt-2">
              Pedir YA
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
