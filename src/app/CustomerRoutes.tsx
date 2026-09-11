import { Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { CatalogProvider } from './CatalogContext';
import { CartProvider } from './CartContext';
import { AppHome, CategoryPage, ProductPage, SearchPage } from './BrowsePages';
import { CartPage, CheckoutPage, OrderPage } from './CommercePages';
import { PayPalReturnPage } from './PayPalReturnPage';
import { LoginPage, OrdersPage, ProfilePage, RegisterPage } from './AccountPages';
import NotificationsPage from './NotificationsPage';
import YaPlusPage from './YaPlusPage';
import YaJuntosPage from './YaJuntosPage';
import { BottomNav } from './components';

function AppFrame({ children }: { children: ReactNode }) {
  return (
    <CatalogProvider>
      <CartProvider>
        <div className="min-h-screen bg-ya-black text-white font-sans selection:bg-ya-lime selection:text-ya-black">
          {children}
          <BottomNav />
        </div>
      </CartProvider>
    </CatalogProvider>
  );
}

export function CustomerRoutes() {
  return (
    <Routes>
      <Route
        path="/app"
        element={
          <AppFrame>
            <AppHome />
          </AppFrame>
        }
      />
      <Route
        path="/app/categoria/:slug"
        element={
          <AppFrame>
            <CategoryPage />
          </AppFrame>
        }
      />
      <Route
        path="/app/producto/:id"
        element={
          <AppFrame>
            <ProductPage />
          </AppFrame>
        }
      />
      <Route
        path="/app/buscar"
        element={
          <AppFrame>
            <SearchPage />
          </AppFrame>
        }
      />
      <Route
        path="/app/carrito"
        element={
          <AppFrame>
            <CartPage />
          </AppFrame>
        }
      />
      <Route
        path="/app/checkout"
        element={
          <AppFrame>
            <CheckoutPage />
          </AppFrame>
        }
      />
      <Route
        path="/app/checkout/paypal-return"
        element={
          <AppFrame>
            <PayPalReturnPage />
          </AppFrame>
        }
      />
      <Route
        path="/app/checkout/paypal-cancel"
        element={
          <AppFrame>
            <PayPalReturnPage />
          </AppFrame>
        }
      />
      <Route
        path="/app/pedido/:id"
        element={
          <AppFrame>
            <OrderPage />
          </AppFrame>
        }
      />
      <Route
        path="/app/perfil"
        element={
          <AppFrame>
            <ProfilePage />
          </AppFrame>
        }
      />
      <Route
        path="/app/pedidos"
        element={
          <AppFrame>
            <OrdersPage />
          </AppFrame>
        }
      />
      <Route
        path="/app/notificaciones"
        element={
          <AppFrame>
            <NotificationsPage />
          </AppFrame>
        }
      />
      <Route
        path="/app/ya-plus"
        element={
          <AppFrame>
            <YaPlusPage />
          </AppFrame>
        }
      />
      <Route
        path="/app/juntos"
        element={
          <AppFrame>
            <YaJuntosPage />
          </AppFrame>
        }
      />
      <Route
        path="/app/juntos/:code"
        element={
          <AppFrame>
            <YaJuntosPage />
          </AppFrame>
        }
      />
      <Route
        path="/login"
        element={
          <div className="min-h-screen bg-ya-black text-white font-sans">
            <LoginPage />
          </div>
        }
      />
      <Route
        path="/registro"
        element={
          <div className="min-h-screen bg-ya-black text-white font-sans">
            <RegisterPage />
          </div>
        }
      />
    </Routes>
  );
}
