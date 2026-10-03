import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { SectionCard } from "@/components/shared/PagePrimitives";

export function MemberProductLinks({ summary, showProducts = true }: {
  summary: { expiring_soon: number; pending_balance: number; low_stock: number };
  showProducts?: boolean;
}) {
  const links = [
    { count: summary.expiring_soon, label: "Membresías por vencer", to: "/members?status=expiring_soon" },
    { count: summary.pending_balance, label: "Socios con saldo pendiente", to: "/members?status=balance" },
    ...(showProducts ? [{ count: summary.low_stock, label: "Productos con pocas existencias", to: "/products?low_stock=1" }] : []),
  ].filter(item => item.count > 0);
  if (!links.length) return null;
  return <SectionCard title={showProducts ? "Socios y productos" : "Socios"} flush>
    <ul className="divide-y divide-border">{links.map(item => <li key={item.to}>
      <Link to={item.to} className="flex items-center gap-3 px-4 sm:px-6 py-3.5 hover:bg-muted/50">
        <span className="tabular-nums font-semibold">{item.count}</span>
        <span className="flex-1 text-sm">{item.label}</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>
    </li>)}</ul>
  </SectionCard>;
}
