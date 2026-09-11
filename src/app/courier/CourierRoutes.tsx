import { Routes, Route, Navigate } from 'react-router-dom';
import { CourierLayout } from './CourierLayout';
import { CourierDashboardPage } from './CourierDashboardPage';
import { CourierOrdersPage } from './CourierOrdersPage';
import { CourierOrderDetailPage } from './CourierOrderDetailPage';
import { CourierDeliveredPage } from './CourierDeliveredPage';
import { CourierIncentivesPage } from './CourierIncentivesPage';
import { CourierProfilePage } from './CourierProfilePage';

export function CourierRoutes() {
  return (
    <CourierLayout>
      <Routes>
        <Route index element={<CourierDashboardPage />} />
        <Route path="pedidos" element={<CourierOrdersPage />} />
        <Route path="pedidos/:id" element={<CourierOrderDetailPage />} />
        <Route path="entregados" element={<CourierDeliveredPage />} />
        <Route path="incentivos" element={<CourierIncentivesPage />} />
        <Route path="perfil" element={<CourierProfilePage />} />
        <Route path="*" element={<Navigate to="/repartidor" replace />} />
      </Routes>
    </CourierLayout>
  );
}
