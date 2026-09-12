import { Route, Routes } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { Hero } from './components/sections/Hero';
import { Problem } from './components/sections/Problem';
import { HowItWorks } from './components/sections/HowItWorks';
import { Categories } from './components/sections/Categories';
import { Waitlist } from './components/sections/Waitlist';
import { Local } from './components/sections/Local';
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

function Landing() {
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
