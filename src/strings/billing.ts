export const billing = {
  payment: {
    title: (name: string) => `Cobrar a ${name}`,
    membership: "Membresía",
    total: "Total",
    breakdown: {
      base: "Mensualidad",
      enrollment: "Inscripción",
      maintenance: "Mantenimiento",
      discount: "Descuento",
    },
    // Warnings inline que aparecen sólo cuando el operador FUERZA
    // (override manual) un cobro que el sistema no recomienda. La
    // intención es advertir sin bloquear — el operador sabrá si tiene
    // razón legítima (recargo, error previo, etc.).
    warn: {
      enrollmentAlreadyPaid:
        "Este socio ya pagó su inscripción anteriormente. Sólo cóbrasela otra vez si es un caso especial.",
      maintenanceNotDue: (date: string) =>
        `El siguiente cobro de mantenimiento toca hasta el ${date}. Sólo adelántalo si es un caso especial.`,
    },
    addDiscount: "+ Aplicar descuento",
    removeDiscount: "− Quitar descuento",
    addPartial: "+ Pago parcial (diferido)",
    removePartial: "− Cobro completo",
    discountLabel: "Monto del descuento",
    discountReasonLabel: "Razón del descuento",
    discountReasonPlaceholder: "Ej. promoción referido, fidelidad…",
    partialLabel: "Cuánto te paga ahora",
    partialHint: (pending: string) => `Quedará un saldo pendiente de ${pending}.`,
    method: "Método de pago",
    methods: {
      cash: "Efectivo",
      transfer: "Transferencia",
      card: "Tarjeta",
    },
    date: "Fecha",
    notes: "Notas (opcional)",
    notesPlaceholder: "Comentario interno, no aparece en el comprobante",
    newExpiry: (date: string) => `Nueva vigencia: ${date}`,
    submit: (amount: string) => `Cobrar ${amount}`,
    cancel: "Cancelar",
    offline: "Sin conexión: se guardará y sincronizará cuando vuelva.",
    success: {
      online: (amount: string, name: string, expiry: string) =>
        `${amount} cobrados a ${name}. Vence ${expiry}.`,
      offline: "Guardado. Se sincronizará cuando vuelva la conexión.",
      whatsappSent: (name: string) => `✓ Comprobante enviado a ${name} por WhatsApp.`,
    },
    afterAction: {
      print: "Imprimir comprobante",
      sendWhatsapp: "Enviar por WhatsApp",
      close: "Listo",
      whatsappSending: "Enviando por WhatsApp…",
      whatsappError: "No pudimos enviar el comprobante. Intenta más tarde.",
      // El envío es asíncrono (cola → sync → dispatcher cloud → Twilio):
      // decir "enviado" a secas hacía que el operador esperara el mensaje
      // al instante y reportara "no hace nada".
      whatsappOk: "Comprobante en camino — le llega por WhatsApp en unos minutos.",
      whatsappAlready: "El comprobante ya está en camino.",
      whatsappSkipped: "No se pudo enviar el comprobante.",
      printOk: "Enviado a la impresora.",
      // El sistema no siempre expone el verbo "imprimir" para PDFs (Edge
      // sin Acrobat): en ese caso abrimos el visor y se lo decimos.
      printOpened: "Abrí el comprobante en tu visor de PDF — imprímelo desde ahí.",
      printError: "No pudimos imprimir.",
    },
    errors: {
      methodRequired: "Selecciona el método de pago.",
      amountInvalid: "El monto debe ser mayor a cero.",
      partialInvalid: "El abono debe ser mayor a cero y menor o igual al total.",
      discountInvalid: "El descuento no puede ser mayor al subtotal.",
      discountReasonRequired: "Escribe la razón del descuento.",
      generic: "No pudimos cobrar. Vuelve a intentar.",
    },
  },
  settle: {
    title: (name: string) => `Liquidar saldo — ${name}`,
    pendingLabel: (amount: string) => `Saldo pendiente: ${amount}`,
    amountLabel: "Cuánto vas a abonar",
    methodLabel: "Método de pago",
    submit: (amount: string) => `Abonar ${amount}`,
    cancel: "Cancelar",
    success: (remaining: string) =>
      remaining === "$0.00" ? "Saldo liquidado." : `Abono registrado. Queda ${remaining}.`,
    errors: {
      amountInvalid: "El abono debe ser mayor a cero y no mayor al saldo.",
      methodRequired: "Selecciona el método de pago.",
      generic: "No pudimos registrar el abono.",
    },
  },
  receipt: {
    title: (folio: string) => `Comprobante ${folio}`,
    download: "Descargar",
    downloadOk: (path: string) => `Comprobante guardado en ${path}`,
    downloadError: "No pudimos guardar el comprobante.",
    print: "Imprimir",
    sendWhatsapp: "Enviar por WhatsApp",
    loading: "Generando comprobante…",
    error: "No pudimos cargar el comprobante.",
    close: "Cerrar",
  },
  detailFlag: {
    pending: (amount: string) => `💰 Saldo pendiente: ${amount}`,
    pendingTitle: "Liquidar saldo",
    // Desglose del banner cuando la deuda viene de más de un origen.
    breakdownPart: (concept: string, amount: string) => {
      const label =
        { membership: "de mensualidad", product: "de venta", other: "de otros" }[concept] ??
        `de ${concept}`;
      return `${amount} ${label}`;
    },
  },
  history: {
    columns: {
      date: "Fecha",
      concept: "Concepto",
      amount: "Monto",
      method: "Método",
      notes: "Notas",
      operator: "Operador",
    },
    filters: {
      conceptLabel: "Concepto",
      from: "Desde",
      to: "Hasta",
      conceptAll: "Todos",
    },
    concepts: {
      membership: "Membresía",
      product: "Producto",
      balance_settlement: "Abono",
      refund: "Devolución",
      other: "Otro",
    },
    empty: "Aún no hay pagos registrados.",
    pendingFlag: (amount: string) => `Saldo pendiente: ${amount}`,
    pendingSettle: "Liquidar",
    rowOpenReceipt: "Ver comprobante",
    rowRefund: "Cancelar / devolución",
    error: "No pudimos cargar el historial.",
  },
  cobranza: {
    title: "Cobros",
    subtitle: "Pagos del gym, día por día.",
    chargeMember: "Cobrar a un socio",
    pickMember: "Selecciona un socio",
    pickMemberHint: "Búscalo por nombre, folio o teléfono.",
    stats: {
      total: "Cobrado",
      totalHint: "neto del periodo",
      count: "Movimientos",
      countHint: "transacciones",
      cash: "Efectivo",
      transfer: "Transferencia",
      card: "Tarjeta",
    },
    period: {
      label: "Periodo",
      today: "Hoy",
      week: "7 días",
      month: "30 días",
      custom: "Rango",
    },
    filters: {
      conceptLabel: "Concepto",
      from: "Desde",
      to: "Hasta",
      conceptAll: "Todos",
    },
    columns: {
      time: "Hora",
      date: "Fecha",
      member: "Socio",
      concept: "Concepto",
      amount: "Monto",
      method: "Método",
      operator: "Operador",
    },
    empty: {
      title: "Sin cobros en este periodo.",
      hint: "Cuando cobres, aparecerán aquí en tiempo real.",
    },
    error: "No pudimos cargar los cobros.",
    pagination: {
      prev: "Anterior",
      next: "Siguiente",
      page: (p: number, total: number) => `Página ${p} de ${total}`,
    },
    refundedTag: "Devolución",
    pendingTag: (amount: string) => `Saldo: ${amount}`,
    rowMember: "(socio dado de baja)",
  },
  refund: {
    title: (amount: string) => `¿Cancelar este pago de ${amount}?`,
    reasonLabel: "Razón (obligatoria)",
    reasonPlaceholder: "Ej. cobro doble, error de operador, cortesía…",
    revertLabel: "Revertir vigencia de membresía (regresará al estado anterior)",
    moneyLabel: "El dinero…",
    money: {
      cash: "Se devuelve en efectivo",
      transfer: "Se devuelve por transferencia",
      none: "No se devuelve",
    },
    disclaimer: "Esta acción queda registrada en el historial.",
    submit: "Confirmar cancelación",
    cancel: "Cancelar",
    success: "Pago cancelado.",
    ownerOnly: "Solo el dueño del gym puede cancelar pagos.",
    errors: {
      reasonRequired: "Escribe una razón.",
      generic: "No pudimos cancelar el pago.",
    },
  },
};
