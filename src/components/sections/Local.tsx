export function Local() {
  return (
    <section className="py-24 overflow-hidden bg-ya-black border-t-2 border-ya-gray">
      <div className="text-center mb-10 px-4">
        <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-ya-lime">Empezamos aquí.</h2>
        <p className="text-xl md:text-2xl font-bold text-gray-400 mt-4">Jerez de la Frontera es nuestra primera parada.</p>
      </div>
      
      <div className="w-full flex whitespace-nowrap overflow-hidden py-10">
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
