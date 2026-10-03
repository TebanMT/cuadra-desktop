export const expenses = {
  page: {
    title: "Gastos",
    subtitle: "Consulta tus movimientos y los pagos pendientes.",
    new: "Registrar gasto",
    searchPlaceholder: "Concepto, proveedor o referencia…",
    filters: {
      categoryLabel: "Categoría",
      categoryAll: "Todas",
      methodLabel: "Método",
      methodAll: "Todos",
      fromLabel: "Desde",
      toLabel: "Hasta",
    },
    columns: {
      date: "Fecha de pago",
      category: "Categoría",
      description: "Concepto",
      method: "Método",
      amount: "Monto",
      actions: "Acciones",
    },
    empty: "Sin gastos registrados.",
    noResults: "No encontramos gastos con esos filtros.",
    rowEdit: "Editar",
    rowDelete: "Eliminar",
    deleteConfirm: {
      title: "¿Eliminar este gasto?",
      body: "Se borrará del listado y de los reportes. Esta acción no se puede deshacer.",
      confirm: "Eliminar",
    },
    stats: {
      total: "Total del período",
      cashVsNonCash: "Efectivo vs no efectivo",
      dominant: "Categoría principal",
      cashLabel: (v: string) => `${v} efectivo`,
      nonCashLabel: (v: string) => `${v} no efectivo`,
      noneDominant: "—",
    },
  },
  form: {
    titleNew: "Registrar gasto",
    titleEdit: "Editar gasto",
    fields: {
      date: "Fecha de pago",
      amount: "Monto",
      category: "Categoría",
      paymentMethod: "Método de pago",
      description: "Concepto",
    },
    descriptionPlaceholder: "Ej. Recibo CFE bimestral",
    descriptionHint: "Opcional. Máx. 200 caracteres.",
    submit: "Registrar gasto",
    cancel: "Cancelar",
    success: {
      created: "Gasto registrado.",
      updated: "Cambios guardados.",
      deleted: "Gasto eliminado.",
    },
    errors: {
      dateRequired: "Falta la fecha.",
      amountInvalid: "El monto debe ser mayor a cero.",
      categoryRequired: "Selecciona una categoría.",
      paymentRequired: "Selecciona el método de pago.",
      descriptionTooLong: "La descripción no debe pasar de 200 caracteres.",
      generic: "No se pudo guardar el gasto. Intenta de nuevo.",
    },
  },
  categories: {
    renta: "Renta",
    servicios: "Servicios",
    mantenimiento: "Mantenimiento",
    nomina: "Nómina",
    marketing: "Publicidad y promoción",
    insumos_no_inventariables: "Materiales de uso interno",
    impuestos_y_permisos: "Impuestos y permisos",
    otros: "Otros",
  },
  methods: {
    cash: "Efectivo",
    transfer: "Transferencia",
    card: "Tarjeta",
  },
  errors: {
    loadList: "No pudimos cargar los gastos.",
  },
};

export const EXPENSE_CATEGORIES = [
  "renta",
  "servicios",
  "mantenimiento",
  "nomina",
  "marketing",
  "insumos_no_inventariables",
  "impuestos_y_permisos",
  "otros",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_PAYMENT_METHODS = ["cash", "transfer", "card"] as const;

export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];
