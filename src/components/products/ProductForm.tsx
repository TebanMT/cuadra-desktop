import { useEffect, useState } from "react";
import { Image as ImageIcon, Loader2, X as XIcon } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isTauri } from "@/lib/utils";
import { products as t } from "@/strings/products";
import { DEFAULT_CATEGORIES } from "@/hooks/useProducts";

export type ProductFormMode = "create" | "edit";

export interface ProductFormValues {
  name: string;
  category: string;
  price: string;
  stock: string;
  min_stock: string;
  photo_url: string;
}

export interface ProductFormSubmitPayload {
  values: {
    name: string;
    category: string;
    price: number;
    stock: number;
    min_stock: number;
    photo_url?: string;
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
}

const CUSTOM_VALUE = "__custom";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, t.form.errors.nameLength)
    .max(100, t.form.errors.nameLength),
  price: z.number({ invalid_type_error: t.form.errors.priceInvalid }).positive(t.form.errors.priceInvalid),
  stock: z.number({ invalid_type_error: t.form.errors.stockNegative }).int().min(0, t.form.errors.stockNegative),
  min_stock: z.number({ invalid_type_error: t.form.errors.minStockNegative }).int().min(0, t.form.errors.minStockNegative),
  category: z.string().min(1, t.form.errors.categoryRequired),
});

const emptyValues: ProductFormValues = {
  name: "",
  category: "Bebidas",
  price: "",
  stock: "0",
  min_stock: "0",
  photo_url: "",
};

export function ProductForm({
  mode,
  initial,
  knownCategories,
  submitting,
  onSubmit,
  onCancel,
  serverError,
}: Props) {
  const [values, setValues] = useState<ProductFormValues>({ ...emptyValues, ...initial });
  const [error, setError] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [addAnother, setAddAnother] = useState(false);

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

  async function pickPhoto() {
    setPhotoErr(null);
    if (!isTauri()) {
      setPhotoErr(t.form.errors.photoFormat);
      return;
    }
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: "Imagen", extensions: ["jpg", "jpeg", "png", "webp"] }],
      });
      if (!selected || typeof selected !== "string") return;
      update("photo_url", selected);
    } catch {
      setPhotoErr(t.form.errors.photoFormat);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const price = parseFloat(values.price);
    const stock = parseInt(values.stock || "0", 10);
    const min_stock = parseInt(values.min_stock || "0", 10);

    const parsed = schema.safeParse({
      name: values.name,
      price,
      stock,
      min_stock,
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
        stock: parsed.data.stock,
        min_stock: parsed.data.min_stock,
        photo_url: values.photo_url || undefined,
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

      <div className="grid grid-cols-2 gap-3">
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
      </div>

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
        <div className="flex items-center gap-3">
          <div className="h-16 w-16 rounded-md border bg-muted flex items-center justify-center overflow-hidden">
            {values.photo_url ? (
              <img src={values.photo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={pickPhoto}>
            {t.form.chooseFile}
          </Button>
          {values.photo_url && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => update("photo_url", "")}
            >
              <XIcon className="h-4 w-4" />
              {t.form.removePhoto}
            </Button>
          )}
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
          value={values.min_stock}
          onChange={(e) => update("min_stock", e.target.value)}
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
    </form>
  );
}
