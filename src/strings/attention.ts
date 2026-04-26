export const attention = {
  page: {
    title: "Atención inmediata",
    subtitle: "Socios y operaciones que necesitan tu acción hoy.",
    error: "No pudimos cargar la lista.",
    empty: "Sin pendientes. Bien hecho.",
  },
  sections: {
    expiring: "Vencen ≤7 días",
    expiredRecoverable: "Vencidos por recuperar",
    inactiveInvoluntary: "Sin venir 21+ días",
    lowStock: "Stock bajo",
    pendingBalance: "Saldos pendientes",
    birthdays: "Cumpleañeros hoy",
  },
  empty: {
    expiring: "Nadie vence esta semana.",
    expiredRecoverable: "Sin vencidos por recuperar.",
    inactiveInvoluntary: "Todos vienen seguido.",
    lowStock: "Stock saludable.",
    pendingBalance: "Sin saldos pendientes.",
    birthdays: "Sin cumpleaños hoy.",
  },
  expiring: {
    inDays: (n: number) =>
      n === 0 ? "Vence hoy" : n === 1 ? "Vence mañana" : `Vence en ${n} días`,
    overdueDays: (n: number) =>
      n === 1 ? "Hace 1 día" : `Hace ${n} días`,
    contactedAt: (label: string) => `Le hablaste ${label}`,
    notContacted: "Sin contacto",
  },
  inactive: {
    daysSince: (n: number) =>
      n === 1 ? "1 día sin venir" : `${n} días sin venir`,
  },
  pendingBalance: {
    label: (amount: string) => `Debe ${amount}`,
  },
  actions: {
    contact: "Le hablé",
    markLost: "Marcar perdido",
    callPayment: "Cobrar",
    restock: "Reabastecer",
    sendBirthday: "Felicitar",
    seeMember: "Ver socio",
  },
  attempts: {
    count: (n: number) =>
      n === 0
        ? "Sin intentos"
        : n === 1
          ? "1 intento"
          : `${n} intentos`,
  },
  contactModal: {
    title: (name: string) => `¿Cómo le hablaste a ${name}?`,
    channelLabel: "Canal",
    channels: {
      whatsapp: "WhatsApp",
      phone: "Llamada",
      in_person: "En persona",
      other: "Otro",
    },
    noteLabel: "Nota (opcional)",
    notePlaceholder: "Ej. dijo que regresa el lunes",
    submit: "Registrar contacto",
    submitting: "Guardando…",
    markLost: "Marcar como perdido",
    success: "Intento registrado.",
    successLost: (name: string) => `${name} marcado como perdido.`,
    error: "No pudimos guardar el intento.",
    confirmLost: {
      title: (name: string) => `¿Marcar a ${name} como perdido?`,
      body: "Saldrá de la lista de recuperables. Para reactivarlo después tendrás que cambiarle el estado manualmente.",
      cancel: "Cancelar",
      confirm: "Sí, marcar como perdido",
    },
  },
};
