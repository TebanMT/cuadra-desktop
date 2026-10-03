import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import {
  type CashDrawer,
  useCashDrawers,
  useCreateCashDrawer,
  useDeactivateCashDrawer,
  useUpdateCashDrawer,
} from "@/hooks/useCashDrawers";

interface CashDrawerManagerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

function newIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `drawer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const details = error.details as Record<string, unknown> | null;
    return (
      (details?.exception as string | undefined) ||
      (details?.message as string | undefined) ||
      "No pudimos guardar el cambio."
    );
  }
  return "No pudimos guardar el cambio.";
}

export function CashDrawerManager({ open, onOpenChange }: CashDrawerManagerProps) {
  const drawers = useCashDrawers(true);
  const create = useCreateCashDrawer();
  const update = useUpdateCashDrawer();
  const deactivate = useDeactivateCashDrawer();
  const [newName, setNewName] = useState("");
  const [createKey, setCreateKey] = useState(newIdempotencyKey);
  const [editing, setEditing] = useState<CashDrawer | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNewName("");
    setCreateKey(newIdempotencyKey());
    setEditing(null);
    setEditingName("");
    setError(null);
  }, [open]);

  const busy = create.isPending || update.isPending || deactivate.isPending;

  async function addDrawer(event: React.FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      await create.mutateAsync({ name, idempotency_key: createKey });
      toast.success("Caja creada.");
      setNewName("");
      setCreateKey(newIdempotencyKey());
    } catch (cause) {
      // La llave se conserva: reintentar una respuesta perdida no duplica la
      // caja en otra terminal o al volver la conexión.
      setError(errorMessage(cause));
    }
  }

  async function renameDrawer(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || !editingName.trim()) return;
    setError(null);
    try {
      await update.mutateAsync({
        id: editing.id,
        name: editingName.trim(),
        active: editing.active,
        version: editing.version,
      });
      toast.success("Nombre actualizado.");
      setEditing(null);
      setEditingName("");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function changeActive(drawer: CashDrawer) {
    setError(null);
    try {
      if (drawer.active) {
        await deactivate.mutateAsync({ id: drawer.id, version: drawer.version });
        toast.success("Caja desactivada; su historial se conserva.");
      } else {
        await update.mutateAsync({
          id: drawer.id,
          name: drawer.name,
          active: true,
          version: drawer.version,
        });
        toast.success("Caja reactivada.");
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cajas físicas</DialogTitle>
          <DialogDescription>
            Sólo necesitas más de una si cobras efectivo en mostradores distintos. Cada una tendrá su propio corte.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {drawers.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : drawers.isError ? (
            <Alert variant="destructive">
              <AlertDescription>No pudimos cargar las cajas.</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              {(drawers.data ?? []).map((drawer) => (
                <div key={drawer.id} className="rounded-md border p-3">
                  {editing?.id === drawer.id ? (
                    <form className="flex items-end gap-2" onSubmit={renameDrawer}>
                      <div className="min-w-0 flex-1 space-y-1">
                        <Label htmlFor={`drawer-name-${drawer.id}`}>Nombre</Label>
                        <Input
                          id={`drawer-name-${drawer.id}`}
                          value={editingName}
                          maxLength={80}
                          onChange={(event) => setEditingName(event.target.value)}
                          autoFocus
                        />
                      </div>
                      <Button type="submit" size="sm" disabled={busy || !editingName.trim()}>
                        Guardar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(null)}
                        disabled={busy}
                      >
                        Cancelar
                      </Button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{drawer.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {drawer.is_main ? "Caja principal" : drawer.code}
                          {!drawer.active && " · desactivada"}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(drawer);
                            setEditingName(drawer.name);
                            setError(null);
                          }}
                          disabled={busy}
                          aria-label={`Renombrar ${drawer.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!drawer.is_main && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => changeActive(drawer)}
                            disabled={busy}
                            aria-label={`${drawer.active ? "Desactivar" : "Reactivar"} ${drawer.name}`}
                          >
                            {drawer.active ? (
                              <XCircle className="h-4 w-4" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <form className="space-y-2 border-t pt-4" onSubmit={addDrawer}>
            <Label htmlFor="new-cash-drawer">Agregar otra caja</Label>
            <div className="flex gap-2">
              <Input
                id="new-cash-drawer"
                value={newName}
                maxLength={80}
                placeholder="Ej. Recepción norte"
                onChange={(event) => setNewName(event.target.value)}
              />
              <Button type="submit" disabled={busy || !newName.trim()}>
                {create.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Agregar
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
