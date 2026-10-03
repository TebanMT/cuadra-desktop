import { useAuthStore } from "@/stores/useAuthStore";
import { canAccessPlusFeatures } from "@/hooks/useSubscription";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import type { ReportsRangeData } from "@/hooks/useReports";
import { SectionCard } from "@/components/shared/PagePrimitives";

export function ProductAnalysis({ data }: { data: ReportsRangeData }) {
  const isPlus = canAccessPlusFeatures(
    useAuthStore((state) => state.gym?.subscription_plan),
  );
  const money = useMoneyVisibility();
  if (!isPlus) return null;
  const profit = data.product_profitability;
  return (
    <SectionCard
      title="Ganancia de productos"
      description="Cobros menos devoluciones y costo de los productos vendidos. Aún no descuenta renta, nómina ni otros gastos."
    >
      {!profit ? (
        <p className="text-sm text-muted-foreground">
          Actualiza Tinta para consultar la ganancia de productos.
        </p>
      ) : profit.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin ventas de productos en este período.
        </p>
      ) : (
        <>
          {profit.status === "incomplete" && (
            <p role="status" className="mb-4 text-sm text-warning-foreground">
              Faltan costos: {profit.items_with_cost} de {profit.items_total}{" "}
              productos tienen costo registrado.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-3 font-medium">Producto</th>
                  <th className="py-3 text-right font-medium">
                    Ganancia bruta
                  </th>
                  <th className="py-3 pl-3 text-right font-medium">Margen</th>
                </tr>
              </thead>
              <tbody>
                {profit.rows.map((row) => (
                  <tr key={row.product_id} className="border-b">
                    <td className="py-3 pr-3">
                      <p>{row.product_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Cobros menos devoluciones: {money.fmt(row.revenue)} ·
                        Costo:{" "}
                        {row.cost_complete
                          ? money.fmt(row.cogs)
                          : "Sin completar"}
                      </p>
                    </td>
                    <td className="text-right font-semibold tabular">
                      {row.cost_complete
                        ? money.fmt(row.gross_profit)
                        : "Sin costo"}
                    </td>
                    <td className="pl-3 text-right tabular">
                      {money.hidden
                        ? "—"
                        : row.cost_complete && row.margin_pct != null
                          ? `${row.margin_pct.toFixed(1)}%`
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </SectionCard>
  );
}
