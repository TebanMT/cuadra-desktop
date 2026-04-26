export const messaging = {
  broadcast: {
    title: "Mensajes a socios",
    subtitle: "Envía un comunicado por WhatsApp a un grupo de socios.",
    audienceLabel: "Destinatarios",
    audiences: {
      all_active: "Todos los socios activos",
      expiring_this_week: "Socios que vencen esta semana",
      expired_recoverable: "Vencidos (≤60 días)",
      inactive_21d: "Sin venir 21+ días",
      vip: "Socios VIP (top 10% de pagos)",
    },
    bodyLabel: "Mensaje",
    bodyPlaceholder:
      "Hola {member_first_name}, te recordamos que…",
    bodyHelp:
      "Variables disponibles: {gym_name}, {member_first_name}, {member_name}.",
    previewLabel: "Vista previa",
    recipientsCount: (n: number) =>
      n === 0
        ? "Sin destinatarios"
        : n === 1
          ? "1 destinatario"
          : `${n} destinatarios`,
    samplePhones: "Algunos números de muestra:",
    confirm: {
      title: (n: number) =>
        n === 1 ? "¿Enviar a 1 socio?" : `¿Enviar a ${n} socios?`,
      body:
        "Se enviará por WhatsApp a todos los socios del grupo seleccionado. Esta acción no se puede deshacer.",
      cancel: "Cancelar",
      confirm: "Sí, enviar",
    },
    submit: "Enviar broadcast",
    submitting: "Enviando…",
    success: (n: number) =>
      n === 1
        ? "1 mensaje encolado para enviar."
        : `${n} mensajes encolados para enviar.`,
    error: "No pudimos enviar el broadcast.",
    notConnected:
      "WhatsApp no está conectado. Conéctalo en Configuración antes de enviar.",
    empty: "Escribe el mensaje.",
    tooLong: "Mensaje muy largo. Máximo 1000 caracteres.",
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
      actor: "Actor",
      actorAll: "Cualquiera",
      from: "Desde",
      to: "Hasta",
      reset: "Limpiar filtros",
    },
    columns: {
      when: "Cuándo",
      who: "Quién",
      what: "Qué",
      entity: "Entidad",
      actions: "",
    },
    actions: {
      view: "Ver detalle",
    },
    detail: {
      title: "Detalle del registro",
      changes: "Cambios",
      empty: "Sin cambios serializados.",
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
