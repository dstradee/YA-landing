export function Footer() {
  return (
    <footer className="bg-ya-black border-t-2 border-ya-gray pt-16 pb-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12">
        <div>
          <h2 className="text-6xl font-black text-ya-lime tracking-tighter mb-4">YA</h2>
          <p className="text-2xl font-bold text-ya-white mb-8">Lo necesitas. Lo tienes.</p>
        </div>
        <div className="grid grid-cols-2 gap-8 font-bold">
          <div className="flex flex-col space-y-4">
            <a href="#" className="hover:text-ya-lime transition-colors">Inicio</a>
            <a href="#como-funciona" className="hover:text-ya-lime transition-colors">Cómo funciona</a>
            <a href="#lanzamiento" className="hover:text-ya-lime transition-colors">Próximamente</a>
          </div>
          <div className="flex flex-col space-y-4">
            <a href="#" className="hover:text-ya-lime transition-colors">Contacto</a>
            <a href="#" className="hover:text-ya-lime transition-colors text-gray-500">Privacidad</a>
            <a href="#" className="hover:text-ya-lime transition-colors text-gray-500">Términos</a>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-ya-gray flex flex-col md:flex-row justify-between items-center text-sm font-bold text-gray-500">
        <p>© 2026 YA</p>
        <p>Jerez de la Frontera</p>
      </div>
    </footer>
  );
}
