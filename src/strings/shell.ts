export const shell = {
  nav: {
    dashboard: "Inicio",
    attention: "Atención",
    members: "Socios",
    billing: "Cobros",
    sales: "Venta rápida",
    products: "Productos",
    expenses: "Gastos",
    membershipTypes: "Membresías y promociones",
    checkin: "Check-in",
    challenges: "Retos",
    reports: "Reportes",
    settings: "Ajustes",
  },
  navGroups: {
    operation: "Operación",
    catalog: "Catálogo",
    programs: "Programas",
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
    offline: "Sin conexión — todo se guarda aquí.",
    offlineHint:
      "No hay conexión con la nube en este momento. Puedes seguir cobrando y registrando normal: todo queda guardado en esta computadora y se sube solo cuando regrese el internet.",
    offlineLong: "Llevas días sin sincronizar.",
    offlineLongHint:
      "Esta computadora tiene más de una semana sin subir sus cambios. La operación local sigue funcionando, pero revisa el internet — el dashboard del celular no verá lo nuevo hasta sincronizar.",
    stale: "Actualiza la app para seguir sincronizando.",
    syncError: "Hay un problema al guardar cambios del servidor.",
    syncErrorPushHint:
      "Sí hay internet, pero la nube está rechazando uno o más cambios hechos en esta computadora. Nada se pierde — abajo está el detalle de cada uno. Si marca un nombre duplicado, renómbralo para destrabarlo; si no, comparte el error con soporte.",
    syncErrorHint:
      "Sí hay internet: el servidor respondió, pero un cambio no se pudo guardar en esta laptop. Suele arreglarse actualizando la app. Si sigue, comparte el 'Último error' con soporte.",
    authInvalid: "Vuelve a iniciar sesión para sincronizar.",
    authInvalidHint:
      "La credencial de esta laptop expiró. Tus cambios siguen guardados; vuelve a iniciar sesión para reanudar el sync.",
    detailsTitle: "Estado de sincronización",
    lastSync: "Último sync exitoso",
    pending: "Cambios pendientes",
    quarantined: "Cambios que no se pudieron aplicar",
    stuckPush: "Cambios que no han podido subir",
    lastError: "Último error",
    never: "Nunca",
    none: "Ninguno",
    triggerNow: "Sincronizar ahora",
    relogin: "Iniciar sesión",
    // Detalle de filas rechazadas por la nube (queue_stuck_items).
    stuckItemsTitle: "Cambios rechazados por la nube",
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
