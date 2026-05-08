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
