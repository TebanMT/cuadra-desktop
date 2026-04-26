export const cashClose = {
  page: {
    title: "Caja del día",
    dateLabel: "Fecha",
    today: "Hoy",
    yesterday: "Ayer",
    print: "Imprimir corte",
    sendWhatsapp: "Enviar por WhatsApp",
    closeCashRegister: "Cerrar caja",
    sections: {
      methods: "Por método de pago",
      concepts: "Por concepto",
      operators: "Operadores",
      refunds: "Devoluciones del día",
    },
    methods: {
      cash: "Efectivo",
      transfer: "Transferencias",
      card: "Tarjeta",
    },
    concepts: {
      membership: "Mensualidades",
      product: "Productos",
      balance_settlement: "Abonos",
      other: "Otros",
    },
    counts: {
      payments: (n: number) => `${n} ${n === 1 ? "cobro" : "cobros"}`,
      sales: (n: number) => `${n} ${n === 1 ? "venta" : "ventas"}`,
      mix: (payments: number, sales: number) =>
        `${payments} ${payments === 1 ? "cobro" : "cobros"}, ${sales} ${sales === 1 ? "venta" : "ventas"}`,
    },
    total: "Total",
    empty: "No hay movimientos en este día.",
    error: "No pudimos cargar el corte.",
    closedAt: (date: string) => `Caja cerrada el ${date}`,
    diffLabel: (amount: string, sign: "+" | "−") =>
      `Diferencia: ${sign}${amount}`,
  },
  modal: {
    title: "Cierre de caja",
    calculatedLabel: "Efectivo calculado por Cuadra",
    countedLabel: "Efectivo contado físicamente",
    diffLabel: "Diferencia",
    reasonLabel: "Si hay diferencia, ¿qué pasó?",
    reasonPlaceholder: "Ej. faltan $40, se rompieron 2 botellas, propinas, …",
    reasonRequired: "Escribe la razón de la diferencia.",
    skip: "Saltar",
    submit: "Cerrar caja",
    success: "Caja cerrada.",
    errors: {
      countedInvalid: "Escribe el efectivo contado.",
      generic: "No pudimos cerrar la caja.",
    },
  },
};
