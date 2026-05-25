// Tinta — strings del módulo de Promociones (catálogo + aplicación
// en cobros). Tuteo mexicano: "tienes/quieres/déjame". Mantener
// alineado con el dominio del BE (src/modules/promotions/domain/promotion).

export type PromotionKind =
  | "percent"
  | "fixed_amount"
  | "free_enrollment"
  | "extra_days"
  | "companion_memberships";

export type PromotionAppliesTo = "membership" | "sale" | "any";

export const promotionKindLabels: Record<PromotionKind, string> = {
  percent: "Porcentaje (%)",
  fixed_amount: "Descuento fijo ($)",
  free_enrollment: "Inscripción gratis",
  extra_days: "Días de regalo",
  companion_memberships: "2x1 — membresía de regalo",
};

export const promotionKindHints: Record<PromotionKind, string> = {
  percent:
    "Descuento porcentual sobre el subtotal del cobro. Ejemplo: 25% en mensualidad → si la mensualidad cuesta $400, paga $300.",
  fixed_amount:
    "Descuento de monto fijo. Ejemplo: $100 menos en cualquier cobro. Si el subtotal es menor, se ajusta al subtotal.",
  free_enrollment:
    "Quita la cuota de inscripción del cobro. Solo aplica cuando el cobro está cobrando inscripción.",
  extra_days:
    "Agrega N días al vencimiento de la membresía. Ejemplo: +15 días al renovar.",
  companion_memberships:
    "El socio principal paga su membresía y se regalan M membresías $0 a otros socios. Tú eliges a quién en el cobro.",
};

export const appliesToLabels: Record<PromotionAppliesTo, string> = {
  membership: "Membresías",
  sale: "Productos",
  any: "Cualquier cobro",
};

export const promotions = {
  page: {
    title: "Promociones",
    subtitle:
      "Crea descuentos, cupones, 2x1 y días de regalo. Aplícalas al cobrar.",
    addNew: "Nueva promoción",
    showInactive: "Mostrar inactivas",
    empty: "Aún no tienes promociones. Crea la primera.",
  },
  status: {
    active: "Vigente",
    future: "Programada",
    expired: "Expirada",
    inactive: "Desactivada",
  },
  columns: {
    name: "Nombre",
    kind: "Tipo",
    value: "Valor",
    appliesTo: "Aplica a",
    code: "Código",
    validity: "Vigencia",
    uses: "Usos",
    status: "Estado",
    actions: "",
  },
  form: {
    titleNew: "Nueva promoción",
    titleEdit: "Editar promoción",
    name: "Nombre",
    namePlaceholder: "Verano 2026",
    description: "Descripción (opcional)",
    descriptionPlaceholder: "Lo que verá tu equipo cuando elijan la promo al cobrar",
    kind: "Tipo de promoción",
    appliesTo: "¿Aplica a qué cobros?",
    valuePercent: "Porcentaje de descuento (0–100)",
    valueFixed: "Monto del descuento (MXN)",
    valueExtraDays: "Días extra al vencimiento",
    companionCount: "Cantidad de membresías de regalo",
    code: "Código de cupón (opcional)",
    codePlaceholder: "VERANO2026",
    codeHint:
      "Si pones código, el operador puede teclearlo al cobrar. Se compara sin distinguir mayúsculas.",
    validFrom: "Válida desde (opcional)",
    validUntil: "Válida hasta (opcional)",
    maxUsesTotal: "Tope total de usos (opcional)",
    maxUsesPerMember: "Tope por socio (opcional)",
    save: "Guardar",
    cancel: "Cancelar",
    success: {
      created: "Promoción creada",
      updated: "Promoción actualizada",
      deactivated: "Promoción desactivada",
      reactivated: "Promoción reactivada",
    },
    errors: {
      generic: "No pudimos guardar. Revisa los datos e intenta de nuevo.",
      duplicateCode: "Ya tienes una promoción con ese código.",
    },
  },
  deactivateConfirm: {
    title: (name: string) => `¿Desactivar "${name}"?`,
    body:
      "No podrás aplicarla a nuevos cobros, pero los cobros viejos siguen igual. La puedes reactivar cuando quieras.",
    confirm: "Desactivar",
  },
  picker: {
    title: "Aplicar promoción",
    chooseFromList: "Elige de la lista",
    enterCode: "O usa un código",
    codePlaceholder: "Escribe el código…",
    apply: "Aplicar",
    remove: "Quitar promoción",
    none: "No hay promociones vigentes ahora mismo.",
    notFound: "No encontramos esa promoción.",
    summary: (name: string) => `Promoción aplicada: ${name}`,
    discountPreview: (amount: string) => `Descuento: -${amount}`,
    extraDaysPreview: (days: number) =>
      days === 1 ? "+1 día al vencimiento" : `+${days} días al vencimiento`,
    companionPreview: (n: number) =>
      n === 1 ? "1 membresía de regalo" : `${n} membresías de regalo`,
  },
  companion: {
    title: "¿A quién le regalas?",
    subtitle: (n: number) =>
      n === 1
        ? "Elige al socio que recibe la membresía $0."
        : `Elige a ${n} socios que reciben membresía $0.`,
    searchPlaceholder: "Busca por nombre o teléfono…",
    confirm: "Confirmar",
    cancel: "Cancelar",
    slotPlaceholder: (idx: number) => `Socio ${idx + 1}`,
    needMore: (have: number, want: number) =>
      `Te faltan ${want - have} ${want - have === 1 ? "socio" : "socios"}`,
  },
};

// Formato corto del valor según el kind, para tablas y badges.
export function formatPromotionValue(
  kind: PromotionKind,
  value: number | null | undefined,
  companionCount: number | null | undefined,
): string {
  switch (kind) {
    case "percent":
      return value != null ? `${value}%` : "—";
    case "fixed_amount":
      return value != null ? `$${value.toFixed(2)}` : "—";
    case "extra_days":
      return value != null ? `+${value} ${value === 1 ? "día" : "días"}` : "—";
    case "free_enrollment":
      return "Inscripción gratis";
    case "companion_memberships":
      return companionCount != null
        ? `2×${1 + companionCount}`
        : "2x1";
  }
}
