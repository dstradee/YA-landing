import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react';

interface Props {
  children: ReactNode;
  moduleName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AdminErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[YA-AdminErrorBoundary] Error capturado:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="border-4 border-red-500 bg-ya-black p-8 sm:p-12 text-center space-y-6 max-w-2xl mx-auto my-8 shadow-[6px_6px_0px_0px_#EF4444]">
          <div className="w-16 h-16 bg-red-950/60 border-2 border-red-500 flex items-center justify-center mx-auto text-red-400">
            <AlertTriangle size={32} />
          </div>

          <div className="space-y-2">
            <span className="bg-red-500/20 text-red-400 border border-red-500/40 px-3 py-0.5 text-xs font-mono font-bold uppercase tracking-wider">
              Control de Fallos Admin
            </span>
            <h2 className="text-xl sm:text-2xl font-black uppercase text-white tracking-tight">
              {this.props.moduleName
                ? `Error al cargar módulo de ${this.props.moduleName}`
                : 'Error al renderizar el módulo'}
            </h2>
            <p className="text-xs font-mono text-gray-300 max-w-lg mx-auto leading-relaxed">
              {this.state.error?.message ||
                'Se produjo un error no controlado al inicializar los datos de esta sección.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-6 py-2.5 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-xs border-2 border-ya-lime hover:bg-white hover:border-white transition-all flex items-center gap-2"
            >
              <RefreshCw size={14} />
              <span>Reintentar</span>
            </button>

            <a
              href="/admin"
              className="px-6 py-2.5 border-2 border-ya-gray text-gray-300 font-black uppercase tracking-wider text-xs hover:border-white hover:text-white transition-all flex items-center gap-2"
            >
              <LayoutDashboard size={14} />
              <span>Volver al Dashboard</span>
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
