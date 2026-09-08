import { Search } from 'lucide-react';

export function SearchBar({
  value,
  onChange,
  placeholder = 'Red Bull, snacks, hielo...',
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex border-2 border-ya-gray focus-within:border-ya-lime bg-ya-gray">
      <label htmlFor="search-input" className="sr-only">
        Buscar productos
      </label>
      <div className="p-3 text-ya-lime flex items-center justify-center">
        <Search size={22} />
      </div>
      <input
        id="search-input"
        type="search"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-ya-gray text-white w-full p-3 font-bold outline-none placeholder:text-gray-500 text-base"
      />
    </div>
  );
}
