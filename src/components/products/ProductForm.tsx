import { useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Loader2, Upload, X as XIcon } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CameraCaptureModal } from "@/components/shared/CameraCaptureModal";
import { ProductPhoto } from "@/components/products/ProductPhoto";
import { products as t } from "@/strings/products";
import { DEFAULT_CATEGORIES } from "@/hooks/useProducts";

export type ProductFormMode = "create" | "edit";

export interface ProductFormValues {
  name: string;
  category: string;
  price: string;
  // `stock` representa el stock inicial en modo create y el stock
  // actual (display) en modo edit. En modo edit el backend ignora
  // este valor — los ajustes pasan por /adjust-stock.
  stock: string;
  // Renombrado de `min_stock` → `stock_minimum` para que coincida con
  // el shape JSON que el backend espera (createProductReq /
  // updateProductReq en product_controller.go). El nombre viejo se
  // descartaba silenciosamente.
  stock_minimum: string;
  // Costo unitario al momento de crear el producto. Sólo se usa en
  // modo create — viaja como `initial_cost` al backend y se persiste
  // en stock_movements (el movement_type='restock' inicial). No hay
  // campo análogo en update porque las llegadas posteriores se
  // registran por separado vía /adjust-stock.
  initial_cost: string;
  // ¿El stock inicial es una COMPRA (salió dinero → egreso del período) o
  // inventario que ya existía y apenas se registra? Default false: el alta
  // típica es formalizar catálogo — la carga inicial del gym contaba como
  // compra y el mes arrancaba con utilidad negativa.
  initial_is_purchase: boolean;
  image_url: string;
}

// Payload que ProductForm.onSubmit emite. `initial_stock`,
// `stock_minimum` e `initial_cost` matchean los JSON keys esperados
// por el backend en createProductReq. En update ignoramos
// `initial_stock`/`initial_cost` (no están en updateProductReq) en
// la capa de ProductsPage.
export interface ProductFormSubmitPayload {
  values: {
    name: string;
    category: string;
    price: number;
    initial_stock: number;
    stock_minimum: number;
    initial_cost?: number;
    initial_is_purchase?: boolean;
    image_url?: string;
  };
  addAnother: boolean;
}

interface Props {
  mode: ProductFormMode;
  initial?: Partial<ProductFormValues>;
  knownCategories?: string[];
  submitting: boolean;
  onSubmit(payload: ProductFormSubmitPayload): void;
  onCancel(): void;
  serverError?: string | null;
  productId?: string;
}

const CUSTOM_VALUE = "__custom";
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp"] as const;

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, t.form.errors.nameLength)
    .max(100, t.form.errors.nameLength),
  price: z.number({ invalid_type_error: t.form.errors.priceInvalid }).positive(t.form.errors.priceInvalid),
  stock: z.number({ invalid_type_error: t.form.errors.stockNegative }).int().min(0, t.form.errors.stockNegative),
  stock_minimum: z.number({ invalid_type_error: t.form.errors.minStockNegative }).int().min(0, t.form.errors.minStockNegative),
  category: z.string().min(1, t.form.errors.categoryRequired),
});

const emptyValues: ProductFormValues = {
  name: "",
  category: "Bebidas",
  price: "",
  stock: "0",
  stock_minimum: "0",
  initial_cost: "",
  initial_is_purchase: false,
  image_url: "",
};

export function ProductForm({
  mode,
  initial,
  knownCategories,
  submitting,
  onSubmit,
  onCancel,
  serverError,
  productId,
}: Props) {
  const [values, setValues] = useState<ProductFormValues>({ ...emptyValues, ...initial });
  const [error, setError] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [addAnother, setAddAnother] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  // hasCamera: detección barata por capability del navegador. Tauri en
  // Mac/Windows expone getUserMedia igual que un Chromium normal, así
  // que el botón se muestra. En entornos sin enumerateDevices (raros)
  // lo escondemos para no ofrecer algo que va a fallar al click.
  const [hasCamera, setHasCamera] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setHasCamera(false);
    }
  }, []);

  const allCategories = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...(knownCategories ?? []), values.category].filter(Boolean))
  );
  const isCustomCategory = !allCategories.slice(0, allCategories.length).includes(values.category)
    || values.category === CUSTOM_VALUE;
  const [customMode, setCustomMode] = useState(isCustomCategory);

  useEffect(() => {
    if (initial) setValues((v) => ({ ...v, ...initial }));
  }, [initial]);

  function update<K extends keyof ProductFormValues>(key: K, val: ProductFormValues[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  // pickPhoto / onFilePicked — mismo patrón que MemberForm: <input
  // type="file"> nativo + FileReader → data URL. Tauri usa Chromium /
  // WebKit y soporta el picker igual que web, así que evitamos
  // divergencia. La data URL queda en values.image_url; el sync agent
  // del sidecar la detecta (filas con image_url LIKE 'data:%'), sube
  // los bytes a R2 y reemplaza la columna con un object_key.
  function pickPhoto() {
    setPhotoErr(null);
    fileInputRef.current?.click();
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    setPhotoErr(null);
    const file = e.target.files?.[0];
    // Reset value para que seleccionar el mismo archivo dos veces
    // dispare onChange.
    e.target.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!(ALLOWED_EXT as readonly string[]).includes(ext)) {
      setPhotoErr(t.form.errors.photoFormat);
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoErr(t.form.errors.photoTooBig);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") update("image_url", result);
    };
    reader.onerror = () => setPhotoErr(t.form.errors.photoFormat);
    reader.readAsDataURL(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const price = parseFloat(values.price);
    const stock = parseInt(values.stock || "0", 10);
    const stock_minimum = parseInt(values.stock_minimum || "0", 10);
    // Costo opcional: vacío → undefined (BE acepta omisión). El
    // parseFloat de "" da NaN, así que filtramos.
    const initial_cost_parsed = values.initial_cost ? parseFloat(values.initial_cost) : undefined;
    const initial_cost =
      typeof initial_cost_parsed === "number" && !Number.isNaN(initial_cost_parsed) && initial_cost_parsed > 0
        ? initial_cost_parsed
        : undefined;

    const parsed = schema.safeParse({
      name: values.name,
      price,
      stock,
      stock_minimum,
      category: values.category.trim(),
    });

    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }

    onSubmit({
      values: {
        name: parsed.data.name,
        category: parsed.data.category,
        price: parsed.data.price,
        // El form expone "stock" pero el backend espera initial_stock
        // en create (ignorado en update, lo hace /adjust-stock).
        initial_stock: parsed.data.stock,
        stock_minimum: parsed.data.stock_minimum,
        initial_cost,
        // Sólo relevante cuando hay costo — sin costo el movimiento no
        // entra a ningún número de dinero de todos modos.
        initial_is_purchase: initial_cost !== undefined ? values.initial_is_purchase : undefined,
        image_url: values.image_url || undefined,
      },
      addAnother: mode === "create" ? addAnother : false,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {(error || serverError) && (
        <Alert variant="destructive">
          <AlertDescription>{error || serverError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="p-name">{t.form.fields.name} *</Label>
        <Input
          id="p-name"
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
          autoFocus
        />
      </div>

      {/* En modo edit, Stock NO es editable desde este form: el backend
          rechaza cambios de stock en PATCH /products/:id (ADR-002 /
          DA-24.1 — los ajustes pasan por /adjust-stock para que queden
          trazados en stock_movements). El operador tiene el botón
          "Ajustar stock" en la tabla que abre AdjustStockModal con las
          opciones correctas (llegada, merma, conteo). Mostrar un input
          aquí sería UX trampa: el cambio se descartaría silenciosamente. */}
      <div className={mode === "create" ? "grid grid-cols-2 gap-3" : ""}>
        <div className="space-y-2">
          <Label htmlFor="p-price">{t.form.fields.price} *</Label>
          <Input
            id="p-price"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={values.price}
            onChange={(e) => update("price", e.target.value)}
          />
        </div>
        {mode === "create" && (
          <div className="space-y-2">
            <Label htmlFor="p-stock">{t.form.fields.stock} *</Label>
            <Input
              id="p-stock"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={values.stock}
              onChange={(e) => update("stock", e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Costo unitario — solo en create. Opcional: si el operador no
          lo conoce, lo deja vacío y el stock_movement inicial queda
          sin costo. El que sí lo escribe permite que el reporte de
          egresos refleje cuánto desembolsó para llenar el inventario
          de arranque. Llegadas posteriores capturan su costo vía
          AdjustStockModal (movement_type='restock'). */}
      {mode === "create" && (
        <div className="space-y-2">
          <Label htmlFor="p-cost">{t.form.fields.initialCost}</Label>
          <Input
            id="p-cost"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="0.00"
            value={values.initial_cost}
            onChange={(e) => update("initial_cost", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t.form.initialCostHint}</p>
          {values.initial_cost && (
            <label className="flex items-start gap-2 pt-1">
              <Switch
                checked={values.initial_is_purchase}
                onCheckedChange={(v) => update("initial_is_purchase", !!v)}
              />
              <span className="text-sm leading-tight">
                {t.form.initialIsPurchase}
                <span className="block text-xs text-muted-foreground mt-0.5">
                  {t.form.initialIsPurchaseHint}
                </span>
              </span>
            </label>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="p-cat">{t.form.fields.category} *</Label>
        {customMode ? (
          <div className="flex gap-2">
            <Input
              id="p-cat"
              placeholder={t.form.customCategoryPlaceholder}
              value={values.category}
              onChange={(e) => update("category", e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCustomMode(false);
                update("category", "Bebidas");
              }}
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Select
            value={allCategories.includes(values.category) ? values.category : "Bebidas"}
            onValueChange={(v) => {
              if (v === CUSTOM_VALUE) {
                setCustomMode(true);
                update("category", "");
              } else {
                update("category", v);
              }
            }}
          >
            <SelectTrigger id="p-cat">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_VALUE}>{t.form.customCategory}</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-2">
        <Label>{t.form.fields.photo}</Label>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative h-16 w-16 rounded-md border bg-muted flex items-center justify-center overflow-hidden">
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
            <ProductPhoto
              productId={productId}
              imageUrl={values.image_url}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={pickPhoto}>
            <Upload className="h-4 w-4 mr-2" />
            {t.form.chooseFile}
          </Button>
          {hasCamera && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setPhotoErr(null);
                setCameraOpen(true);
              }}
            >
              <Camera className="h-4 w-4 mr-2" />
              {t.form.takePhoto}
            </Button>
          )}
          {values.image_url && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => update("image_url", "")}
            >
              <XIcon className="h-4 w-4" />
              {t.form.removePhoto}
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onFilePicked}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t.form.photoHint}</p>
        {photoErr && <p className="text-xs text-destructive">{photoErr}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-min">{t.form.fields.minStock}</Label>
        <Input
          id="p-min"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={values.stock_minimum}
          onChange={(e) => update("stock_minimum", e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t.form.minStockHint}</p>
      </div>

      {mode === "create" && (
        <label className="flex items-center gap-2 cursor-pointer pt-1">
          <Checkbox
            checked={addAnother}
            onCheckedChange={(v) => setAddAnother(!!v)}
          />
          <span className="text-sm">{t.form.addAnother}</span>
        </label>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          {t.form.cancel}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {t.form.submit}
        </Button>
      </div>

      <CameraCaptureModal
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onCapture={(dataUrl) => update("image_url", dataUrl)}
        title="Capturar foto del producto"
      />
    </form>
  );
}

