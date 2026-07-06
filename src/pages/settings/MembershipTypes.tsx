import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Loader2, Plus, Pencil, BadgeMinus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api";
import { cn, formatMoney } from "@/lib/utils";
import {
  useCreateMembershipType,
  useDeactivateMembershipType,
  useMembershipTypes,
  useUpdateMembershipType,
  type MaintenanceFrequency,
  type MembershipType,
  type UpsertMembershipTypeInput,
} from "@/hooks/useMembershipTypes";
import { useGymChargeSettings, useUpdateGymChargeSettings } from "@/hooks/useGymChargeSettings";
import { members as t } from "@/strings/members";
import { MembershipTypeForm } from "@/components/settings/MembershipTypeForm";
import { PromotionsTab } from "@/components/settings/PromotionsTab";

// Página con dos tabs: "Membresías" (el CRUD de planes existente) y
// "Promociones" (catálogo de promos del BC promotions). El tab activo
// se preserva en `?tab=`. La ruta sigue siendo /settings/membership-types
// — el rename del sidebar a "Membresías y promociones" no rompe deep-links.
type TabKey = "membresias" | "promociones";

function parseTab(raw: string | null): TabKey {
  return raw === "promociones" ? "promociones" : "membresias";
}

// Gym-level feature flags. Fuente de verdad: `gyms.charge_settings`
// en BE (JSONB que sincroniza entre dispositivos del mismo gym via
// el sync agent). Migración suave del LS legacy la hace
// useGymChargeSettings en su primer fetch.

const FREQ_VALUES: MaintenanceFrequency[] = [
  "monthly",
  "bimonthly",
  "quarterly",
  "semiannual",
  "annual",
];

// Etiquetas para el Select de frecuencia + cualquier display futuro.
// Espeja el orden de FREQ_VALUES (más frecuente → menos).
const FREQ_OPTIONS: { value: MaintenanceFrequency; label: string }[] = [
  { value: "monthly", label: t.types.freqMonthly },
  { value: "bimonthly", label: t.types.freqBimonthly },
  { value: "quarterly", label: t.types.freqQuarterly },
  { value: "semiannual", label: t.types.freqSemiannual },
  { value: "annual", label: t.types.freqAnnual },
];

export default function MembershipTypesPage() {
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get("tab"));
  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <div className="space-y-1">
        <h1
          className="text-3xl font-bold text-foreground"
          style={{ letterSpacing: "-0.02em" }}
        >
          Membresías y promociones
        </h1>
        <p className="text-sm text-muted-foreground">
          Tus planes de membresía + las promociones que aplicas al cobrar.
        </p>
      </div>
      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = new URLSearchParams(params);
          if (v === "membresias") next.delete("tab");
          else next.set("tab", v);
          setParams(next, { replace: true });
        }}
      >
        <TabsList>
          <TabsTrigger value="membresias">Membresías</TabsTrigger>
          <TabsTrigger value="promociones">Promociones</TabsTrigger>
        </TabsList>
        <TabsContent value="membresias" className="pt-4">
          <MembershipsTab />
        </TabsContent>
        <TabsContent value="promociones" className="pt-4">
          <PromotionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MembershipsTab() {
  const types = useMembershipTypes(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<MembershipType | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<MembershipType | null>(null);

  // Carga del backend. Antes esto vivía en localStorage; ahora la
  // fuente de verdad es `gyms.charge_settings`. El hook hace migración
  // suave del LS legacy en su primer fetch.
  const chargeSettings = useGymChargeSettings();
  const updateCharge = useUpdateGymChargeSettings();

  // Estado local del form, hidratado con la respuesta del backend.
  const [chargeEnrollment, setChargeEnrollment] = useState(false);
  const [chargeMaintenance, setChargeMaintenance] = useState(false);
  const [maintFreq, setMaintFreq] = useState<MaintenanceFrequency>("monthly");
  const [enrollmentAmount, setEnrollmentAmount] = useState("");
  const [maintenanceAmount, setMaintenanceAmount] = useState("");
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    if (!chargeSettings.data) return;
    const d = chargeSettings.data;
    setChargeEnrollment(!!d.charges_enrollment);
    setChargeMaintenance(!!d.charges_maintenance);
    if (d.maintenance_frequency && (FREQ_VALUES as string[]).includes(d.maintenance_frequency)) {
      setMaintFreq(d.maintenance_frequency as MaintenanceFrequency);
    }
    if (typeof d.enrollment_amount === "number") {
      setEnrollmentAmount(String(d.enrollment_amount));
    }
    if (typeof d.maintenance_amount === "number") {
      setMaintenanceAmount(String(d.maintenance_amount));
    }
    hydratedRef.current = true;
  }, [chargeSettings.data]);

  // Indicador "✓ Guardado": se prende tras cualquier cambio en los
  // settings y se apaga solo 2.2s después de la última edición.
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Persistencia debounced al backend. Disparamos un PATCH 600ms
  // después del último cambio para no pegarle al server por cada
  // keystroke en los inputs numéricos.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const handle = setTimeout(() => {
      const eAmt = parseFloat(enrollmentAmount);
      const mAmt = parseFloat(maintenanceAmount);
      updateCharge.mutate(
        {
          charges_enrollment: chargeEnrollment,
          charges_maintenance: chargeMaintenance,
          enrollment_amount: Number.isFinite(eAmt) && eAmt >= 0 ? eAmt : 0,
          maintenance_amount: Number.isFinite(mAmt) && mAmt >= 0 ? mAmt : 0,
          maintenance_frequency: maintFreq,
        },
        { onSuccess: () => setSavedAt(Date.now()) },
      );
    }, 600);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargeEnrollment, chargeMaintenance, maintFreq, enrollmentAmount, maintenanceAmount]);

  useEffect(() => {
    if (savedAt === null) return;
    const tHandle = setTimeout(() => setSavedAt(null), 2200);
    return () => clearTimeout(tHandle);
  }, [savedAt]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-end gap-4 flex-wrap">
        <Button
          size="lg"
          onClick={() => setCreateOpen(true)}
          className="h-10 rounded-md font-semibold shadow-sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t.types.addNew}
        </Button>
      </div>

      {/* Gym-level settings: el dueño habilita las features que su gym
          cobra. Layout en 2 columnas para que el card no empuje la
          tabla cuando ambos toggles están activos. La frecuencia usa
          un Select (no radio) para no inflar verticalmente cuando se
          expande con las 5 opciones. */}
      <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <h2 className="text-base font-semibold tracking-tight">{t.types.gymSettingsTitle}</h2>
            <p className="text-xs text-muted-foreground">{t.types.gymSettingsHint}</p>
          </div>
          {/* Pill "Guardado" — sale tras cada cambio y se desvanece a
              los 2s. La animación combina fade + slide para que el
              dueño la note sin que sea ruidosa. */}
          <span
            aria-live="polite"
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
              "bg-moss-100 text-moss-700 dark:bg-moss-500/20 dark:text-moss-100",
              "transition-all duration-300",
              savedAt
                ? "opacity-100 translate-y-0"
                : "opacity-0 -translate-y-1 pointer-events-none",
            )}
          >
            <Check className="h-3 w-3" />
            Guardado
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Inscripción */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div className="min-w-0">
                <div className="text-sm font-medium">{t.types.chargeEnrollment}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {t.types.chargeEnrollmentHint}
                </div>
              </div>
              <Switch
                checked={chargeEnrollment}
                onCheckedChange={(v) => setChargeEnrollment(!!v)}
              />
            </label>
            {chargeEnrollment && (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="gym-enrollment-amount"
                  inputMode="decimal"
                  className="pl-7 h-9"
                  placeholder="Monto"
                  value={enrollmentAmount}
                  onChange={(e) => setEnrollmentAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  aria-label={t.types.form.enrollmentAmount}
                />
              </div>
            )}
          </div>

          {/* Mantenimiento */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div className="min-w-0">
                <div className="text-sm font-medium">{t.types.chargeMaintenance}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {t.types.chargeMaintenanceHint}
                </div>
              </div>
              <Switch
                checked={chargeMaintenance}
                onCheckedChange={(v) => setChargeMaintenance(!!v)}
              />
            </label>
            {chargeMaintenance && (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="gym-maintenance-amount"
                    inputMode="decimal"
                    className="pl-7 h-9"
                    placeholder="Monto"
                    value={maintenanceAmount}
                    onChange={(e) => setMaintenanceAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    aria-label={t.types.form.maintenanceAmount}
                  />
                </div>
                <Select
                  value={maintFreq}
                  onValueChange={(v) => setMaintFreq(v as MaintenanceFrequency)}
                >
                  <SelectTrigger className="h-9 w-[120px]" aria-label={t.types.maintenanceFrequency}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQ_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {(chargeEnrollment || chargeMaintenance) && (
          <p className="text-[11px] text-muted-foreground">
            Estos montos se usan como default al crear planes nuevos. Cada plan
            los puede ajustar al editarlo.
          </p>
        )}
      </div>

      {types.error && (
        <Alert variant="destructive">
          <AlertDescription>{t.errors.loadTypes}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.types.columns.name}</TableHead>
              <TableHead>{t.types.columns.price}</TableHead>
              <TableHead>{t.types.columns.duration}</TableHead>
              <TableHead>{t.types.columns.status}</TableHead>
              <TableHead className="text-right">{t.types.columns.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline-block" />
                </TableCell>
              </TableRow>
            ) : (types.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  Aún no hay membresías. Crea la primera.
                </TableCell>
              </TableRow>
            ) : (
              (types.data ?? []).map((p) => (
                <TableRow key={p.id} className={p.active ? "" : "opacity-60"}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{formatMoney(p.price)}</TableCell>
                  <TableCell>{t.types.durationLabel(p.duration_days, p.duration_months)}</TableCell>
                  <TableCell>
                    {p.active ? (
                      <Badge variant="secondary">{t.types.statusActive}</Badge>
                    ) : (
                      <Badge variant="outline">{t.types.statusInactive}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                      <Pencil className="h-4 w-4" />
                      {t.types.edit}
                    </Button>
                    {p.active && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeactivate(p)}
                        className="text-destructive hover:text-destructive"
                      >
                        <BadgeMinus className="h-4 w-4" />
                        {t.types.deactivate}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        chargeEnrollment={chargeEnrollment}
        chargeMaintenance={chargeMaintenance}
        maintenanceFrequency={maintFreq}
        defaultEnrollmentAmount={parseFloat(enrollmentAmount) || 0}
        defaultMaintenanceAmount={parseFloat(maintenanceAmount) || 0}
      />
      <EditDialog
        type={editing}
        onClose={() => setEditing(null)}
        chargeEnrollment={chargeEnrollment}
        chargeMaintenance={chargeMaintenance}
        maintenanceFrequency={maintFreq}
        defaultEnrollmentAmount={parseFloat(enrollmentAmount) || 0}
        defaultMaintenanceAmount={parseFloat(maintenanceAmount) || 0}
      />
      <DeactivateConfirm
        type={confirmDeactivate}
        onClose={() => setConfirmDeactivate(null)}
      />
    </div>
  );
}

interface DialogFlagsProps {
  chargeEnrollment: boolean;
  chargeMaintenance: boolean;
  maintenanceFrequency: MaintenanceFrequency;
  // Defaults gym-level que pre-llenan el form al crear planes nuevos.
  // En edición se ignoran (el form usa los amounts del plan).
  defaultEnrollmentAmount: number;
  defaultMaintenanceAmount: number;
}

function CreateDialog({
  open,
  onOpenChange,
  chargeEnrollment,
  chargeMaintenance,
  maintenanceFrequency,
  defaultEnrollmentAmount,
  defaultMaintenanceAmount,
}: {
  open: boolean;
  onOpenChange(o: boolean): void;
} & DialogFlagsProps) {
  const create = useCreateMembershipType();
  const [serverError, setServerError] = useState<string | null>(null);

  function handleClose(o: boolean) {
    if (!o) setServerError(null);
    onOpenChange(o);
  }

  async function submit(input: UpsertMembershipTypeInput) {
    setServerError(null);
    try {
      await create.mutateAsync(input);
      toast.success(t.types.form.success.created);
      handleClose(false);
    } catch (e) {
      if (e instanceof ApiError) {
        const data = e.details as Record<string, unknown> | null;
        setServerError((data?.exception as string | undefined) || t.types.form.errors.generic);
      } else {
        setServerError(t.types.form.errors.generic);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.types.form.titleNew}</DialogTitle>
        </DialogHeader>
        <MembershipTypeForm
          submitting={create.isPending}
          chargeEnrollment={chargeEnrollment}
          chargeMaintenance={chargeMaintenance}
          maintenanceFrequency={maintenanceFrequency}
          defaultEnrollmentAmount={defaultEnrollmentAmount}
          defaultMaintenanceAmount={defaultMaintenanceAmount}
          onSubmit={submit}
          onCancel={() => handleClose(false)}
          serverError={serverError}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  type,
  onClose,
  chargeEnrollment,
  chargeMaintenance,
  maintenanceFrequency,
  defaultEnrollmentAmount,
  defaultMaintenanceAmount,
}: { type: MembershipType | null; onClose(): void } & DialogFlagsProps) {
  const update = useUpdateMembershipType(type?.id ?? "");
  const [serverError, setServerError] = useState<string | null>(null);

  async function submit(input: UpsertMembershipTypeInput) {
    if (!type) return;
    setServerError(null);
    try {
      await update.mutateAsync(input);
      toast.success(t.types.form.success.updated);
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        const data = e.details as Record<string, unknown> | null;
        setServerError((data?.exception as string | undefined) || t.types.form.errors.generic);
      } else {
        setServerError(t.types.form.errors.generic);
      }
    }
  }

  return (
    <Dialog
      open={!!type}
      onOpenChange={(o) => {
        if (!o) {
          setServerError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.types.form.titleEdit}</DialogTitle>
        </DialogHeader>
        {type && (
          <MembershipTypeForm
            initial={type}
            submitting={update.isPending}
            chargeEnrollment={chargeEnrollment}
            chargeMaintenance={chargeMaintenance}
            maintenanceFrequency={maintenanceFrequency}
            defaultEnrollmentAmount={defaultEnrollmentAmount}
            defaultMaintenanceAmount={defaultMaintenanceAmount}
            onSubmit={submit}
            onCancel={onClose}
            serverError={serverError}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeactivateConfirm({ type, onClose }: { type: MembershipType | null; onClose(): void }) {
  const deactivate = useDeactivateMembershipType();

  async function confirm() {
    if (!type) return;
    try {
      await deactivate.mutateAsync(type.id);
      toast.success(t.types.form.success.deactivated);
      onClose();
    } catch {
      toast.error(t.types.form.errors.generic);
    }
  }

  return (
    <AlertDialog open={!!type} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{type ? t.types.deactivateConfirm.title(type.name) : ""}</AlertDialogTitle>
          <AlertDialogDescription>{t.types.deactivateConfirm.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deactivate.isPending}>{t.form.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
            disabled={deactivate.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deactivate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t.types.deactivateConfirm.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
