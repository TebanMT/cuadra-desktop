import { Link } from "react-router-dom";
import { ExpensesWorkspace } from "@/pages/expenses/ExpensesPage";

export default function CashMovementsReviewPage() {
  return <div className="p-4 sm:p-6 max-w-5xl mx-auto pb-24 space-y-5">
    <Link to="/reports/cash-close" className="text-sm text-muted-foreground hover:text-foreground">← Volver a Caja</Link>
    <h1 className="text-2xl font-bold">Revisar entradas y salidas</h1>
    <ExpensesWorkspace section="cash" embedded />
  </div>;
}
