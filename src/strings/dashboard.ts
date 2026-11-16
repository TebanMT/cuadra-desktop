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
    // Sin «Ver totales de dinero» el backend sólo trae los cobros de hoy:
    // el título y el vacío dicen ese alcance para no invitar a cobrar dos veces.
    todayTitle: "Cobros de hoy",
    todayEmpty: "Sin cobros hoy.",
    otherDaysRestricted: "Los cobros de otros días los ve el dueño.",
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
  // «Por revisar»: cada fila usa el mismo nombre que el filtro al que lleva
  // (Socios: «Por vencer», «Con saldo», «Sin renovar · 60 días»; Productos:
  // «Solo por surtir»), para que el número de Inicio y el de la lista se lean
  // como la misma cosa.
  review: {
    expiry: { label: "Por vencer", detail: "Membresías que vencen esta semana" },
    balance: { label: "Con saldo", detail: "Socios con saldo pendiente" },
    unrenewed: {
      label: "Sin renovar · 60 días",
      detail: "Vencieron en los últimos 60 días y no han renovado",
    },
    stock: { label: "Por surtir", detail: "Productos con pocas existencias o agotados" },
  } as Record<string, { label: string; detail?: string }>,
  kioskCard: {
    title: "Entrada por kiosco",
    body:
      "Los socios registran su entrada en otra pantalla. Recepción puede seguir cobrando.",
    cta: "Abrir modo kiosco",
    shortcutHint: "También desde cualquier pantalla:",
    shortcut: "Ctrl + Alt + K",
    dismiss: "Ocultar",
  },
};
