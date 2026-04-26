import { createBrowserRouter, Navigate } from "react-router-dom";
import { ProtectedRoute, PublicOnlyRoute } from "@/components/shared/RouteGuards";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import Login from "@/pages/auth/Login";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";
import Step1Account from "@/pages/setup-wizard/Step1Account";
import Step2GymInfo from "@/pages/setup-wizard/Step2GymInfo";
import Step3FirstPlan from "@/pages/setup-wizard/Step3FirstPlan";
import Step4PaymentMethods from "@/pages/setup-wizard/Step4PaymentMethods";
import Step5Done from "@/pages/setup-wizard/Step5Done";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import AttentionRequiredPage from "@/pages/dashboard/AttentionRequiredPage";
import MembersPage from "@/pages/members/MembersPage";
import SettingsIndex from "@/pages/settings/SettingsIndex";
import MembershipTypesPage from "@/pages/settings/MembershipTypes";
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
import KioskPage from "@/pages/kiosk/KioskPage";
import BroadcastPage from "@/pages/messaging/BroadcastPage";
import AuditLogPage from "@/pages/admin/AuditLogPage";

const placeholder = (label: string) => () =>
  (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">{label}</h1>
      <p className="text-muted-foreground mt-2">Esta sección llega en una próxima sesión.</p>
    </div>
  );

const Billing = placeholder("Cobros");

export const router = createBrowserRouter([
  {
    element: <PublicOnlyRoute />,
    children: [
      { path: "/auth/login", element: <Login /> },
      { path: "/auth/forgot-password", element: <ForgotPassword /> },
      { path: "/auth/reset-password", element: <ResetPassword /> },
      { path: "/auth/signup", element: <Step1Account /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      { path: "/setup/step-2", element: <Step2GymInfo /> },
      { path: "/setup/step-3", element: <Step3FirstPlan /> },
      { path: "/setup/step-4", element: <Step4PaymentMethods /> },
      { path: "/setup/step-5", element: <Step5Done /> },
      { path: "/kiosk", element: <KioskPage /> },
      {
        element: <DashboardLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "attention-required", element: <AttentionRequiredPage /> },
          { path: "members", element: <MembersPage /> },
          { path: "billing", element: <Billing /> },
          { path: "products", element: <ProductsPage /> },
          { path: "sales", element: <QuickSalePage /> },
          { path: "checkin", element: <CheckinPage /> },
          { path: "reports", element: <ReportsPage /> },
          { path: "reports/cash-close", element: <CashClosePage /> },
          { path: "settings", element: <SettingsIndex /> },
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
