// Helpers compartidos para la página de Atención y el badge de la
// campanita del TopBar. La lógica de "qué cuenta" tiene que estar en un
// solo lugar para que el número del badge coincida exactamente con lo
// que el operador ve al abrir la página — antes la campanita sumaba
// expired + expiring + balance + low_stock, lo cual duplicaba a socios
// con múltiples issues (un socio vencido CON saldo se contaba dos
// veces). La página, en cambio, deduplica por member_id.

import type { AttentionData } from "@/hooks/useReports";

// countAttentionItems devuelve el número de FILAS que la página renderea:
// socios distintos (con cualquier issue) + productos con stock bajo.
// Coincide 1:1 con lo que se ve al entrar en /attention-required.
export function countAttentionItems(data: AttentionData | undefined): number {
  if (!data) return 0;
  const socios = new Set<string>();
  for (const m of data.expired_recoverable) socios.add(m.member_id);
  for (const m of data.expiring_soon) socios.add(m.member_id);
  for (const b of data.pending_balance) socios.add(b.member_id);
  return socios.size + data.low_stock.length;
}
