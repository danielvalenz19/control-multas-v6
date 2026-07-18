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
import {
  InformationPage,
  PublicHome,
  PublicLookup,
  SolvencyDocumentPage,
} from "@/src/modules/public-portal/PublicPages";
import { CitizenPaymentsPage } from "@/src/modules/public-portal/CitizenPaymentPages";
import {
  CitizenPaymentOrderPage,
  CitizenPublicResultPage,
  CitizenSolvencyRequestFlow,
  CitizenSolvencyTrackingPage,
  CitizenSolvencyVerifyPage,
  PaymentOrderAccessPage,
} from "@/src/modules/public-portal/CitizenServiceFlows";
import { LoginPage, RecoverPasswordPage } from "@/src/modules/auth/AuthPages";
import {
  NoPermissionPage,
  PermissionRoute,
  ProtectedRoute,
} from "@/src/modules/auth/RouteGuards";
import DashboardPage from "@/src/modules/dashboard/DashboardPage";
import {
  InfractionDetailPage,
  InfractionsListPage,
  PendingInfractionsPage,
} from "@/src/modules/infractions/InfractionPages";
import {
  NewPaymentPage,
  PaymentDetailPage,
  ReceptionPage,
  ReconciliationPage,
} from "@/src/modules/payments/PaymentPages";
import SolvenciesPage, {
  SolvencyDetailPage,
} from "@/src/modules/solvencies/SolvenciesPage";
import {
  AuditPage,
  CatalogsPage,
  ProfilePage,
  RolesPage,
  SettingsPage,
  UsersPage,
} from "@/src/modules/management/ManagementPages";
import {
  DevicesSyncPage,
  ReportsCompletePage,
} from "@/src/modules/management/EnhancedManagementPages";
import {
  AppealsPage,
  CashControlPage,
  CitizensVehiclesPage,
  WorkQueuePage,
} from "@/src/modules/operations/OperationalPages";
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
  children,
}: {
  roles: RoleName[];
  children: React.ReactNode;
}) {
  return <PermissionRoute roles={roles}>{children}</PermissionRoute>;
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppProvider>
        <HashRouter>
          <ScrollToTop />
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<PublicHome />} />
              <Route path="/consulta" element={<PublicLookup />} />
              <Route
                path="/consulta/resultado"
                element={<CitizenPublicResultPage />}
              />
              <Route path="/pagos" element={<CitizenPaymentsPage />} />
              <Route path="/orden-pago" element={<PaymentOrderAccessPage />} />
              <Route
                path="/orden-pago/:codigo"
                element={<CitizenPaymentOrderPage />}
              />
              <Route
                path="/solvencia/solicitar"
                element={<CitizenSolvencyRequestFlow />}
              />
              <Route
                path="/solvencia/seguimiento"
                element={<CitizenSolvencyTrackingPage />}
              />
              <Route
                path="/solvencia/seguimiento/:codigo"
                element={<CitizenSolvencyTrackingPage />}
              />
              <Route
                path="/solvencia/:codigo"
                element={<SolvencyDocumentPage />}
              />
              <Route
                path="/verificar-solvencia"
                element={<CitizenSolvencyVerifyPage />}
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
                  <Allowed roles={guards.adminSupervisor}>
                    <DashboardPage />
                  </Allowed>
                }
              />
              <Route
                path="bandeja"
                element={
                  <Allowed roles={guards.all}>
                    <WorkQueuePage />
                  </Allowed>
                }
              />
              <Route
                path="infracciones"
                element={
                  <Allowed roles={guards.infractions}>
                    <InfractionsListPage />
                  </Allowed>
                }
              />
              <Route
                path="infracciones/pendientes"
                element={
                  <Allowed roles={guards.validation}>
                    <PendingInfractionsPage />
                  </Allowed>
                }
              />
              <Route
                path="infracciones/:id"
                element={
                  <Allowed roles={guards.infractions}>
                    <InfractionDetailPage />
                  </Allowed>
                }
              />
              <Route
                path="ciudadanos"
                element={
                  <Allowed roles={guards.infractions}>
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
                  <Allowed roles={guards.infractions}>
                    <AppealsPage />
                  </Allowed>
                }
              />
              <Route
                path="reportes"
                element={
                  <Allowed roles={guards.adminSupervisor}>
                    <ReportsCompletePage />
                  </Allowed>
                }
              />
              <Route
                path="usuarios"
                element={
                  <Allowed roles={guards.admin}>
                    <UsersPage />
                  </Allowed>
                }
              />
              <Route
                path="roles"
                element={
                  <Allowed roles={guards.admin}>
                    <RolesPage />
                  </Allowed>
                }
              />
              <Route
                path="catalogos"
                element={
                  <Allowed roles={guards.admin}>
                    <CatalogsPage />
                  </Allowed>
                }
              />
              <Route
                path="dispositivos"
                element={
                  <Allowed roles={guards.infractions}>
                    <DevicesSyncPage />
                  </Allowed>
                }
              />
              <Route
                path="auditoria"
                element={
                  <Allowed roles={guards.admin}>
                    <AuditPage />
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
              <Route path="perfil" element={<ProfilePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </AppProvider>
    </ThemeProvider>
  );
}
