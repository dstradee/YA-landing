import { Route, Routes, useSearchParams } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { Hero } from './components/sections/Hero';
import { Problem } from './components/sections/Problem';
import { HowItWorks } from './components/sections/HowItWorks';
import { Categories } from './components/sections/Categories';
import { Waitlist } from './components/sections/Waitlist';
import { Local } from './components/sections/Local';
import { UnderConstructionLanding } from './components/sections/UnderConstructionLanding';
import { CustomerRoutes } from './app/CustomerRoutes';
import { AdminRoutes } from './app/AdminPages';
import { CourierRoutes } from './app/courier/CourierRoutes';
import { AuthProvider } from './lib/auth';
import { NotificationsProvider } from './app/NotificationsContext';
import {
  NotificationDrawer,
  NotificationToast,
  NotificationPreferencesModal,
} from './components/notifications/NotificationComponents';
import { SeoHead } from './components/seo/SeoHead';
import { DeliveryJerezPage } from './app/DeliveryJerezPage';
import {
  getOrganizationSchema,
  getLocalBusinessSchema,
  getWebSiteSchema,
} from './lib/seo';

/**
 * Estado de construcción de la landing pública.
 * Por defecto está bloqueada al público en estado "En Construcción", mostrando la mini
 * presentación oficial de pre-lanzamiento de YA Delivery en Jerez de la Frontera,
 * y preservando intacto todo el código y secciones de la landing comercial para su posterior reactivación.
 * Se puede previsualizar en cualquier momento con ?preview=landing o configurando VITE_LANDING_UNDER_CONSTRUCTION=false.
 */
export const IS_LANDING_UNDER_CONSTRUCTION =
  import.meta.env.VITE_LANDING_UNDER_CONSTRUCTION !== 'false';

function Landing() {
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === 'landing';

  // Si la landing está en construcción y no se solicita preview explícito
  if (IS_LANDING_UNDER_CONSTRUCTION && !isPreview) {
    return <UnderConstructionLanding />;
  }

  // Si no está en construcción o se pasa ?preview=landing, se muestra la landing comercial completa
  return (
    <div className="min-h-screen flex flex-col font-sans">
      <SeoHead
        title="YA Delivery Jerez — Lo necesitas. Lo tienes."
        description="Servicio de delivery bajo demanda en Jerez de la Frontera. Bebidas frías, energéticas, snacks y hielo directo a tu puerta en minutos."
        path="/"
        structuredData={[
          getOrganizationSchema(),
          getLocalBusinessSchema(),
          getWebSiteSchema(),
        ]}
      />
      <Navbar />
      <main className="flex-grow">
        <Hero />
        <Problem />
        <HowItWorks />
        <Categories />
        <Waitlist />
        <Local />
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <NotificationsProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/delivery-jerez" element={<DeliveryJerezPage />} />
          <Route path="/admin/*" element={<AdminRoutes />} />
          <Route path="/repartidor/*" element={<CourierRoutes />} />
        </Routes>
        <CustomerRoutes />
        <NotificationDrawer />
        <NotificationToast />
        <NotificationPreferencesModal />
      </NotificationsProvider>
    </AuthProvider>
  );
}
export default App;
