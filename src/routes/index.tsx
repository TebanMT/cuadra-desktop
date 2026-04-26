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
import Dashboard from "@/pages/shell/Dashboard";
import MembersPage from "@/pages/members/MembersPage";
import SettingsIndex from "@/pages/settings/SettingsIndex";
import MembershipTypesPage from "@/pages/settings/MembershipTypes";

const placeholder = (label: string) => () =>
  (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">{label}</h1>
      <p className="text-muted-foreground mt-2">Esta sección llega en una próxima sesión.</p>
    </div>
  );

const Billing = placeholder("Cobros");
const Products = placeholder("Productos");
const Checkin = placeholder("Check-in");
const Reports = placeholder("Reportes");

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
      {
        element: <DashboardLayout />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: "members", element: <MembersPage /> },
          { path: "billing", element: <Billing /> },
          { path: "products", element: <Products /> },
          { path: "checkin", element: <Checkin /> },
          { path: "reports", element: <Reports /> },
          { path: "settings", element: <SettingsIndex /> },
          { path: "settings/membership-types", element: <MembershipTypesPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
