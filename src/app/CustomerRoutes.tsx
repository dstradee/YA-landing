import { Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { CartProvider } from './CartContext';
import { AppHome, CategoryPage, ProductPage, SearchPage } from './BrowsePages';
import { CartPage, CheckoutPage, OrderPage } from './CommercePages';
import { LoginPage, OrdersPage, ProfilePage, RegisterPage } from './AccountPages';
import { BottomNav } from './components';

function AppFrame({ children }: { children: ReactNode }) { return <CartProvider>{children}<BottomNav/></CartProvider>; }
export function CustomerRoutes() { return <Routes><Route path="/app" element={<AppFrame><AppHome/></AppFrame>}/><Route path="/app/categoria/:slug" element={<AppFrame><CategoryPage/></AppFrame>}/><Route path="/app/producto/:id" element={<AppFrame><ProductPage/></AppFrame>}/><Route path="/app/buscar" element={<AppFrame><SearchPage/></AppFrame>}/><Route path="/app/carrito" element={<AppFrame><CartPage/></AppFrame>}/><Route path="/app/checkout" element={<AppFrame><CheckoutPage/></AppFrame>}/><Route path="/app/pedido/:id" element={<AppFrame><OrderPage/></AppFrame>}/><Route path="/app/perfil" element={<AppFrame><ProfilePage/></AppFrame>}/><Route path="/app/pedidos" element={<AppFrame><OrdersPage/></AppFrame>}/><Route path="/login" element={<LoginPage/>}/><Route path="/registro" element={<RegisterPage/>}/></Routes>; }