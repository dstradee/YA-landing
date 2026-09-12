// ==============================================================================
// YA DELIVERY - COMPONENTE DE BREADCRUMBS VISUALES
// Archivo: src/components/seo/Breadcrumbs.tsx
// ==============================================================================

import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  name: string;
  url: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  if (!items || items.length === 0) return null;

  return (
    <nav
      aria-label="Migas de pan"
      className={`flex items-center text-xs font-mono uppercase tracking-wider text-gray-400 overflow-x-auto py-2 ${className}`}
    >
      <ol className="flex items-center space-x-1.5 list-none m-0 p-0 shrink-0">
        <li className="flex items-center">
          <Link
            to="/"
            className="flex items-center gap-1 hover:text-ya-lime transition-colors"
            title="Ir a inicio YA Delivery"
          >
            <Home size={12} />
            <span>Inicio</span>
          </Link>
        </li>

        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={item.url + idx} className="flex items-center">
              <ChevronRight size={12} className="text-gray-600 mx-1 shrink-0" />
              {isLast ? (
                <span className="text-ya-lime font-bold truncate max-w-[200px] sm:max-w-[300px]">
                  {item.name}
                </span>
              ) : (
                <Link
                  to={item.url}
                  className="hover:text-white transition-colors truncate max-w-[150px] sm:max-w-[220px]"
                >
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
