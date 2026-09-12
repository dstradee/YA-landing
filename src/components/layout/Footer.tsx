import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="bg-ya-black border-t-2 border-ya-gray pt-16 pb-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-10">
        <div className="md:col-span-2">
          <Link to="/" className="inline-block text-6xl font-black text-ya-lime tracking-tighter mb-4">
            YA
          </Link>
          <p className="text-xl sm:text-2xl font-black text-ya-white mb-3 uppercase tracking-tight">
            Lo necesitas. Lo tienes.
          </p>
          <p className="text-xs sm:text-sm text-gray-400 max-w-md leading-relaxed">
            Servicio de delivery bajo demanda y reparto urgente a domicilio en Jerez de la Frontera (Cádiz). Bebidas frías, energéticas, aperitivos y hielo directo a tu ubicación.
          </p>
          <div className="mt-4 inline-block bg-ya-gray/50 border border-ya-lime/30 px-3 py-1 text-xs font-mono text-ya-lime">
            ● Servicio activo en Jerez de la Frontera
          </div>
        </div>

        <div>
          <h3 className="text-xs font-mono font-black uppercase tracking-widest text-ya-lime mb-4">
            Categorías
          </h3>
          <ul className="flex flex-col space-y-2.5 text-xs font-mono uppercase tracking-wider text-gray-300">
            <li>
              <Link to="/app/categoria/energeticas" className="hover:text-ya-lime transition-colors">
                Bebidas Energéticas
              </Link>
            </li>
            <li>
              <Link to="/app/categoria/bebidas" className="hover:text-ya-lime transition-colors">
                Refrescos y Bebidas
              </Link>
            </li>
            <li>
              <Link to="/app/categoria/snacks" className="hover:text-ya-lime transition-colors">
                Snacks y Aperitivos
              </Link>
            </li>
            <li>
              <Link to="/app/categoria/hielo" className="hover:text-ya-lime transition-colors">
                Bolsas de Hielo
              </Link>
            </li>
            <li>
              <Link to="/app/categoria/dulces" className="hover:text-ya-lime transition-colors">
                Dulces y Chocolatinas
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-mono font-black uppercase tracking-widest text-ya-lime mb-4">
            Enlaces Útiles
          </h3>
          <ul className="flex flex-col space-y-2.5 text-xs font-mono uppercase tracking-wider text-gray-300">
            <li>
              <Link to="/" className="hover:text-ya-lime transition-colors">
                Inicio
              </Link>
            </li>
            <li>
              <Link to="/delivery-jerez" className="hover:text-ya-lime transition-colors font-bold text-ya-lime">
                Delivery en Jerez
              </Link>
            </li>
            <li>
              <Link to="/app" className="hover:text-ya-lime transition-colors">
                Catálogo Online
              </Link>
            </li>
            <li>
              <Link to="/app/buscar" className="hover:text-ya-lime transition-colors">
                Buscador de Productos
              </Link>
            </li>
            <li>
              <span className="text-gray-500 cursor-not-allowed">
                Términos y Privacidad
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-12 pt-6 border-t border-ya-gray flex flex-col sm:flex-row justify-between items-center text-xs font-mono text-gray-500 gap-2">
        <p>© 2026 YA Delivery — Jerez de la Frontera, Cádiz, Andalucía, España</p>
        <p className="text-gray-400">Entrega rápida bajo demanda</p>
      </div>
    </footer>
  );
}
