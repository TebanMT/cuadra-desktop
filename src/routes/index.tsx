import { createBrowserRouter, Navigate } from "react-router-dom";
import { OwnerOnlyRoute, ProtectedRoute, PublicOnlyRoute } from "@/components/shared/RouteGuards";
import { UpdaterShell } from "@/components/shared/UpdaterShell";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import Login from "@/pages/auth/Login";
import LoginEmail from "@/pages/auth/LoginEmail";
import Welcome from "@/pages/auth/Welcome";
import RedeemInstaller from "@/pages/auth/RedeemInstaller";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";
import SetupRequired from "@/pages/auth/SetupRequired";
import SubscriptionBlocked from "@/pages/auth/SubscriptionBlocked";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import AttentionRequiredPage from "@/pages/dashboard/AttentionRequiredPage";
import MembersPage from "@/pages/members/MembersPage";
import MemberCreatePage from "@/pages/members/MemberCreatePage";
import MemberDetailPage from "@/pages/members/MemberDetailPage";
import MemberImportPage from "@/pages/members/MemberImportPage";
import ProfilePage from "@/pages/profile/ProfilePage";
import SettingsIndex from "@/pages/settings/SettingsIndex";
import AboutTintaPage from "@/pages/settings/AboutTintaPage";
import SubscriptionPage from "@/pages/settings/SubscriptionPage";
import MembershipTypesPage from "@/pages/settings/MembershipTypes";
import PricingPage from "@/pages/public/PricingPage";
import GymProfilePage from "@/pages/settings/GymProfilePage";
import OperatorsPage from "@/pages/settings/OperatorsPage";
import WhatsAppSetupPage from "@/pages/settings/WhatsAppSetupPage";
import TemplatesPage from "@/pages/settings/TemplatesPage";
import AlertsPage from "@/pages/settings/AlertsPage";
import MensajesPage from "@/pages/settings/MensajesPage";
import ProductsPage from "@/pages/products/ProductsPage";
import ExpensesPage from "@/pages/expenses/ExpensesPage";
import QuickSalePage from "@/pages/sales/QuickSalePage";
import CashClosePage from "@/pages/reports/CashClosePage";
import ReportsPage from "@/pages/reports/ReportsPage";
import CheckinPage from "@/pages/checkin/CheckinPage";
import CheckinFloatPage from "@/pages/checkin/CheckinFloatPage";
import CobrosPage from "@/pages/billing/CobrosPage";
import KioskPage from "@/pages/kiosk/KioskPage";
import BroadcastPage from "@/pages/messaging/BroadcastPage";
import AuditLogPage from "@/pages/admin/AuditLogPage";
import ChallengesListPage from "@/pages/challenges/ChallengesListPage";
import ChallengeDetailPage from "@/pages/challenges/ChallengeDetailPage";

export const router = createBrowserRouter([
  {
    element: <PublicOnlyRoute />,
    children: [
      { path: "/welcome", element: <Welcome /> },
      { path: "/auth/login", element: <Login /> },
      { path: "/auth/login-email", element: <LoginEmail /> },
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
      // UpdaterShell envuelve TODO el árbol post-login. Móntea el ciclo
      // de auto-update + el modal bloqueante de "schema upgrade required".
      // Tiene que estar dentro de ProtectedRoute porque el check inicial
      // exige tener sidecar y sesión activa.
      {
        element: <UpdaterShell />,
        children: [
      // /auth/setup-required: pantalla terminal cuando el dueño se loguea
      // pero su gym todavía no completó el wizard del dashboard. Le
      // ofrece un botón para abrir el setup en el browser del sistema.
      // Reemplaza al wizard duplicado que vivía acá (Step1-5) — ese
      // flow ahora vive solo en el dashboard.
      { path: "/auth/setup-required", element: <SetupRequired /> },
      // Pantalla terminal cuando el cloud (vía sync) marcó la suscripción
      // como cancelada y la grace period venció. El sidecar también responde
      // 402 a casi todas las rutas en este estado — el FE redirige aquí vía
      // ProtectedRoute para evitar loaders intermedios. El usuario sale al
      // dashboard cloud a pagar; al siguiente sync exitoso el bloqueo cede.
      { path: "/auth/subscription-blocked", element: <SubscriptionBlocked /> },
      { path: "/kiosk", element: <KioskPage /> },
      // Ventana flotante de check-in (label "checkin-float"). Igual que el
      // kiosko: fuera de DashboardLayout (sin sidebar/topbar) pero dentro
      // de ProtectedRoute + UpdaterShell — misma SPA, mismo boot, misma
      // auth hidratada.
      { path: "/checkin-float", element: <CheckinFloatPage /> },
      {
        element: <DashboardLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "attention-required", element: <AttentionRequiredPage /> },
          { path: "members", element: <MembersPage /> },
          // Orden importante: rutas estáticas ("new", "import") antes que
          // ":id" porque react-router mata el match en el primero que
          // pegue. Si "members/:id" viniera primero, navegar a
          // "/members/new" lo atraparía como detail con id="new".
          { path: "members/new", element: <MemberCreatePage /> },
          { path: "members/import", element: <MemberImportPage /> },
          { path: "members/:id", element: <MemberDetailPage /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "billing", element: <CobrosPage /> },
          { path: "products", element: <ProductsPage /> },
          { path: "expenses", element: <ExpensesPage /> },
          { path: "sales", element: <QuickSalePage /> },
          { path: "checkin", element: <CheckinPage /> },
          { path: "reports", element: <ReportsPage /> },
          { path: "reports/cash-close", element: <CashClosePage /> },
          { path: "settings", element: <SettingsIndex /> },
          { path: "settings/about", element: <AboutTintaPage /> },
          { path: "settings/gym", element: <GymProfilePage /> },
          { path: "settings/membership-types", element: <MembershipTypesPage /> },
          // Owner-only: páginas administrativas que un operador no debe abrir
          // por URL directa. El sidebar ya las oculta con `ownerOnly: true`,
          // este guard es defensa en profundidad (item 9 — bitácora — y todos
          // los demás owner-only por consistencia).
          {
            element: <OwnerOnlyRoute />,
            children: [
              { path: "settings/subscription", element: <SubscriptionPage /> },
              { path: "settings/operators", element: <OperatorsPage /> },
              { path: "settings/mensajes", element: <MensajesPage /> },
              { path: "settings/alerts", element: <AlertsPage /> },
              { path: "admin/audit-log", element: <AuditLogPage /> },
              // Sub-rutas legacy: la consolidación (item 10) movió WhatsApp +
              // plantillas + envío masivo a tabs internos de /settings/mensajes.
              // Mantenemos las URLs viejas vivas para preservar deep-links —
              // el componente de la página ahora redirige al tab equivalente.
              { path: "settings/whatsapp", element: <WhatsAppSetupPage /> },
              { path: "settings/templates", element: <TemplatesPage /> },
              { path: "messaging/broadcast", element: <BroadcastPage /> },
            ],
          },
          { path: "retos", element: <ChallengesListPage /> },
          { path: "retos/:id", element: <ChallengeDetailPage /> },
        ],
      },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
