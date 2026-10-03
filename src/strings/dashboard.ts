function firstName(input: string | null): string | null {
  if (!input) return null;
  // Bail out on email-shaped names — guessing first vs surname from
  // local-parts is unreliable (mendiola_esteban vs juan.perez); the user
  // fixes it via /profile and we get clean data from the next /me call.
  if (input.includes("@")) return null;
  const cleaned = input.trim();
  if (!cleaned) return null;
  const first = cleaned.split(/\s+/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export const dashboard = {
  greeting: (name: string | null) => {
    const first = firstName(name);
    return first ? `Hola, ${first}` : "Hola";
  },
  fixProfileHint: "Aún no configuras tu nombre.",
  fixProfileCta: "Editar perfil",
  subtitle: (gymName: string | null) =>
    gymName ? gymName : "Bienvenido a Tinta",
  loading: "Cargando resumen…",
  error: "No se pudo cargar el resumen.",
  kpis: {
    activeMembers: "Socios activos",
    checkinsToday: "Entradas hoy",
    checkinsTodayHint: "entradas registradas hoy",
    incomeMonth: "Ingresos del mes",
    gananciaMes: "Ganancia de productos",
    expensesMonth: "Salidas del mes",
    expensesHint: "Gastos + compras + devoluciones",
    expiringWeek: "Vencen esta semana",
    recoverable: "Por recuperar",
    pendingDebt: "Por cobrar (fiado)",
    pendingDebtCount: (n: number) => (n === 1 ? "1 socio debe" : `${n} socios deben`),
    pendingDebtHint: "toca para ver quiénes",
    vsLastPeriod: "vs período anterior",
    marginLabel: "margen sobre ventas",
    coverage: (withCost: number, total: number) =>
      `${withCost} de ${total} con costo`,
  },
  income30d: {
    title: "Ingresos últimos 30 días",
    empty: "Sin ingresos en los últimos 30 días.",
  },
  recentPayments: {
    title: "Últimos cobros",
    empty: "Sin cobros recientes.",
    columns: {
      member: "Socio",
      concept: "Concepto",
      method: "Método",
      amount: "Monto",
      date: "Fecha",
    },
  },
  cashToday: {
    title: "Caja del día",
    seeFullClose: "Ver caja del día",
    seeExpiring: "Ver socios por vencer",
  },
  quickActions: {
    sectionLabel: "Acciones rápidas",
    pay: "Cobrar",
    checkin: "Registrar entrada",
    sale: "Venta rápida",
    newMember: "Nuevo socio",
  },
  privacy: {
    showAmounts: "Mostrar montos",
    hideAmounts: "Ocultar montos",
    masked: "$•••",
  },
  kioskCard: {
    title: "Entrada por kiosko",
    body:
      "Los socios registran su entrada en otra pantalla. Recepción puede seguir cobrando.",
    cta: "Abrir modo kiosko",
    shortcutHint: "También desde cualquier pantalla:",
    shortcut: "Ctrl + Alt + K",
    dismiss: "Ocultar",
  },
};
