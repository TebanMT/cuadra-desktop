const entities: Record<string, string> = {
  members: "Socios", memberships: "Membresías", membership_types: "Tipos de membresía",
  payments: "Cobros", sales: "Ventas", products: "Productos", stock_movements: "Existencias",
  users: "Operadores", gyms: "Gimnasio", checkins: "Asistencias", promotions: "Promociones",
  expenses: "Gastos", expense_templates: "Pagos que se repiten", expense_occurrences: "Pagos programados",
  cash_movements: "Movimientos de caja", cash_sessions: "Cortes de caja", cash_drawers: "Cajas",
  inventory_purchases: "Compras", member_fingerprints: "Huellas", notification_templates: "Mensajes",
};
const actions: Record<string, string> = {
  create: "Registro creado", update: "Datos actualizados", delete: "Registro eliminado",
  login: "Inicio de sesión", login_pin: "Inicio de sesión con PIN", logout: "Cierre de sesión",
  password_reset: "Contraseña restablecida", password_reset_requested: "Recuperación de contraseña solicitada",
  admin_password_reset: "Contraseña temporal creada", transfer_ownership: "Dueño cambiado",
  "transfer_ownership:requested": "Cambio de dueño solicitado", toggle_active: "Estado de acceso cambiado",
  assign_pin: "PIN asignado", clear_pin: "PIN eliminado", rotate_operator_pin: "PIN cambiado",
  email_verify_requested: "Verificación de correo solicitada", email_verified: "Correo verificado",
  mark_lost: "Socio dado de baja", classify_as_inventory_purchase: "Salida clasificada como compra",
  classify_as_expense: "Salida clasificada como gasto", classify_non_operating: "Entrega de dinero clasificada",
  correct: "Registro corregido", annul: "Registro anulado", reopen: "Pago devuelto a pendiente",
  skip: "Pago omitido", resolve: "Pago registrado",
};
export function auditEntityLabel(code: string): string {
  return entities[code] ?? entities[`${code}s`] ?? "Otro registro";
}
export function auditActionLabel(code: string): string {
  return actions[code] ?? "Cambio registrado";
}
