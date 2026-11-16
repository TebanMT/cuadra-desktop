import { useId } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  type Permission,
  type PermissionInfo,
} from "@/lib/permissions";
import { settings as t } from "@/strings/settings";

interface Props {
  value: Permission[];
  onChange(next: Permission[]): void;
  disabled?: boolean;
  /** Editing an existing operator: the switches show what they already have. */
  editing?: boolean;
}

const BY_KEY = new Map<Permission, PermissionInfo>(PERMISSIONS.map((p) => [p.key, p]));

/** Keep the catalog order so the payload is stable. */
function inCatalogOrder(set: ReadonlySet<Permission>): Permission[] {
  return PERMISSIONS.map((p) => p.key).filter((k) => set.has(k));
}

/**
 * Operator permissions for create and edit: what reception can always do,
 * then one switch per permission, grouped by what it touches.
 */
export function OperatorPermissionsFields({ value, onChange, disabled, editing }: Props) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const allOn = value.length === PERMISSIONS.length;

  function toggle(key: Permission, on: boolean) {
    const next = new Set(value);
    if (on) next.add(key);
    else next.delete(key);
    onChange(inCatalogOrder(next));
  }

  return (
    <section aria-labelledby={titleId} className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 id={titleId} className="text-base font-semibold leading-tight">
            {t.operators.permissions.title}
          </h3>
          <p className="text-sm text-muted-foreground">
            {editing ? t.operators.permissions.introEdit : t.operators.permissions.intro}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-mr-3 -mt-2.5 shrink-0 text-primary hover:text-primary"
          disabled={disabled}
          onClick={() => onChange(allOn ? [] : PERMISSIONS.map((p) => p.key))}
        >
          {allOn ? t.operators.permissions.allOff : t.operators.permissions.allOn}
        </Button>
      </div>

      <p className="flex gap-2.5 rounded-lg bg-muted/60 px-3.5 py-3 text-sm text-foreground">
        <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success-text" />
        <span>{t.operators.permissions.always}</span>
      </p>

      {PERMISSION_GROUPS.map((group) => {
        const groupId = `${baseId}-${group.key}`;
        return (
          <div key={group.key} role="group" aria-labelledby={groupId} className="space-y-2">
            <h4 id={groupId} className="text-sm font-semibold text-muted-foreground">
              {group.title}
            </h4>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {group.permissions.map((key) => {
                const p = BY_KEY.get(key);
                if (!p) return null;
                const id = `${baseId}-${p.key}`;
                const on = value.includes(p.key);
                return (
                  <li key={p.key} className="flex items-center justify-between gap-4 px-3.5 py-3">
                    <div className="min-w-0 space-y-0.5">
                      <Label htmlFor={id} className="cursor-pointer font-medium leading-snug">
                        {p.title}
                      </Label>
                      <p id={`${id}-desc`} className="text-sm leading-snug text-muted-foreground">
                        {p.description}
                      </p>
                    </div>
                    <Switch
                      id={id}
                      aria-describedby={`${id}-desc`}
                      checked={on}
                      disabled={disabled}
                      onCheckedChange={(next) => toggle(p.key, next)}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
