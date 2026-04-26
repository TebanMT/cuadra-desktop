export const settings = {
  index: {
    title: "Configuración",
    subtitle: "Ajusta los datos del gym, métodos de pago, planes y operadores.",
    sections: {
      gymProfile: {
        title: "Datos del gym",
        body: "Nombre, ciudad, datos fiscales y branding.",
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
    },
  },
  gymProfile: {
    title: "Datos del gym",
    subtitle: "Estos datos aparecen en comprobantes, recordatorios y la app.",
    saving: "Guardando…",
    saved: "Datos actualizados.",
    saveError: "No pudimos guardar.",
    loadError: "No pudimos cargar los datos del gym.",
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
    },
    actions: {
      activate: "Activar",
      deactivate: "Desactivar",
      resetPassword: "Resetear contraseña",
      edit: "Editar",
    },
    softWarning: "Estás cerca del límite de 10 operadores.",
    hardLimit: "Llegaste al límite de 10 operadores. Desactiva uno para crear otro.",
    loadError: "No pudimos cargar los operadores.",
    createForm: {
      title: "Nuevo operador",
      generatePassword: "Generar",
      copyPassword: "Copiar contraseña",
      copied: "Copiado.",
      shareHint:
        "Compártesela con tu operador. Tendrá que cambiarla en su primer login.",
      passwordHelp: "Mínimo 6 caracteres. Sin acentos ni caracteres especiales.",
      submit: "Crear operador",
      submitting: "Creando…",
      success: "Operador creado.",
      successHint:
        "Estos son los datos del operador. Guárdalos o compártelos ahora — no se mostrarán de nuevo.",
      done: "Listo",
    },
    editForm: {
      submit: "Guardar cambios",
      submitting: "Guardando…",
      success: "Operador actualizado.",
    },
    fields: {
      fullName: "Nombre completo",
      email: "Correo",
      phone: "Teléfono (opcional)",
      password: "Contraseña",
    },
    errors: {
      emailInvalid: "Correo inválido.",
      emailDuplicated: "Este correo ya está en uso.",
      passwordShort: "Mínimo 6 caracteres.",
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
      body: "Volverá a poder iniciar sesión con su contraseña actual.",
      confirm: "Sí, reactivar",
      success: "Operador reactivado.",
    },
    resetPwd: {
      title: (name: string) => `Resetear contraseña de ${name}`,
      body:
        "Generaremos una nueva contraseña temporal. Tendrá que cambiarla en su próximo inicio de sesión.",
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
      hero: "Conecta WhatsApp a Cuadra",
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
    keys: {
      expiry_reminder_pre: {
        title: "Recordatorio: 3 días antes de vencer",
        description:
          "Se envía 3 días antes del vencimiento de la membresía.",
      },
      expiry_reminder_day: {
        title: "Recordatorio: día de vencimiento",
        description: "Se envía el mismo día que vence la membresía.",
      },
      expiry_reminder_post: {
        title: "Recordatorio: 5 días después de vencer",
        description:
          "Último mensaje automático cuando el socio se atrasa.",
      },
      payment_receipt: {
        title: "Comprobante de pago",
        description: "Se envía cuando registras un cobro de membresía.",
      },
      birthday_greeting: {
        title: "Felicitación de cumpleaños",
        description: "Se envía el día del cumpleaños del socio.",
      },
      welcome_member: {
        title: "Bienvenida a socio nuevo",
        description: "Se envía al crear un socio nuevo con cobro.",
      },
      balance_reminder: {
        title: "Recordatorio de saldo pendiente",
        description: "Aviso a socios con saldo pendiente.",
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
      "Elige qué eventos te avisamos por WhatsApp. Por seguridad, las alertas críticas (logins sospechosos) no se pueden desactivar.",
    loadError: "No pudimos cargar las alertas.",
    saving: "Guardando…",
    saved: "Cambio guardado.",
    saveError: "No pudimos guardar.",
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
