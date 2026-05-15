export const expenses = {
  page: {
    title: "Gastos",
    subtitle: "Egresos generales del gimnasio",
    new: "Nuevo gasto",
    searchPlaceholder: "Buscar en descripción…",
    filters: {
      categoryLabel: "Categoría",
      categoryAll: "Todas",
      methodLabel: "Método",
      methodAll: "Todos",
      fromLabel: "Desde",
      toLabel: "Hasta",
    },
    columns: {
      date: "Fecha",
      category: "Categoría",
      description: "Descripción",
      method: "Método",
      amount: "Monto",
      actions: "Acciones",
    },
    empty: "Aún no registras gastos. Empieza con uno.",
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
    titleNew: "Nuevo gasto",
    titleEdit: "Editar gasto",
    fields: {
      date: "Fecha",
      amount: "Monto",
      category: "Categoría",
      paymentMethod: "Método de pago",
      description: "Descripción",
    },
    descriptionPlaceholder: "Ej. Recibo CFE bimestral",
    descriptionHint: "Opcional. Máx. 200 caracteres.",
    submit: "Guardar",
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
      generic: "No pudimos guardar. Vuelve a intentar.",
    },
  },
  categories: {
    renta: "Renta",
    servicios: "Servicios",
    mantenimiento: "Mantenimiento",
    sueldos: "Sueldos",
    marketing: "Marketing",
    mercaderia_externa: "Mercadería externa",
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
  "sueldos",
  "marketing",
  "mercaderia_externa",
  "otros",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_PAYMENT_METHODS = ["cash", "transfer", "card"] as const;

export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];
