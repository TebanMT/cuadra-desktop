import { ReportsScreen } from "@/components/reports/ReportsScreen";
import { saveBlob } from "@/lib/tauri-bridge";
import { useSyncStatus } from "@/hooks/useSyncStatus";
const paths = {
  income: "/billing",
  cash: "/reports/cash-close/summary",
  analysis: "/reports/analysis",
};
const saveFile = async (blob: Blob, name: string) =>
  !!(await saveBlob(blob, name));
export default function ReportsPage({
  mode = "report",
}: {
  mode?: "report" | "cash" | "analysis";
}) {
  const sync = useSyncStatus();
  return (
    <ReportsScreen
      paths={paths}
      saveFile={saveFile}
      mode={mode}
      syncPending={(sync.data?.queue_pending_count ?? 0) > 0}
    />
  );
}
