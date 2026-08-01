import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
  DataTableTh,
  EmptyState,
  PageHeader,
  SectionCard,
} from "@/components/shared/PagePrimitives";
import { PlusFeatureLock } from "@/components/shared/PlusFeatureLock";
import { useChallenges } from "@/hooks/useChallenges";
import { ChallengeStatusBadge } from "@/components/challenges/StatusBadge";
import { NewChallengeDialog } from "@/components/challenges/NewChallengeDialog";
import { useAuthStore } from "@/stores/useAuthStore";
import { canAccessPlusFeatures } from "@/hooks/useSubscription";
import { fmtDayGrain } from "@/lib/dates";
import type { Challenge } from "@/types/challenges";

export default function ChallengesListPage() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const plan = useAuthStore((s) => s.gym?.subscription_plan);
  const isPlus = canAccessPlusFeatures(plan);
  // Retos es Plus por pricing — para gym Standard mostramos el lock
  // visual + upsell en lugar de las queries (que de todos modos el BE
  // bloquearía con 402, evitamos el flash de error). El hook se queda
  // arriba con enabled para respetar el orden de hooks de React.
  const list = useChallenges({ pageSize: 50 });
  if (!isPlus) {
    return (
      <PlusFeatureLock
        icon={Trophy}
        title="Retos es parte de Plus"
        body="Crea competencias de recomposición corporal, mide a tus socios y publica rankings. Disponible al mejorar a Plus."
      />
    );
  }

  const items = list.data?.items ?? [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Retos"
        subtitle="Competencias de recomposición corporal"
        actions={
          <Button
            size="lg"
            onClick={() => setCreateOpen(true)}
            className="h-10 rounded-md font-semibold shadow-sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo reto
          </Button>
        }
      />

      {list.error && (
        <Alert variant="destructive">
          <AlertDescription>No pudimos cargar los retos. Intenta de nuevo.</AlertDescription>
        </Alert>
      )}

      <SectionCard flush>
        {list.isLoading && items.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Trophy className="h-5 w-5" />}
            title="Todavía no hay retos"
            hint="Crea el primero para empezar a inscribir socios y capturar mediciones."
            action={
              <Button onClick={() => setCreateOpen(true)} className="rounded-md">
                <Plus className="h-4 w-4 mr-2" />
                Nuevo reto
              </Button>
            }
          />
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableTh>Nombre</DataTableTh>
              <DataTableTh>Estado</DataTableTh>
              <DataTableTh>T₀ — T₁</DataTableTh>
              <DataTableTh>Cuota</DataTableTh>
              <DataTableTh />
            </DataTableHead>
            <DataTableBody>
              {items.map((ch) => (
                <ChallengeRow key={ch.id} ch={ch} onClick={() => navigate(`/retos/${ch.id}`)} />
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </SectionCard>

      <NewChallengeDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function ChallengeRow({ ch, onClick }: { ch: Challenge; onClick: () => void }) {
  return (
    <DataTableRow onClick={onClick}>
      <DataTableCell>
        <div className="font-semibold text-foreground">{ch.name}</div>
        {ch.description && (
          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{ch.description}</div>
        )}
      </DataTableCell>
      <DataTableCell>
        <ChallengeStatusBadge status={ch.status} />
      </DataTableCell>
      <DataTableCell>
        <div className="text-sm text-foreground tabular">
          {fmtDayGrain(ch.measurement_t0_deadline)} → {fmtDayGrain(ch.measurement_t1_start)}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 tabular">
          Cierra {fmtDayGrain(ch.ends_at)}
        </div>
      </DataTableCell>
      <DataTableCell>
        <span className="tabular text-sm">
          {ch.inscription_fee_cents > 0
            ? `$${(ch.inscription_fee_cents / 100).toLocaleString("es-MX")}`
            : "Sin cuota"}
        </span>
      </DataTableCell>
      <DataTableCell className="text-right pr-5">
        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onClick(); }}>
          Ver
        </Button>
      </DataTableCell>
    </DataTableRow>
  );
}
