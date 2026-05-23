export const settings = {
  index: {
    title: "Configuración",
    subtitle: "Ajusta los datos del gym, métodos de pago, planes y operadores.",
    sections: {
      gymProfile: {
        title: "Datos del gym",
        body: "Nombre, ciudad, datos fiscales y branding.",
      },
      subscription: {
        title: "Suscripción",
        body: "Tu plan, próximos cobros y recibos.",
      },
      membershipTypes: {
        title: "Membresías",
        body: "Crea, edita o desactiva los planes que ofreces.",
      },
      operators: {
        title: "Operadores",
        body: "Recepcionistas, dueños y permisos.",
      },
      whatsapp: {
        title: "WhatsApp",
        body: "Conecta el WhatsApp del gym para recordatorios y comprobantes.",
      },
      templates: {
        title: "Mensajes y plantillas",
        body: "Personaliza los textos que reciben tus socios.",
      },
      alerts: {
        title: "Alertas al dueño",
        body: "Elige qué eventos te avisamos por WhatsApp.",
      },
      auditLog: {
        title: "Bitácora",
        body: "Historial completo de cambios. Solo dueño.",
      },
      broadcasts: {
        title: "Mensajes a socios",
        body: "Envía un comunicado a un grupo de socios.",
      },
      // Sección consolidada (item 10): WhatsApp + plantillas + envío masivo
      // viven juntas en MensajesPage con tabs internos. Mientras Plus no
      // se vende, sólo Plantillas se muestra (Standard sí envía comprobantes
      // y recordatorios — necesita editar esas plantillas).
      mensajes: {
        title: "Mensajes",
        body: "Personaliza los comprobantes y recordatorios que reciben tus socios.",
      },
      profile: {
        title: "Mi perfil",
        body: "Tu nombre, teléfono y PIN de recepción.",
      },
    },
  },
  // Mini-strings reusables para gateo Plus (cards/secciones que sólo se
  // muestran a gyms en plan Plus).
  plus: {
    // Plus aún no se vende — hasta que app del socio + tap-to-sell +
    // WhatsApp completo entren en producción, el copy en TODOS los gates
    // habla de "Próximamente" para alinear con landing/pricing público.
    // Cuando se libere, cambia "Próximamente" por "Disponible".
    badge: "Próximamente en Plus",
    cta: "Saber más",
    fiscalLocked:
      "Captura RFC, razón social y régimen fiscal para emitir comprobantes formales con datos de tu gym. Próximamente en Plus.",
    hardwareLocked:
      "Conecta torniquete o cerradura por webhook al check-in. Próximamente en Plus.",
    // Copy genérico para PlusFeatureLock — cada página le pasa un title +
    // body adaptado a su feature.
    lockedTitle: "Próximamente en Plus",
    lockedBody:
      "Esta función llega con el plan Plus en los próximos meses. Mientras tanto Standard cubre tu operación diaria. Te avisamos cuando Plus esté listo.",
  },
  // Página parent que agrupa WhatsApp + Plantillas + Envío al socio en tabs.
  // El subtitle Standard refleja lo que el dueño realmente puede tocar hoy
  // (sólo Plantillas, porque WhatsApp connect propio y broadcast son Plus).
  // Cuando Plus se libere, ambos planes muestran `subtitle`.
  mensajes: {
    title: "Mensajes",
    subtitle: "WhatsApp del gym, plantillas automáticas y envíos al socio.",
    subtitleStandard:
      "Plantillas de los comprobantes y recordatorios que Tinta envía a tus socios por ti.",
    tabs: {
      whatsapp: "WhatsApp",
      templates: "Plantillas",
      broadcast: "Envío al socio",
    },
  },
  gymProfile: {
    title: "Datos del gym",
    subtitle: "Estos datos aparecen en comprobantes, recordatorios y la app.",
    saving: "Guardando…",
    saved: "Datos actualizados.",
    saveError: "No pudimos guardar.",
    loadError: "No pudimos cargar los datos del gym.",
    readOnlyForOperator:
      "Solo el dueño puede editar los datos del gym. Si necesitas un cambio, pídeselo al dueño.",
    sections: {
      general: "Datos generales",
      tax: "Datos fiscales (opcional)",
      branding: "Branding",
      operations: "Configuración operativa",
      danger: "Zona delicada",
    },
    fields: {
      name: "Nombre del gym",
      city: "Ciudad",
      whatsapp: "WhatsApp del gym",
      timezone: "Zona horaria",
      rfc: "RFC",
      legalName: "Razón social",
      postalCode: "Código postal",
      taxRegime: "Régimen fiscal",
      logo: "Logo",
      primaryColor: "Color primario",
      secondaryColor: "Color secundario",
      openTime: "Hora de apertura",
      closeTime: "Hora de cierre",
      kioskVolume: "Volumen del kiosko",
      kioskFeedbackTtl: "Duración del feedback al check-in",
    },
    placeholders: {
      whatsapp: "+52 55 1234 5678",
      rfc: "AAAA######AAA",
      taxRegime: "Selecciona régimen",
      timezone: "Selecciona zona",
    },
    help: {
      logo: "PNG, JPG o WEBP, máx 2MB.",
      taxOptional: "Todos los campos fiscales son opcionales. Llénalos si emites comprobantes formales.",
      kioskFeedbackTtl: (s: number) => `${s.toFixed(1)} segundos`,
      kioskVolume: (v: number) => `${v}%`,
    },
    save: "Guardar cambios",
    transferOwnership: "Transferir gym a otra persona",
    transferDescription:
      "Transfiere el control completo del gym. Tú quedarás como operador.",
    errors: {
      nameRequired: "Nombre obligatorio.",
      rfcInvalid: "El RFC no tiene formato válido.",
      colorInvalid: "El color debe ser hex (#RRGGBB).",
      logoTooBig: "El logo debe pesar menos de 2MB.",
      logoBadType: "Formato no válido. Usa PNG, JPG o WEBP.",
      whatsappTaken:
        "Ese WhatsApp ya está registrado en otro gimnasio. Usa un número distinto para este gym.",
    },
  },
  operators: {
    title: "Operadores",
    subtitle: (limit: number, count: number) =>
      `${count} de ${limit} operadores. ${limit - count} disponibles.`,
    create: "Agregar operador",
    edit: "Editar operador",
    columns: {
      name: "Nombre",
      email: "Correo",
      phone: "Teléfono",
      role: "Rol",
      status: "Estado",
      lastLogin: "Último acceso",
      actions: "Acciones",
    },
    role: {
      owner: "Dueño",
      operator: "Operador",
    },
    status: {
      active: "Activo",
      inactive: "Inactivo",
      pendingPassword: "Pendiente cambiar contraseña",
      pin: "PIN",
      legacyPending: "Pendiente migrar",
    },
    actions: {
      activate: "Activar",
      deactivate: "Desactivar",
      rotatePin: "Regenerar PIN",
      resetPasswordLegacy: "Resetear contraseña (legacy)",
      edit: "Editar",
    },
    softWarning: "Estás cerca del límite de 10 operadores.",
    hardLimit: "Llegaste al límite de 10 operadores. Desactiva uno para crear otro.",
    loadError: "No pudimos cargar los operadores.",
    createForm: {
      title: "Nuevo operador",
      phoneHint:
        "Le enviamos el PIN por WhatsApp a este número. Elige el país y escribe el celular.",
      copied: "Copiado.",
      copyPin: "Copiar PIN",
      pinLabel: "PIN de acceso",
      pinHint:
        "Tu operador lo usa para iniciar sesión en el sistema del gym. No se vuelve a mostrar.",
      whatsappSent: (phone: string) => `Enviado por WhatsApp a ${phone}.`,
      whatsappSkipped:
        "WhatsApp no está conectado — compártele el PIN tú mismo o conecta WhatsApp para automatizarlo.",
      submit: "Crear operador",
      submitting: "Creando…",
      success: "Operador creado.",
      successHint: (name: string) =>
        `${name} ya está dado de alta. Este PIN es la única forma de que entre — guárdalo si WhatsApp no llegó.`,
      done: "Listo",
    },
    editForm: {
      submit: "Guardar cambios",
      submitting: "Guardando…",
      success: "Operador actualizado.",
      legacyMigrate:
        "Este operador no tiene PIN. Captura su teléfono y regenera su PIN para migrarlo al nuevo flujo.",
    },
    fields: {
      fullName: "Nombre completo",
      email: "Correo",
      emailOptional: "Correo (opcional)",
      phone: "Teléfono",
    },
    errors: {
      emailInvalid: "Correo inválido.",
      emailDuplicated: "Este correo ya está en uso.",
      phoneRequired: "El teléfono es obligatorio.",
      phoneDuplicated: "Ese teléfono ya está registrado en este gimnasio.",
      nameShort: "Mínimo 3 caracteres.",
      generic: "No pudimos guardar.",
      cantToggleSelf: "No puedes desactivar tu propia cuenta.",
    },
    deactivate: {
      title: (name: string) => `¿Desactivar a ${name}?`,
      body:
        "No podrá iniciar sesión hasta que la reactives. Su historial se conserva.",
      confirm: "Sí, desactivar",
      cancel: "Cancelar",
      success: "Operador desactivado.",
    },
    activate: {
      title: (name: string) => `¿Reactivar a ${name}?`,
      body: "Volverá a poder iniciar sesión con su PIN actual.",
      confirm: "Sí, reactivar",
      success: "Operador reactivado.",
    },
    rotatePin: {
      title: (name: string) => `¿Regenerar el PIN de ${name}?`,
      body:
        "Generaremos un PIN nuevo y se lo enviaremos por WhatsApp. El PIN anterior dejará de funcionar.",
      confirm: "Sí, regenerar",
      success: "PIN regenerado.",
      resultHint: (name: string) =>
        `Este es el nuevo PIN de ${name}. Si WhatsApp no llegó, compártelo tú mismo.`,
    },
    resetPwd: {
      title: (name: string) => `Resetear contraseña de ${name}`,
      body:
        "Generaremos una nueva contraseña temporal. Sólo aplica a operadores con correo (flujo legacy).",
      confirm: "Generar nueva",
      success: "Contraseña reseteada.",
    },
  },
  transfer: {
    triggerTitle: "Transferir gym",
    titleStep1: "Transferir tu gym a otra persona",
    titleStep2: "Confirma con código",
    warning:
      "Esta acción no se puede deshacer. La persona que elijas tendrá control TOTAL del gym, incluyendo cobrar la suscripción, borrar datos y editar todo. Tú quedarás como operador.",
    selectLabel: "Operador destino",
    selectPlaceholder: "Elige un operador",
    selectEmpty:
      "No tienes operadores activos. Crea uno antes de transferir.",
    next: "Continuar",
    cancel: "Cancelar",
    sentCode: (email: string) =>
      `Te enviamos un código de 6 dígitos a ${email}. Cópialo aquí para confirmar.`,
    codeLabel: "Código",
    codePlaceholder: "123456",
    confirm: "Confirmar transferencia",
    confirming: "Confirmando…",
    success: "Transferencia completada.",
    errors: {
      targetRequired: "Selecciona un operador.",
      codeRequired: "Escribe el código.",
      codeInvalid: "Código incorrecto o expirado.",
      sendCode: "No pudimos enviarte el código. Intenta de nuevo.",
      generic: "No pudimos completar la transferencia.",
    },
  },
  whatsapp: {
    title: "Conectar WhatsApp",
    subtitle: "Recordatorios, comprobantes y avisos automáticos a tus socios.",
    notConnected: {
      hero: "Conecta WhatsApp a Tinta",
      copy:
        "Para que tus socios reciban recordatorios y comprobantes automáticos, conecta el WhatsApp del gym.",
      step1Title: "Necesitas WhatsApp Business",
      step1Body: "El WhatsApp normal no funciona. Si no lo tienes, primero descárgalo.",
      step1Link: "Ver cómo en YouTube",
      step2Title: "Te pedimos verificar con un código",
      step2Body: "Te llegará por WhatsApp al número del gym. Lo copias aquí.",
      start: "Empezar",
      phoneLabel: "WhatsApp del gym",
      phonePlaceholder: "+52 55 1234 5678",
      phoneSend: "Enviar código",
      phoneSending: "Enviando…",
      codeLabel: "Código",
      codePlaceholder: "123456",
      codeSubmit: "Conectar",
      codeSubmitting: "Conectando…",
      back: "Atrás",
      sentTo: (phone: string) =>
        `Código enviado a ${phone}. Si no llega en 1 minuto, revisa el número.`,
    },
    connected: {
      hero: (phone: string) => `Conectado a ${phone}`,
      since: (date: string) => `Conectado desde ${date}.`,
      stats: {
        sent: "Enviados (30 días)",
        delivered: "Entregados",
        failed: "Fallidos",
        successRate: "Tasa de éxito",
      },
      lastError: "Último error",
      disconnect: "Desconectar",
      disconnecting: "Desconectando…",
      disconnectConfirm: {
        title: "¿Desconectar WhatsApp?",
        body:
          "Dejarás de enviar recordatorios y comprobantes automáticos. Puedes volver a conectarlo después.",
        confirm: "Sí, desconectar",
      },
    },
    errors: {
      phoneInvalid: "Número inválido. Usa formato internacional (+52 ...).",
      codeInvalid: "Código incorrecto o expirado.",
      generic: "No pudimos completar la operación.",
      loadError: "No pudimos cargar el estado de WhatsApp.",
    },
    successConnected: "WhatsApp conectado.",
    successDisconnected: "WhatsApp desconectado.",
  },
  templates: {
    title: "Mensajes y plantillas",
    subtitle:
      "Personaliza los textos automáticos. Usa las variables del lado derecho para que cada mensaje se ajuste al socio.",
    loadError: "No pudimos cargar las plantillas.",
    enabledLabel: "Activa",
    edit: "Editar",
    enabled: "Activa",
    disabled: "Desactivada",
    customized: "Personalizada",
    isDefault: "Texto por defecto",
    // Llaves exactas del BE (cuadra-core/.../template.go DefaultLibrary).
    // Cualquier llave nueva en BE necesita su entry acá o el row caerá al
    // fallback "humanizado" en TemplateRow. NO renombrar las keys — son el
    // contrato del wire shape.
    keys: {
      expiry_reminder_3d: {
        title: "Recordatorio: 3 días antes de vencer",
        description: "Se envía 3 días antes del vencimiento de la membresía.",
      },
      expiry_reminder_today: {
        title: "Recordatorio: día de vencimiento",
        description: "Se envía el mismo día que vence la membresía.",
      },
      expiry_reminder_5d_post: {
        title: "Recordatorio: 5 días después de vencer",
        description: "Último mensaje automático cuando el socio se atrasa.",
      },
      receipt_membership: {
        title: "Comprobante de pago de membresía",
        description: "Se envía al socio cuando registras un cobro de membresía.",
      },
      receipt_product: {
        title: "Comprobante de venta de producto",
        description: "Se envía al socio al registrar una venta rápida.",
      },
      owner_alert_low_stock: {
        title: "Alerta al dueño: stock bajo",
        description: "Aviso al dueño cuando un producto cae al stock mínimo.",
      },
      owner_alert_expired_batch: {
        title: "Alerta al dueño: vencidos sin contactar",
        description: "Aviso cuando se acumulan vencidos sin contacto reciente.",
      },
      owner_alert_cash_close_diff: {
        title: "Alerta al dueño: diferencia en cierre de caja",
        description: "Aviso cuando el cierre de caja arroja una diferencia.",
      },
      broadcast_freeform: {
        title: "Mensaje masivo (envío al socio)",
        description: "Plantilla wrapper para los envíos manuales a grupos de socios.",
      },
      operator_temp_password: {
        title: "Contraseña temporal de operador",
        description: "Se envía al operador cuando el dueño le crea o resetea la contraseña.",
      },
      member_welcome_pin: {
        title: "Bienvenida al socio con PIN de kiosko",
        description: "Se envía al socio al inscribirse o al regenerar su PIN de check-in.",
      },
      whatsapp_connect_otp: {
        title: "Código de conexión de WhatsApp",
        description: "Código de verificación para conectar el WhatsApp del gym (no editable).",
      },
    },
    modal: {
      title: (name: string) => name,
      bodyLabel: "Mensaje",
      previewLabel: "Vista previa",
      previewHint: "Las variables se reemplazan con datos de ejemplo.",
      variablesLabel: "Variables disponibles",
      reset: "Restaurar texto por defecto",
      resetConfirm: {
        title: "¿Restaurar texto por defecto?",
        body: "Perderás los cambios que hayas hecho a esta plantilla.",
        confirm: "Restaurar",
      },
      enabledLabel: "Plantilla activa",
      submit: "Guardar cambios",
      submitting: "Guardando…",
      success: "Plantilla actualizada.",
      successReset: "Plantilla restaurada al texto por defecto.",
      error: "No pudimos guardar.",
      tooLong: "Mensaje muy largo. Máximo 1000 caracteres.",
      empty: "El mensaje no puede estar vacío.",
    },
  },
  alerts: {
    title: "Alertas al dueño",
    subtitle:
      "Elige qué eventos te avisamos por WhatsApp y personaliza el texto que recibes en cada uno.",
    loadError: "No pudimos cargar las alertas.",
    saving: "Guardando…",
    saved: "Cambio guardado.",
    saveError: "No pudimos guardar.",
    customized: "Personalizada",
    // Editor inline (toggle + textarea + variables) por cada alerta. Espeja el
    // tono del modal de plantillas para que el dueño no sienta dos editores
    // distintos. Mensajes de error coinciden con los del modal.
    editor: {
      enabledLabel: "Recibir esta alerta",
      bodyLabel: "Mensaje que recibes",
      previewLabel: "Vista previa",
      previewHint: "Las variables se reemplazan con datos de ejemplo.",
      variablesLabel: "Variables disponibles",
      save: "Guardar texto",
      saving: "Guardando…",
      success: "Texto actualizado.",
      reset: "Restaurar texto por defecto",
      resetConfirm: {
        title: "¿Restaurar texto por defecto?",
        body: "Perderás los cambios que hayas hecho a este mensaje.",
        confirm: "Restaurar",
      },
      tooLong: "Mensaje muy largo. Máximo 1000 caracteres.",
      empty: "El mensaje no puede estar vacío.",
      missingVar: "Faltan variables requeridas en el mensaje.",
    },
    keys: {
      low_stock: {
        title: "Stock bajo",
        description:
          "Te avisamos cuando un producto cae al stock mínimo configurado.",
      },
      expired_no_contact: {
        title: "Vencidos sin contactar",
        description:
          "Te avisamos cuando se acumulan 5 o más vencidos sin contactar en 7 días.",
      },
      vip_member_no_visit: {
        title: "Socio VIP no viene",
        description:
          "Avisos cuando un socio del top 10% de pagos lleva 14+ días sin venir.",
      },
      cash_close_diff: {
        title: "Diferencia en cierre de caja",
        description:
          "Aviso cuando el cierre de caja tiene una diferencia mayor a $100.",
      },
      no_payments_today: {
        title: "0 cobros en un día",
        description:
          "Aviso si no se registró ningún cobro en el día (señal de operador inactivo).",
      },
    },
  },
};
