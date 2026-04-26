export const dashboard = {
  greeting: (name: string | null) =>
    name ? `Hola, ${name.split(" ")[0]}` : "Hola",
  subtitle: (gymName: string | null) =>
    gymName ? gymName : "Bienvenido a Cuadra",
  loading: "Cargando dashboard…",
  error: "No pudimos cargar el dashboard.",
  kpis: {
    activeMembers: "Socios activos",
    incomeMonth: "Ingresos del mes",
    expiringWeek: "Vencen esta semana",
    recoverable: "Por recuperar",
    vsLastPeriod: "vs período anterior",
  },
  income30d: {
    title: "Ingresos últimos 30 días",
    empty: "Sin ingresos en los últimos 30 días.",
  },
  attention: {
    title: "Atención inmediata",
    seeAll: "Ver todo",
    expiringSoon: (n: number) =>
      n === 1 ? "1 socio vence pronto" : `${n} socios vencen pronto`,
    expiredRecoverable: (n: number) =>
      n === 1 ? "1 vencido por recuperar" : `${n} vencidos por recuperar`,
    inactiveInvoluntary: (n: number) =>
      n === 1 ? "1 socio sin venir 21+ días" : `${n} socios sin venir 21+ días`,
    lowStock: (n: number) =>
      n === 1 ? "1 producto con stock bajo" : `${n} productos con stock bajo`,
    pendingBalance: (n: number) =>
      n === 1 ? "1 saldo pendiente" : `${n} saldos pendientes`,
    birthdaysToday: (n: number) =>
      n === 1 ? "1 cumpleañero hoy 🎂" : `${n} cumpleañeros hoy 🎂`,
    none: "Todo en orden 🎉",
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
};
