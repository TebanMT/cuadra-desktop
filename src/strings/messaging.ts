export const messaging = {
  broadcast: {
    title: "Mensajes a socios",
    subtitle: "Manda un aviso por WhatsApp a un grupo de socios.",
    audienceLabel: "Destinatarios",
    audiences: {
      all_active: "Todos los socios activos",
      expiring_soon: "Por vencer (esta semana)",
      expired: "Vencidos (recuperar)",
      inactive: "Sin venir 21+ días",
    },
    bodyLabel: "Tu mensaje",
    bodyPlaceholder:
      "Escribe el aviso… (ej. Promo 2x1 en inscripción este fin de semana)",
    bodyHelp:
      "El saludo y el nombre del gym se agregan automáticamente.",
    previewLabel: "Así le llega al socio",
    // Esqueleto del template aprobado por Meta (broadcast_freeform). El nombre
    // del socio y el del gym los rellena WhatsApp; el dueño sólo pone el aviso.
    previewSkeleton: (gymName: string, msg: string) =>
      `Hola Juan, tienes un mensaje de parte de ${gymName}: ${msg || "…"} Esperamos verte pronto en el gym.`,
    recipientsCount: (n: number) =>
      n === 0
        ? "Sin destinatarios"
        : n === 1
          ? "1 destinatario"
          : `${n} destinatarios`,
    // Límites Standard (2C): 2 envíos/mes, 100 socios/envío. Plus los levanta.
    monthlyUsage: (used: number, limit: number) =>
      `Llevas ${used} de ${limit} envíos este mes.`,
    monthlyReached: (limit: number) =>
      `Llegaste al máximo de ${limit} envíos este mes. Se renueva el día 1.`,
    overCap: (count: number, cap: number) =>
      `Tienes ${count} socios en este grupo, pero el máximo por envío es ${cap}. Usa un grupo más chico o mejora a Plus.`,
    plusHint: "Standard: 2 envíos al mes, hasta 150 socios por envío. Plus: sin estos límites.",
    // Selección manual de socios (opción C)
    chooseSpecific: "Elegir socios específicos",
    adjustRecipients: (n: number) => `Ajustar destinatarios (${n})`,
    backToGroup: "Usar el grupo completo",
    pickerTitle: "Elegir destinatarios",
    pickerHint:
      "Puedes quitar socios o buscar otros para agregarlos.",
    pickerSearch: "Buscar socio por nombre…",
    pickerNoResults: "Sin resultados.",
    pickerEmpty: "Aún no hay socios. Búscalos arriba para agregar.",
    pickerSelectedCount: (n: number) =>
      n === 1 ? "1 seleccionado" : `${n} seleccionados`,
    pickerDone: "Listo",
    noPhone: "sin teléfono",
    overCapShort: (cap: number) => `máx ${cap}`,
    confirm: {
      title: (n: number) =>
        n === 1 ? "¿Enviar a 1 socio?" : `¿Enviar a ${n} socios?`,
      body:
        "Los destinatarios seleccionados recibirán el mensaje por WhatsApp. No podrás cancelar el envío.",
      cancel: "Cancelar",
      confirm: "Sí, enviar",
    },
    submit: "Enviar",
    submitting: "Enviando…",
    success: (n: number) =>
      n === 1
        ? "1 mensaje pendiente de envío."
        : `${n} mensajes pendientes de envío.`,
    error: "No se pudo enviar el mensaje.",
    empty: "Escribe el mensaje.",
    tooLong: "Mensaje muy largo. Máximo 600 caracteres.",
    noAudience: "Selecciona el grupo destinatario.",
    loadingPreview: "Calculando destinatarios…",
  },
  audit: {
    title: "Bitácora",
    subtitle:
      "Historial de cambios. Solo el dueño tiene acceso a esta vista.",
    notAuthorized:
      "Solo el dueño del gym puede ver la bitácora. Pide acceso si lo necesitas.",
    loadError: "No pudimos cargar la bitácora.",
    empty: "Sin registros para los filtros seleccionados.",
    filters: {
      entity: "Tipo",
      entityAll: "Todos",
      actor: "Quién",
      actorAll: "Cualquiera",
      from: "Desde",
      to: "Hasta",
      reset: "Limpiar filtros",
    },
    columns: {
      when: "Fecha",
      who: "Quién",
      what: "Cambio",
      entity: "Tipo",
      actions: "",
    },
    actions: {
      view: "Ver detalle",
    },
    detail: {
      title: "Detalle del registro",
      changes: "Cambios",
      empty: "No hay detalle de cambios.",
      close: "Cerrar",
    },
    pagination: {
      page: (p: number, total: number) =>
        `Página ${p} de ${Math.max(1, total)}`,
      prev: "Anterior",
      next: "Siguiente",
    },
  },
};
