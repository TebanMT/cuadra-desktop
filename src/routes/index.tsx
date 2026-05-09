import { createBrowserRouter, Navigate } from "react-router-dom";
import { ProtectedRoute, PublicOnlyRoute } from "@/components/shared/RouteGuards";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import Login from "@/pages/auth/Login";
import Welcome from "@/pages/auth/Welcome";
import RedeemInstaller from "@/pages/auth/RedeemInstaller";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";
import SetupRequired from "@/pages/auth/SetupRequired";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import AttentionRequiredPage from "@/pages/dashboard/AttentionRequiredPage";
import MembersPage from "@/pages/members/MembersPage";
import ProfilePage from "@/pages/profile/ProfilePage";
import SettingsIndex from "@/pages/settings/SettingsIndex";
import SubscriptionPage from "@/pages/settings/SubscriptionPage";
import MembershipTypesPage from "@/pages/settings/MembershipTypes";
import PricingPage from "@/pages/public/PricingPage";
import GymProfilePage from "@/pages/settings/GymProfilePage";
import OperatorsPage from "@/pages/settings/OperatorsPage";
import WhatsAppSetupPage from "@/pages/settings/WhatsAppSetupPage";
import TemplatesPage from "@/pages/settings/TemplatesPage";
import AlertsPage from "@/pages/settings/AlertsPage";
import ProductsPage from "@/pages/products/ProductsPage";
import QuickSalePage from "@/pages/sales/QuickSalePage";
import CashClosePage from "@/pages/reports/CashClosePage";
import ReportsPage from "@/pages/reports/ReportsPage";
import CheckinPage from "@/pages/checkin/CheckinPage";
import CobrosPage from "@/pages/billing/CobrosPage";
import KioskPage from "@/pages/kiosk/KioskPage";
import BroadcastPage from "@/pages/messaging/BroadcastPage";
import AuditLogPage from "@/pages/admin/AuditLogPage";

export const router = createBrowserRouter([
  {
    element: <PublicOnlyRoute />,
    children: [
      { path: "/welcome", element: <Welcome /> },
      { path: "/auth/login", element: <Login /> },
      { path: "/auth/redeem-installer", element: <RedeemInstaller /> },
      { path: "/auth/forgot-password", element: <ForgotPassword /> },
      { path: "/auth/reset-password", element: <ResetPassword /> },
      // NOTA: el desktop NO maneja signup. La creación de cuenta + setup
      // del gym viven en el dashboard (https://entinta.app). Si el user
      // intenta llegar a /auth/signup, lo mandamos a /welcome donde tiene
      // un CTA externo al dashboard.
      { path: "/auth/signup", element: <Navigate to="/welcome" replace /> },
      { path: "/pricing", element: <PricingPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      // /auth/setup-required: pantalla terminal cuando el dueño se loguea
      // pero su gym todavía no completó el wizard del dashboard. Le
      // ofrece un botón para abrir el setup en el browser del sistema.
      // Reemplaza al wizard duplicado que vivía acá (Step1-5) — ese
      // flow ahora vive solo en el dashboard.
      { path: "/auth/setup-required", element: <SetupRequired /> },
      { path: "/kiosk", element: <KioskPage /> },
      {
        element: <DashboardLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "attention-required", element: <AttentionRequiredPage /> },
          { path: "members", element: <MembersPage /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "billing", element: <CobrosPage /> },
          { path: "products", element: <ProductsPage /> },
          { path: "sales", element: <QuickSalePage /> },
          { path: "checkin", element: <CheckinPage /> },
          { path: "reports", element: <ReportsPage /> },
          { path: "reports/cash-close", element: <CashClosePage /> },
          { path: "settings", element: <SettingsIndex /> },
          { path: "settings/subscription", element: <SubscriptionPage /> },
          { path: "settings/gym", element: <GymProfilePage /> },
          { path: "settings/membership-types", element: <MembershipTypesPage /> },
          { path: "settings/operators", element: <OperatorsPage /> },
          { path: "settings/whatsapp", element: <WhatsAppSetupPage /> },
          { path: "settings/templates", element: <TemplatesPage /> },
          { path: "settings/alerts", element: <AlertsPage /> },
          { path: "messaging/broadcast", element: <BroadcastPage /> },
          { path: "admin/audit-log", element: <AuditLogPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
