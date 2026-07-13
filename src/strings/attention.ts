export const attention = {
  page: {
    title: "Atención inmediata",
    subtitle: "Socios y operaciones que necesitan tu acción hoy.",
    error: "No pudimos cargar la lista.",
    empty: "Sin pendientes. Bien hecho.",
  },
  sections: {
    socios: "Socios por atender",
    lowStock: "Stock bajo",
  },
  empty: {
    socios: "Sin socios por atender. Bien hecho.",
    lowStock: "Stock saludable.",
  },
  filters: {
    all: "Todos",
    expired: "Vencidos",
    expiring: "Por vencer",
    balance: "Con saldo",
  },
  chips: {
    expired: (days: number) =>
      days === 1 ? "Vencida ayer" : `Vencida hace ${days} d`,
    expiring: (days: number) =>
      days === 0 ? "Vence hoy" : days === 1 ? "Vence mañana" : `Vence en ${days} d`,
    balance: (amount: string) => `Saldo ${amount}`,
  },
  expiring: {
    inDays: (n: number) =>
      n === 0 ? "Vence hoy" : n === 1 ? "Vence mañana" : `Vence en ${n} días`,
    overdueDays: (n: number) =>
      n === 1 ? "Hace 1 día" : `Hace ${n} días`,
  },
  pendingBalance: {
    label: (amount: string) => `Debe ${amount}`,
  },
  actions: {
    whatsapp: "WhatsApp",
    pay: "Cobrar",
    settle: "Abonar",
    restock: "Reabastecer",
  },
  // Plantillas pre-cargadas en wa.me. Se diseñaron cortas, en tono
  // cordial-directo: el operador ya tiene mil cosas que hacer, no
  // queremos que se ponga a editar el mensaje cada vez. Si quiere
  // personalizar lo hace en WhatsApp antes de mandar.
  whatsappTemplates: {
    expiring: (name: string, expiryLabel: string, days: number) => {
      const first = name.split(/\s+/)[0];
      const venc =
        days === 0
          ? "vence hoy"
          : days === 1
          ? "vence mañana"
          : `vence en ${days} días`;
      return `Hola ${first}, te recuerdo que tu mensualidad ${venc} (${expiryLabel}). Cuando puedas pasa al gym a renovar 💪`;
    },
    expired: (name: string, daysOverdue: number) => {
      const first = name.split(/\s+/)[0];
      const overdue =
        daysOverdue === 1
          ? "ayer"
          : `hace ${daysOverdue} días`;
      return `Hola ${first}, tu mensualidad venció ${overdue}. ¿Pasas hoy a renovar? Te esperamos 💪`;
    },
    pendingBalance: (name: string, amount: string) => {
      const first = name.split(/\s+/)[0];
      return `Hola ${first}, te recuerdo que tienes un saldo pendiente de ${amount} con el gym. ¿Pasas a cubrirlo? Gracias 🙏`;
    },
  },
};
