export const shell = {
  nav: {
    dashboard: "Inicio",
    members: "Socios",
    billing: "Ingresos",
    sales: "Venta rápida",
    products: "Productos",
    expenses: "Gastos",
    membershipTypes: "Membresías y promociones",
    checkin: "Entradas",
    reports: "Reportes",
    cashClose: "Caja",
    settings: "Ajustes",
  },
  navGroups: {
    operation: "Operación",
    catalog: "Catálogo",
    reports: "Reportes",
    settings: "Ajustes",
  },
  user: {
    logout: "Cerrar sesión",
    profile: "Mi perfil",
  },
  theme: {
    toggle: "Cambiar tema",
    light: "Modo claro",
    dark: "Modo noche",
    system: "Seguir al sistema",
  },
  sync: {
    online: "Sincronizado",
    syncing: "Sincronizando…",
    // Offline NO es error (offline-first): copy que tranquiliza, no que
    // alarma. El hint del diálogo explica que se sube solo al volver.
    offline: "Sin conexión",
    offlineHint:
      "Puedes seguir trabajando. Los cambios se guardan en esta computadora y se sincronizarán cuando vuelva la conexión.",
    offlineLong: "Llevas días sin sincronizar.",
    offlineLongHint:
      "Hace más de una semana que no se sincroniza. Revisa la conexión; los cambios recientes aún no aparecen en la web.",
    stale: "Actualiza la app para seguir sincronizando.",
    syncError: "Hay cambios sin sincronizar.",
    syncErrorPushHint:
      "Algunos cambios no se pudieron enviar. Revisa los registros de abajo. Si el problema continúa, comparte el detalle con soporte.",
    syncErrorHint:
      "No se pudieron recibir algunos cambios. Actualiza Tinta. Si el problema continúa, comparte el detalle con soporte.",
    authInvalid: "Vuelve a iniciar sesión para sincronizar.",
    authInvalidHint:
      "Inicia sesión de nuevo para sincronizar los cambios guardados en esta computadora.",
    detailsTitle: "Estado de sincronización",
    lastSync: "Última sincronización",
    pending: "Cambios pendientes",
    quarantined: "Cambios que no se pudieron aplicar",
    stuckPush: "Cambios que no han podido subir",
    lastError: "Último error",
    never: "Nunca",
    none: "Ninguno",
    triggerNow: "Sincronizar ahora",
    relogin: "Iniciar sesión",
    // Detalle de filas rechazadas por la nube (queue_stuck_items).
    stuckItemsTitle: "Cambios por revisar",
    openToRename: "Abrir para renombrar",
    stuckRetryCount: (n: number) => `${n} intentos`,
    // Nombres humanos por entity_type para la lista de rechazados. Los
    // tipos sin entrada muestran el entity_type crudo (mejor feo que
    // invisible — soporte lo necesita).
    entityNames: {
      membership_types: "Plan",
      products: "Producto",
      promotions: "Promoción",
      members: "Socio",
      memberships: "Membresía",
      payments: "Pago",
      users: "Usuario",
      notification_templates: "Plantilla",
    } as Record<string, string>,
  },
};
