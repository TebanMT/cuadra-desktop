export const sales = {
  page: {
    title: "Venta rápida",
    associate: "Asociar a socio",
    associated: (name: string) => `Socio: ${name}`,
    removeAssociation: "Quitar",
    associateSearchPlaceholder: "Buscar por nombre o teléfono…",
    associateNoResults: "Sin resultados",
    close: "Cerrar",
    backToDashboard: "Cerrar",
    empty: "Aún no hay productos para vender.",
    emptyHint: "Agrega productos en la sección de Productos.",
    cart: {
      title: "Carrito",
      clear: "Limpiar",
      empty: "Empieza haciendo clic en un producto.",
      total: "Total",
      methodLabel: "Método",
      methods: {
        cash: "Efectivo",
        transfer: "Transferencia",
        card: "Tarjeta",
      },
      submit: (amount: string) => `Cobrar ${amount}`,
      remove: "Quitar",
      qtyLabel: "Cantidad",
    },
    badges: {
      out: "0✕",
      low: (n: number) => `${n}⚠`,
      stock: (n: number) => String(n),
    },
    tooltips: {
      out: "Sin stock",
      low: "Stock bajo",
      rightClick: "Click derecho para cantidad personalizada",
    },
    quantityModal: {
      title: (name: string) => `Cantidad — ${name}`,
      label: "¿Cuántos vas a vender?",
      stockLabel: (n: number) => `Stock disponible: ${n}`,
      tooMuch: (avail: number) => `Solo hay ${avail} disponibles.`,
      submit: "Agregar",
      cancel: "Cancelar",
    },
    success: {
      online: (amount: string) => `${amount} cobrados.`,
      offline: "Guardado. Se sincronizará cuando vuelva la conexión.",
    },
    errors: {
      cartEmpty: "Agrega al menos un producto al carrito.",
      methodRequired: "Selecciona el método de pago.",
      stockInsufficient: (name: string, avail: number) =>
        `Solo hay ${avail} de ${name}. Ajusta cantidad.`,
      generic: "No pudimos registrar la venta.",
    },
    offline: "Sin conexión: la venta se guarda localmente y se sincroniza después.",
    keyboard: {
      hint: "Tip: escribe la primera letra del producto + Enter para agregar.",
    },
  },
};
