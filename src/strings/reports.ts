export const reports = {
  page: {
    title: "Reportes",
    subtitle: "Analiza tu gym por períodos y exporta lo que necesites.",
    periodLabel: "Período",
    error: "No pudimos cargar el reporte.",
    empty: "Sin movimientos en este período.",
    exportPdf: "Descargar PDF",
    exportXlsx: "Descargar XLSX",
    exportingPdf: "Preparando PDF…",
    exportingXlsx: "Preparando XLSX…",
    exportSuccess: "Descarga lista.",
    exportError: "No pudimos preparar el archivo.",
  },
  periods: {
    today: "Hoy",
    week: "Esta semana",
    month: "Este mes",
    last_month: "Mes pasado",
    "3_months": "Últimos 3 meses",
    year: "Este año",
  },
  kpis: {
    income: "Ingresos",
    newMembers: "Socios nuevos",
    checkins: "Check-ins",
    refunds: "Devoluciones",
  },
  charts: {
    incomeByDay: "Ingresos por día",
    checkinsByDay: "Check-ins por día",
  },
  byMethod: {
    title: "Por método de pago",
    cash: "Efectivo",
    transfer: "Transferencias",
    card: "Tarjeta",
  },
  topMembers: {
    title: "Socios que más pagaron",
    empty: "Sin pagos en este período.",
    columns: {
      member: "Socio",
      payments: "# Pagos",
      total: "Total",
    },
    paymentsCount: (n: number) =>
      n === 1 ? "1 pago" : `${n} pagos`,
  },
  recentPayments: {
    title: "Cobros del período",
    empty: "Sin cobros.",
    columns: {
      date: "Fecha",
      member: "Socio",
      concept: "Concepto",
      method: "Método",
      amount: "Monto",
    },
  },
};
