"use client";

import { useLayoutEffect } from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AppProvider } from "@/src/contexts/AppContext";
import { theme } from "@/src/app/theme";
import PublicLayout from "@/src/layouts/PublicLayout";
import AdminLayout from "@/src/layouts/AdminLayout";
import { InformationPage } from "@/src/modules/public-portal/PublicPages";
import { FutureModulePage, PaymentOrderAccessPage, PaymentOrderPage, PublicHome, PublicLookup, PublicResultPage } from "@/src/modules/public-portal/RealPublicPages";
import { RecoverPasswordPage } from "@/src/modules/auth/AuthPages";
import { LoginPage } from "@/src/modules/auth/pages/LoginPage";
import { AuthProvider } from "@/src/modules/auth/context/AuthProvider";
import {
  NoPermissionPage,
  PermissionRoute,
  ProtectedRoute,
} from "@/src/modules/auth/RouteGuards";
import DashboardPage from "@/src/modules/dashboard/DashboardPage";
import {
  InfractionDetailPage,
  InfractionsListPage,
  NewInfractionPage,
  PendingInfractionsPage,
} from "@/src/modules/infractions/RealInfractionPages";
import {
  CashControlPage,
  NewPaymentPage,
  PaymentDetailPage,
  ReceptionPage,
  ReconciliationPage,
} from "@/src/modules/payments/PaymentPages";
import SolvenciesPage, {
  SolvencyDetailPage,
} from "@/src/modules/solvencies/SolvenciesPage";
import {
  PublicSolvencyRequestInfoPage,
  PublicSolvencyVerifyPage,
} from "@/src/modules/solvencies/PublicSolvencyPages";
import { ProfilePage } from "@/src/modules/management/ManagementPages";
import SettingsPage from "@/src/modules/management/RealSettingsPage";
import ReportsPage from "@/src/modules/reports/ReportsPage";
import NotificationsPage from "@/src/modules/notifications/NotificationsPage";
import HistoricalMigrationsPage from "@/src/modules/historical-migrations/HistoricalMigrationsPage";
import {
  AgentsPage,
  CatalogsPage,
  DevicesPage,
  RolesPage,
  UsersPage,
} from "@/src/modules/administration/pages/AdministrationPages";
import {
  WorkQueuePage,
} from "@/src/modules/operations/OperationalPages";
import { AppealDetailPage, AppealsPage } from "@/src/modules/appeals/pages/AppealPages";
import { CitizensVehiclesPage } from "@/src/modules/citizens/pages/CitizensVehiclesPage";
import type { RoleName } from "@/src/types";

const guards = {
  all: ["ADMIN", "SUPERVISOR", "PMT", "RECEPTORIA", "SOLVENCIAS"] as RoleName[],
  adminSupervisor: ["ADMIN", "SUPERVISOR"] as RoleName[],
  infractions: ["ADMIN", "SUPERVISOR", "PMT"] as RoleName[],
  validation: ["ADMIN", "PMT"] as RoleName[],
  payments: ["ADMIN", "SUPERVISOR", "RECEPTORIA"] as RoleName[],
  solvencies: ["ADMIN", "SUPERVISOR", "SOLVENCIAS"] as RoleName[],
  admin: ["ADMIN"] as RoleName[],
};

function ScrollToTop() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}

function Allowed({
  roles,
  permission,
  children,
}: {
  roles: RoleName[];
  permission?: string;
  children: React.ReactNode;
}) {
  return <PermissionRoute roles={roles} permission={permission}>{children}</PermissionRoute>;
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <AppProvider>
        <HashRouter>
          <ScrollToTop />
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<PublicHome />} />
              <Route path="/consulta" element={<PublicLookup />} />
              <Route
                path="/consulta/resultado"
                element={<PublicResultPage />}
              />
              <Route path="/pagos" element={<FutureModulePage title="Pagos y recibos" />} />
              <Route path="/orden-pago" element={<PaymentOrderAccessPage />} />
              <Route
                path="/orden-pago/:reference"
                element={<PaymentOrderPage />}
              />
              <Route
                path="/solvencia/solicitar"
                element={<PublicSolvencyRequestInfoPage />}
              />
              <Route
                path="/solvencia/seguimiento"
                element={<PublicSolvencyVerifyPage />}
              />
              <Route
                path="/solvencia/seguimiento/:codigo"
                element={<PublicSolvencyVerifyPage />}
              />
              <Route
                path="/solvencia/:codigo"
                element={<PublicSolvencyVerifyPage />}
              />
              <Route
                path="/verificar-solvencia"
                element={<PublicSolvencyVerifyPage />}
              />
              <Route
                path="/requisitos"
                element={<InformationPage type="requirements" />}
              />
              <Route path="/ayuda" element={<InformationPage type="help" />} />
              <Route
                path="/preguntas-frecuentes"
                element={<InformationPage type="faq" />}
              />
            </Route>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/recuperar-contrasena"
              element={<RecoverPasswordPage />}
            />
            <Route path="/sin-permiso" element={<NoPermissionPage />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route
                path="dashboard"
                element={
                  <Allowed roles={guards.adminSupervisor} permission="dashboard.read">
                    <DashboardPage />
                  </Allowed>
                }
              />
              <Route
                path="bandeja"
                element={
                  <Allowed roles={guards.all} permission="work_queue.read">
                    <WorkQueuePage />
                  </Allowed>
                }
              />
              <Route
                path="infracciones"
                element={
                  <Allowed roles={guards.infractions} permission="infractions.read">
                    <InfractionsListPage />
                  </Allowed>
                }
              />
              <Route
                path="infracciones/pendientes"
                element={
                  <Allowed roles={guards.validation} permission="infractions.validate">
                    <PendingInfractionsPage />
                  </Allowed>
                }
              />
              <Route
                path="infracciones/nueva"
                element={
                  <Allowed roles={guards.infractions} permission="infractions.create">
                    <NewInfractionPage />
                  </Allowed>
                }
              />
              <Route
                path="infracciones/:id"
                element={
                  <Allowed roles={guards.infractions} permission="infractions.read">
                    <InfractionDetailPage />
                  </Allowed>
                }
              />
              <Route
                path="ciudadanos"
                element={
                  <Allowed roles={guards.infractions} permission="citizens.read_restricted">
                    <CitizensVehiclesPage />
                  </Allowed>
                }
              />
              <Route
                path="receptoria"
                element={
                  <Allowed roles={guards.payments}>
                    <ReceptionPage />
                  </Allowed>
                }
              />
              <Route
                path="receptoria/caja"
                element={
                  <Allowed roles={guards.payments}>
                    <CashControlPage />
                  </Allowed>
                }
              />
              <Route
                path="receptoria/pagos/nuevo"
                element={
                  <Allowed roles={guards.payments}>
                    <NewPaymentPage />
                  </Allowed>
                }
              />
              <Route
                path="receptoria/pagos/:id"
                element={
                  <Allowed roles={guards.payments}>
                    <PaymentDetailPage />
                  </Allowed>
                }
              />
              <Route
                path="receptoria/conciliacion"
                element={
                  <Allowed roles={guards.payments}>
                    <ReconciliationPage />
                  </Allowed>
                }
              />
              <Route
                path="solvencias"
                element={
                  <Allowed roles={guards.solvencies}>
                    <SolvenciesPage />
                  </Allowed>
                }
              />
              <Route
                path="solvencias/:id"
                element={
                  <Allowed roles={guards.solvencies}>
                    <SolvencyDetailPage />
                  </Allowed>
                }
              />
              <Route
                path="impugnaciones"
                element={
                  <Allowed roles={guards.infractions} permission="appeals.read">
                    <AppealsPage />
                  </Allowed>
                }
              />
              <Route
                path="impugnaciones/:id"
                element={
                  <Allowed roles={guards.infractions} permission="appeals.read">
                    <AppealDetailPage />
                  </Allowed>
                }
              />
              <Route
                path="reportes"
                element={
                  <Allowed roles={guards.adminSupervisor}>
                    <ReportsPage />
                  </Allowed>
                }
              />
              <Route
                path="usuarios"
                element={
                  <Allowed roles={guards.admin} permission="users.read">
                    <UsersPage />
                  </Allowed>
                }
              />
              <Route
                path="roles"
                element={
                  <Allowed roles={guards.admin} permission="roles.read">
                    <RolesPage />
                  </Allowed>
                }
              />
              <Route
                path="catalogos"
                element={
                  <Allowed roles={guards.admin} permission="catalogs.read">
                    <CatalogsPage />
                  </Allowed>
                }
              />
              <Route
                path="dispositivos"
                element={
                  <Allowed roles={guards.infractions} permission="devices.read">
                    <DevicesPage />
                  </Allowed>
                }
              />
              <Route
                path="agentes"
                element={
                  <Allowed roles={guards.adminSupervisor} permission="users.read">
                    <AgentsPage />
                  </Allowed>
                }
              />
              <Route
                path="auditoria"
                element={
                  <Allowed roles={guards.admin}>
                    <ReportsPage initialType="audit" />
                  </Allowed>
                }
              />
              <Route
                path="configuracion"
                element={
                  <Allowed roles={guards.admin}>
                    <SettingsPage />
                  </Allowed>
                }
              />
              <Route path="migraciones-historicas" element={<Allowed roles={guards.admin} permission="historical_migrations.read"><HistoricalMigrationsPage /></Allowed>} />
              <Route path="perfil" element={<ProfilePage />} />
              <Route path="notificaciones" element={<Allowed roles={guards.all} permission="notifications.read"><NotificationsPage /></Allowed>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
        </AppProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
