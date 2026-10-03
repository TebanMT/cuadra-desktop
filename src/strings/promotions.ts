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
    "Ejemplo: 25% de descuento en una membresía de $400; el socio paga $300.",
  fixed_amount:
    "Resta un monto al cobro, sin superar su total.",
  free_enrollment:
    "Elimina la cuota de inscripción, cuando el cobro la incluye.",
  extra_days:
    "Agrega días a la vigencia de la membresía.",
  companion_memberships:
    "Al pagar una membresía, elige qué socios reciben las membresías de regalo.",
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
    empty: "Aún no hay promociones.",
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
      "El código se usa al cobrar. No distingue mayúsculas.",
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
      "Dejará de estar disponible al cobrar. Los cobros anteriores no cambian.",
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
        ? "Elige quién recibe la membresía de regalo."
        : `Elige a ${n} socios para las membresías de regalo.`,
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
