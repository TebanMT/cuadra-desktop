// El pago del plan vive en el dashboard web (navegador conectado), nunca en
// la recepción. Las pantallas del desktop que piden activar el plan abren
// esta URL con openExternalUrl.
const DASHBOARD_URL =
  (import.meta.env.VITE_DASHBOARD_URL as string | undefined) ?? "https://entinta.app";

export const BILLING_URL = `${DASHBOARD_URL}/settings/subscription`;
