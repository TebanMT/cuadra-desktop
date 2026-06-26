export const members = {
  page: {
    title: "Socios",
    new: "Nuevo socio",
    searchPlaceholder: "Buscar por nombre o teléfono…",
    filterStateLabel: "Estado",
    filterPlanLabel: "Plan",
    filterAllPlans: "Todos los planes",
    sortLabel: "Orden",
    sort: {
      nameAsc: "Nombre A–Z",
      nameDesc: "Nombre Z–A",
      expiryAsc: "Vencimiento ↑",
      expiryDesc: "Vencimiento ↓",
      newest: "Más recientes",
      oldest: "Más antiguos",
    },
    states: {
      all: "Todos",
      active: "Activos",
      expiringSoon: "Por vencer",
      // "Por cobrar" incluye vencidos clásicos y socios inscritos sin
      // primer pago (pending_payment). Para el operador es la misma
      // acción: cobrar.
      expired: "Por cobrar",
      inactive: "Inactivos",
    },
    columns: {
      photo: "Foto",
      name: "Nombre",
      plan: "Plan",
      expiry: "Vence",
      lastVisit: "Última visita",
      actions: "Acciones",
    },
    pagination: {
      pageSize: "Mostrar",
      showing: (from: number, to: number, total: number) =>
        `Mostrando ${from}-${to} de ${total}`,
      previous: "Anterior",
      next: "Siguiente",
      noResults: "Sin resultados",
      empty: "Aún no tienes socios. Da de alta el primero.",
    },
    rowActions: {
      pay: "Cobrar",
      checkin: "Check-in",
      more: "Más",
      noPlan: "Sin plan",
    },
    lastVisit: {
      never: "Nunca",
      today: "Hoy",
      yesterday: "Ayer",
      daysAgo: (n: number) => `Hace ${n} días`,
    },
  },
  detail: {
    folio: (folio: string) => `Folio ${folio}`,
    createdAt: (date: string) => `Alta ${date}`,
    membership: {
      title: "Membresía actual",
      none: "Este socio no tiene membresía activa.",
      pendingTitle: "Falta primer pago",
      pendingBody:
        "Este socio aún no ha pagado su inscripción. Cobra cualquier monto (parcial está bien) para activar la membresía.",
      pendingChargeCta: "Cobrar ahora",
      vigente: "Vigente",
      expiring: (days: number) => `Vence en ${days} ${days === 1 ? "día" : "días"}`,
      expired: (days: number) => `Vencida hace ${Math.abs(days)} ${Math.abs(days) === 1 ? "día" : "días"}`,
      due: "Vence",
      pay: "Cobrar renovación",
      payFirst: "Cobrar primer pago",
      lock: "Ajustar vigencia",
    },
    tabs: {
      payments: "Pagos",
      attendance: "Asistencia",
      notes: "Notas",
      paymentsEmpty: "Aún no hay pagos registrados.",
      attendanceEmpty: "Aún no hay asistencias registradas.",
      attendanceLoading: "Cargando asistencias…",
      attendanceError: "No pudimos cargar las asistencias.",
      attendanceOverride: "Permitido por operador",
      attendanceOperator: (name: string) => `Operador: ${name}`,
      attendanceMethod: {
        fingerprint: "Huella",
        // ADR-010: el método "number" en BD se muestra como "Número".
        number: "Número",
        manual: "Manual",
      },
      attendanceResult: {
        allowed_active: "Acceso permitido",
        allowed_expiring_soon: "Acceso permitido — por vencer",
        allowed_override: "Acceso permitido por operador",
        denied_expired: "Acceso denegado — membresía vencida",
        denied_inactive: "Acceso denegado — socio inactivo",
        denied_no_membership: "Acceso denegado — sin membresía",
        denied_unpaid_enrollment: "Acceso denegado — inscripción pendiente",
      } as Record<string, string>,
      notesEmpty: "Sin notas.",
    },
    actions: {
      checkin: "Check-in",
      edit: "Editar",
      markInactive: "Marcar inactivo",
      markActive: "Reactivar",
      assignNumber: "Asignar número de socio",
      changeNumber: "Cambiar número de socio",
    },
    shortcuts: {
      title: "Atajos",
      pay: "P → cobrar",
      checkin: "C → check-in",
      edit: "E → editar",
      close: "Esc → cerrar",
    },
  },
  form: {
    titleNew: "Nuevo socio",
    titleEdit: "Editar socio",
    matches: {
      header: (n: number) =>
        n === 1 ? "Tal vez ya está registrado:" : "Tal vez ya están registrados:",
      hint: "Si es uno de estos, ábrelo en vez de crearlo otra vez.",
      open: "Abrir perfil",
      dismiss: "Ocultar sugerencias",
      createNew: (name: string) => `Crear nuevo socio: "${name}"`,
      status: {
        active: "Activo",
        expiringSoon: "Por vencer",
        expired: "Vencido",
        pendingPayment: "Sin primer pago",
        inactive: "Inactivo",
        noPlan: "Sin plan",
      },
    },
    sections: {
      basics: "Datos básicos",
      basicsHint:
        "Sólo necesitamos nombre y teléfono — lo demás es opcional.",
      membership: "Membresía",
    },
    fields: {
      name: "Nombre completo",
      phone: "Teléfono",
      email: "Email",
      birthdate: "Fecha de nacimiento",
      photo: "Foto",
      notes: "Notas",
      type: "Tipo",
      startDate: "Fecha de inicio",
      paymentMethod: "Método de pago",
    },
    addEmail: "+ Agregar email",
    addBirthdate: "+ Agregar fecha de nacimiento",
    addPhoto: "+ Agregar foto",
    addNotes: "+ Agregar notas",
    addGender: "+ Agregar género",
    gender: {
      label: "Género",
      hint: "Opcional. Lo usamos sólo para reportes.",
      options: {
        hombre: "Hombre",
        mujer: "Mujer",
        no_especificado: "Prefiero no decir",
      },
    },
    chooseFile: "Subir archivo",
    takePhoto: "Tomar foto",
    removePhoto: "Quitar foto",
    // Inverso al botón "+ Agregar X" — esconde la sección y limpia el
    // valor. Misma copia para email/birthdate/notes para mantener
    // consistencia.
    removeOptional: "Quitar",
    expiryPreview: (date: string) => `Vencerá: ${date}`,
    chargeFirstPayment: "Cobrar primer pago ahora",
    chargeAmount: (amount: string) => `Monto: ${amount}`,
    chargeBreakdown: "Desglose del cobro",
    chargeEnrollment: "Inscripción",
    chargeMaintenance: "Mantenimiento",
    chargeTotal: "Total",
    methods: {
      cash: "Efectivo",
      transfer: "Transferencia",
      card: "Tarjeta",
    },
    submitNew: "Inscribir socio",
    submitEdit: "Guardar cambios",
    cancel: "Cancelar",
    duplicate: {
      title: "Ya existe un socio con este teléfono",
      bodyPrefix: "Encontramos a ",
      seeExisting: "Ver socio existente",
      createAnyway: "Crear de todos modos",
    },
    success: {
      created: (name: string, expiry: string) => `${name} agregado. Vence ${expiry}.`,
      updated: "Cambios guardados.",
    },
    errors: {
      nameRequired: "Falta el nombre.",
      nameLength: "El nombre debe tener entre 3 y 100 caracteres.",
      phoneRequired: "Necesito 10 dígitos (sin espacios ni guiones).",
      phoneInvalid: "Necesito 10 dígitos (sin espacios ni guiones).",
      emailInvalid: "Email no válido.",
      typeRequired: "Selecciona el tipo de membresía.",
      startDateInvalid: "La fecha de inicio no puede ser tan lejana.",
      photoTooBig: "La foto no debe pasar de 2 MB.",
      photoFormat: "Sube una imagen JPG, PNG o WEBP.",
      methodRequired: "Selecciona el método de pago.",
      generic: "No pudimos guardar. Vuelve a intentar.",
    },
  },
  status: {
    title: "Cambiar estado",
    label: "Estado",
    reasonLabel: "Razón (opcional, queda en historial)",
    reasonPlaceholder: "Ej. Se mudó, se dio de baja, …",
    options: {
      active: "Activo",
      inactive: "Inactivo",
    },
    submit: "Guardar cambio",
    success: "Estado actualizado.",
  },
  lockExpiry: {
    title: "Ajustar vigencia",
    currentExpiry: (date: string) => `Vence actualmente: ${date}`,
    question: "¿Qué quieres hacer?",
    modes: {
      extend: "Extender vigencia",
      set: "Establecer fecha",
      reset: "Quitar ajustes manuales (volver al cálculo automático)",
    },
    daysSuffix: "días → nuevo vencimiento:",
    reasonLabel: "Razón (queda en historial)",
    reasonPlaceholder: "Ej. Cortesía COVID; freeze viaje 30d; compensación cobro doble del 14 abr",
    reasonRequired: "Escribe una razón (mínimo 5 caracteres).",
    daysRequired: "Indica cuántos días.",
    dateRequired: "Selecciona una fecha.",
    submit: "Guardar ajuste",
    cancel: "Cancelar",
    success: (date: string) => `Vigencia actualizada. Nueva fecha: ${date}.`,
    ownerOnly: "Solo el dueño del gym puede ajustar vigencias.",
  },
  // ADR-010: el antiguo "PIN del socio" es ahora el NÚMERO DE SOCIO —
  // identificador público, entero, único 1:1 por gym, que también sirve de
  // credencial de check-in. Accesor t.memberNumber.*.
  memberNumber: {
    title: "Número de socio",
    titleChange: "Cambiar número de socio",
    description:
      "Tinta le asignó un número de socio al inscribirlo. Puedes generar uno nuevo si se compartió por error — se reenvía automáticamente por WhatsApp.",
    generating: "Generando número…",
    label: (name: string) => `Número de ${name}`,
    copy: "Copiar",
    copied: "Número copiado al portapapeles.",
    done: "Listo",
    regenerate: "Generar nuevo número",
    disclaimer:
      "Siempre puedes consultar el número desde el perfil del socio.",
    success: "Número de socio actualizado.",
    triggerChange: "Cambiar número",
    profileLabel: "Número de socio",
    profileHint: "Compártelo cuando el socio lo olvide.",
    profileCopy: "Copiar",
    profileNone: "Sin número asignado.",
    profileAssign: "Asignar número de socio",
    // Copy del strip post-creación / modal de cambio. Cuando WhatsApp
    // está conectado y el socio tiene teléfono, mostramos a quién se
    // mandó; en cualquier otro caso, instrucción de copiarlo a mano.
    sentToWhatsApp: (phone: string) => `Enviado por WhatsApp a ${phone}.`,
    notSent: "Escríbelo en la credencial.",
    notSentNoWhatsApp: "Conecta WhatsApp en Configuración para enviarlo automáticamente.",
    notSentNoPhone: "El socio no tiene teléfono — escríbelo en la credencial.",
  },
  types: {
    pageTitle: "Membresías",
    pageSubtitle: "Crea, edita o desactiva los planes que ofreces.",
    addNew: "Agregar membresía",
    // Configuración a nivel gym (no por plan): si el dueño cobra cuota
    // de inscripción / mantenimiento al socio, lo dice acá. Cada plan
    // sólo define el MONTO (puede ser $0 para plan-de-paso, etc.).
    gymSettingsTitle: "Cobros del gym",
    gymSettingsHint:
      "Activa lo que tu gym cobra. Cada membresía define después el monto.",
    chargeEnrollment: "Cobrar inscripción",
    chargeEnrollmentHint: "Pago único cuando un socio nuevo se inscribe.",
    chargeMaintenance: "Cobrar mantenimiento",
    chargeMaintenanceHint: "Cuota recurrente además de la membresía.",
    maintenanceFrequency: "Frecuencia",
    // Orden = cada cuánto se cobra, de más frecuente a menos.
    freqMonthly: "Mensual",
    freqBimonthly: "Bimestral",
    freqQuarterly: "Trimestral",
    freqSemiannual: "Semestral",
    freqAnnual: "Anual",
    columns: {
      name: "Nombre",
      price: "Precio",
      duration: "Duración",
      active: "Activos",
      status: "Estado",
      actions: "Acciones",
    },
    durationDays: (n: number) => `${n} ${n === 1 ? "día" : "días"}`,
    // durationLabel: renderea el período según la unidad del plan. Si
    // duration_months viene, mostramos "1 mes" / "6 meses" / "1 año";
    // si no, caemos al display por días.
    durationLabel: (days: number, months?: number | null) => {
      if (months != null && months > 0) {
        if (months === 12) return "1 año";
        return `${months} ${months === 1 ? "mes" : "meses"}`;
      }
      return `${days} ${days === 1 ? "día" : "días"}`;
    },
    activeMembers: (n: number) => `${n}`,
    statusActive: "Activa",
    statusInactive: "Desactivada",
    edit: "Editar",
    deactivate: "Desactivar",
    deactivateConfirm: {
      title: (name: string) => `¿Desactivar "${name}"?`,
      body: "Tus socios actuales con este plan no se verán afectados, pero ya no podrás dar de alta socios nuevos con él.",
      confirm: "Desactivar",
    },
    form: {
      titleNew: "Nueva membresía",
      titleEdit: "Editar membresía",
      name: "Nombre",
      price: "Precio",
      durationDays: "Duración",
      // Opciones predefinidas para el select de duración. Cubren el
      // 99% de los planes de gimnasios mexicanos (paso, semanal,
      // quincenal, mensual, bimestral, trimestral, semestral, anual).
      // "Personalizada" abre un input numérico para casos exóticos.
      durationOptions: [
        { days: 1, label: "1 día (paso)" },
        { days: 7, label: "1 semana" },
        { days: 15, label: "15 días (quincenal)" },
        { days: 30, label: "30 días (mensual)" },
        { days: 60, label: "60 días (bimestral)" },
        { days: 90, label: "90 días (trimestral)" },
        { days: 180, label: "180 días (semestral)" },
        { days: 365, label: "365 días (anual)" },
      ] as const,
      durationCustom: "Personalizada…",
      durationCustomLabel: "Cantidad de días",
      // Fields reintroducidos como condicionales — visibles sólo cuando
      // el dueño habilita la feature desde el toggle a nivel página
      // (ver MembershipTypes.tsx). La decisión de cobrar inscripción/
      // mantenimiento es de gym, no por plan; lo que varía por plan es
      // el monto.
      enrollmentAmount: "Monto de inscripción",
      maintenanceAmount: "Monto de mantenimiento",
      submitNew: "Crear membresía",
      submitEdit: "Guardar cambios",
      cancel: "Cancelar",
      changesNotApplied:
        "Los cambios de precio o duración no afectan a socios actuales — solo a renovaciones futuras.",
      errors: {
        nameRequired: "Falta el nombre.",
        nameLength: "El nombre debe tener entre 3 y 100 caracteres.",
        priceRequired: "El precio debe ser mayor a cero.",
        durationRequired: "Elige una duración.",
        durationCustomInvalid: "La duración personalizada debe ser al menos 1 día.",
        generic: "No pudimos guardar. Vuelve a intentar.",
      },
      success: {
        created: "Membresía creada.",
        updated: "Cambios guardados.",
        deactivated: "Membresía desactivada.",
      },
    },
  },
  errors: {
    loadList: "No pudimos cargar la lista de socios.",
    loadDetail: "No pudimos cargar este socio.",
    loadTypes: "No pudimos cargar las membresías.",
  },
  import: {
    title: "Importar socios desde Excel",
    subtitle:
      "Sube tu libreta exportada como CSV y damos de alta a todos en un click.",
    backToList: "Volver a socios",
    steps: {
      one: "1. Sube tu archivo",
      two: "2. Revisa la vista previa",
      three: "3. Listo",
    },
    step1: {
      dropZone: "Arrastra tu archivo aquí o haz clic para elegirlo",
      hint: "Acepta archivos .csv exportados de Excel o Google Sheets (hasta 5 MB).",
      changeFile: "Cambiar archivo",
      downloadTemplate: "Descargar plantilla",
      templateHint:
        "La plantilla ya trae los nombres de las columnas y un par de filas de ejemplo.",
      structure: {
        title: "Cómo debe verse tu archivo",
        intro:
          "La primera fila son los nombres de las columnas. Estas son las 5 obligatorias para los socios y 3 opcionales para asignarles membresía:",
        required: "Obligatorias:",
        optional: "Opcionales (membresía actual):",
        rules: {
          phone: "Teléfono: 10 dígitos sin espacios ni guiones.",
          dates: "Fechas: en formato AAAA-MM-DD (por ejemplo 1990-03-15).",
          membership:
            "Si llenas las 3 columnas de membresía, te traes al socio con su plan ya al día. Si las dejas vacías, lo cobras después.",
          plan:
            "El nombre del plan tiene que existir en Configuración antes de importar.",
        },
      },
      continue: "Continuar",
    },
    step2: {
      heading: (n: number) =>
        n === 1 ? "1 socio para importar" : `${n} socios para importar`,
      previewTitle: "Vista previa (primeras 20 filas)",
      noPreview: "Tu archivo no trae filas de datos.",
      duplicatesTitle: (n: number) =>
        n === 1
          ? "1 teléfono ya está en tu base"
          : `${n} teléfonos ya están en tu base`,
      duplicatesHint:
        "Por defecto los saltamos para no duplicar a tus socios. Si quieres importarlos igual, prende el toggle.",
      allowDuplicates: "Importarlos igual (permitir teléfonos repetidos)",
      back: "Atrás",
      cta: (n: number) =>
        n === 1 ? "Importar 1 socio" : `Importar ${n} socios`,
      ctaLoading: "Importando…",
      cols: {
        row: "Fila",
        name: "Nombre",
        phone: "Teléfono",
        plan: "Plan",
        flag: "Aviso",
      },
      flags: {
        duplicateInBase: "Ya existe",
        duplicateInFile: "Repetido en archivo",
      },
    },
    step3: {
      headingOk: "Listo, importamos a tus socios.",
      headingPartial: "Importación terminada con algunos avisos.",
      headingFail: "No pudimos importar nada.",
      summaryImported: (n: number) =>
        n === 1 ? "1 socio agregado" : `${n} socios agregados`,
      summarySkipped: (n: number) =>
        n === 1 ? "1 fila saltada" : `${n} filas saltadas`,
      summaryErrors: (n: number) =>
        n === 1 ? "1 fila con error" : `${n} filas con error`,
      skippedTitle: "Filas que saltamos",
      errorsTitle: "Filas que no pudimos procesar",
      errorsHint:
        "Corrige tu Excel, vuelve a guardarlo como CSV y súbelo otra vez — los que ya entraron no se duplican porque los detectamos por teléfono.",
      importMore: "Importar otro archivo",
      goToList: "Ir a la lista de socios",
    },
    errors: {
      fileTooLarge: "El archivo pesa más de 5 MB. Achícalo o pide ayuda.",
      notCSV: "Sube un archivo .csv exportado de Excel.",
      generic: "No pudimos procesar el archivo. Revisa el formato y vuelve a intentar.",
      networkRetry: "Falló la subida. Vuelve a intentar.",
    },
    cta: {
      importFromExcel: "Importar desde Excel",
    },
  },
};
