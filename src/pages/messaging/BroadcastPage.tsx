import { useEffect, useState } from "react";
import { Loader2, Lock, Search, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  useBroadcastPreview,
  useSendBroadcast,
  type BroadcastAudience,
} from "@/hooks/useNotifications";
import { useMembersList } from "@/hooks/useMembers";
import { useDebounce } from "@/hooks/useDebounce";
import { useAuthStore } from "@/stores/useAuthStore";
import { ApiError } from "@/lib/api";
import { messaging as t } from "@/strings/messaging";

const AUDIENCES: BroadcastAudience[] = [
  "all_active",
  "expiring_soon",
  "expired",
  "inactive",
];
const MAX_MESSAGE = 600;

export default function BroadcastPage() {
  const qc = useQueryClient();
  const send = useSendBroadcast();
  const gymName = useAuthStore((s) => s.gym?.name) ?? "tu gym";

  const [filter, setFilter] = useState<BroadcastAudience>("all_active");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // null = modo "grupo completo" (manda por filtro). Map = selección manual
  // (opción C: manda member_ids). Se siembra desde el filtro al abrir el picker.
  const [custom, setCustom] = useState<Map<string, string> | null>(null);

  const preview = useBroadcastPreview(filter);
  const data = preview.data;

  useEffect(() => {
    setError(null);
  }, [filter, message, custom]);

  const isPlus = data?.is_plus ?? false;
  const monthlyLimit = data?.monthly_limit ?? 0;
  const monthlyUsed = data?.monthly_used ?? 0;
  const audienceCap = data?.audience_cap ?? 0;
  // El conteo es la selección manual si existe, si no el del filtro.
  const audienceCount = custom ? custom.size : data?.audience_count ?? 0;
  const monthlyReached = monthlyLimit > 0 && monthlyUsed >= monthlyLimit;
  const overCap = audienceCap > 0 && audienceCount > audienceCap;

  const previewText = t.broadcast.previewSkeleton(gymName, message.trim());

  function changeFilter(v: string) {
    setFilter(v as BroadcastAudience);
    setCustom(null); // cambiar de grupo reinicia la selección manual
  }

  function validate(): string | null {
    if (!message.trim()) return t.broadcast.empty;
    if (message.length > MAX_MESSAGE) return t.broadcast.tooLong;
    if (audienceCount === 0) return t.broadcast.noAudience;
    if (overCap) return t.broadcast.overCap(audienceCount, audienceCap);
    if (monthlyReached) return t.broadcast.monthlyReached(monthlyLimit);
    return null;
  }

  function openConfirm() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setConfirmOpen(true);
  }

  async function doSend() {
    try {
      const payload = custom
        ? { memberIds: [...custom.keys()], message: message.trim() }
        : { filter, message: message.trim() };
      const res = await send.mutateAsync(payload);
      toast.success(t.broadcast.success(res.enqueued_count));
      setConfirmOpen(false);
      setMessage("");
      qc.invalidateQueries({ queryKey: ["notifications", "broadcast", "preview"] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t.broadcast.error);
      setConfirmOpen(false);
    }
  }

  // Semilla del picker: la selección actual, o la audiencia del filtro.
  const pickerSeed = (): Map<string, string> => {
    if (custom) return new Map(custom);
    const m = new Map<string, string>();
    for (const a of data?.audience_preview ?? []) m.set(a.id, a.name);
    return m;
  };

  const canSend =
    !!message.trim() && audienceCount > 0 && !overCap && !monthlyReached && !send.isPending;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="space-y-1">
        <h1
          className="text-3xl font-bold text-foreground"
          style={{ letterSpacing: "-0.02em" }}
        >
          {t.broadcast.title}
        </h1>
        <p className="text-sm text-muted-foreground">{t.broadcast.subtitle}</p>
      </div>

      <div className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardContent className="pt-5 pb-5 space-y-4">
            <div className="space-y-1">
              <Label htmlFor="bc-audience">{t.broadcast.audienceLabel}</Label>
              <Select value={filter} onValueChange={changeFilter} disabled={!!custom}>
                <SelectTrigger id="bc-audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => (
                    <SelectItem key={a} value={a}>
                      {t.broadcast.audiences[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center justify-between gap-2 pt-1">
                <p className="text-xs text-muted-foreground">
                  {preview.isLoading
                    ? t.broadcast.loadingPreview
                    : t.broadcast.recipientsCount(audienceCount)}
                </p>
                <div className="flex items-center gap-2">
                  {custom && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground h-7"
                      onClick={() => setCustom(null)}
                    >
                      {t.broadcast.backToGroup}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() => setPickerOpen(true)}
                    disabled={preview.isLoading}
                  >
                    <Users className="h-3.5 w-3.5" />
                    {custom
                      ? t.broadcast.adjustRecipients(custom.size)
                      : t.broadcast.chooseSpecific}
                  </Button>
                </div>
              </div>

              {overCap && (
                <p className="flex items-start gap-1.5 text-xs text-destructive mt-1">
                  <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{t.broadcast.overCap(audienceCount, audienceCap)}</span>
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="bc-body">{t.broadcast.bodyLabel}</Label>
              <Textarea
                id="bc-body"
                rows={4}
                value={message}
                placeholder={t.broadcast.bodyPlaceholder}
                maxLength={MAX_MESSAGE}
                onChange={(e) => setMessage(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t.broadcast.bodyHelp}</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                {t.broadcast.previewLabel}
              </p>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap">
                {previewText}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-xs text-muted-foreground">
                {isPlus
                  ? null
                  : monthlyReached
                    ? t.broadcast.monthlyReached(monthlyLimit)
                    : t.broadcast.monthlyUsage(monthlyUsed, monthlyLimit)}
              </p>
              <Button onClick={openConfirm} disabled={!canSend}>
                <Send className="h-4 w-4" />
                {send.isPending ? t.broadcast.submitting : t.broadcast.submit}
              </Button>
            </div>
            {!isPlus && (
              <p className="text-[11px] text-muted-foreground">{t.broadcast.plusHint}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <RecipientPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        seed={pickerSeed()}
        cap={audienceCap}
        onConfirm={(sel) => setCustom(sel)}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.broadcast.confirm.title(audienceCount)}</AlertDialogTitle>
            <AlertDialogDescription>{t.broadcast.confirm.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={send.isPending}>
              {t.broadcast.confirm.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                doSend();
              }}
              disabled={send.isPending || audienceCount === 0}
            >
              {send.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t.broadcast.confirm.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Selector de socios: parte de una semilla (el grupo del filtro), permite
// quitar palomeados y buscar para agregar otros. La selección final se manda
// como member_ids. Como el cap es ≤100 (Standard) / ≤500 (Plus), una lista
// scrollable basta — sin paginación.
function RecipientPickerDialog({
  open,
  onOpenChange,
  seed,
  cap,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  seed: Map<string, string>;
  cap: number;
  onConfirm: (sel: Map<string, string>) => void;
}) {
  const [sel, setSel] = useState<Map<string, string>>(new Map(seed));
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);

  useEffect(() => {
    if (open) {
      setSel(new Map(seed));
      setSearch("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const searching = debounced.trim().length > 0;
  const results = useMembersList({
    q: debounced.trim() || undefined,
    page: 1,
    page_size: 20,
  });

  function toggle(id: string, name: string, checked: boolean) {
    setSel((prev) => {
      const next = new Map(prev);
      if (checked) next.set(id, name);
      else next.delete(id);
      return next;
    });
  }

  const overCap = cap > 0 && sel.size > cap;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.broadcast.pickerTitle}</DialogTitle>
          <DialogDescription>{t.broadcast.pickerHint}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t.broadcast.pickerSearch}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
          {searching ? (
            results.isLoading ? (
              <div className="p-3 text-sm text-muted-foreground">
                {t.broadcast.loadingPreview}
              </div>
            ) : (results.data?.items ?? []).length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">
                {t.broadcast.pickerNoResults}
              </div>
            ) : (
              results.data!.items.map((it) => {
                const m = it.member;
                const noPhone = !m.phone?.trim();
                return (
                  <label
                    key={m.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={sel.has(m.id)}
                      disabled={noPhone}
                      onCheckedChange={(c) => toggle(m.id, m.full_name, !!c)}
                    />
                    <span className="flex-1 truncate">{m.full_name}</span>
                    {noPhone && (
                      <span className="text-xs text-muted-foreground">
                        {t.broadcast.noPhone}
                      </span>
                    )}
                  </label>
                );
              })
            )
          ) : sel.size === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">
              {t.broadcast.pickerEmpty}
            </div>
          ) : (
            [...sel.entries()].map(([id, name]) => (
              <label
                key={id}
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40"
              >
                <Checkbox checked onCheckedChange={() => toggle(id, name, false)} />
                <span className="flex-1 truncate">{name}</span>
              </label>
            ))
          )}
        </div>

        <DialogFooter className="flex flex-row items-center justify-between gap-3 sm:justify-between">
          <span
            className={
              "text-xs " + (overCap ? "text-destructive" : "text-muted-foreground")
            }
          >
            {t.broadcast.pickerSelectedCount(sel.size)}
            {overCap && ` · ${t.broadcast.overCapShort(cap)}`}
          </span>
          <Button
            onClick={() => {
              onConfirm(sel);
              onOpenChange(false);
            }}
          >
            {t.broadcast.pickerDone}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
