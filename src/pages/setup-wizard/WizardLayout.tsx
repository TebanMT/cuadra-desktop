import { ReactNode } from "react";
import { Progress } from "@/components/ui/progress";
import { wizard } from "@/strings/wizard";

interface Props {
  step: 1 | 2 | 3 | 4 | 5;
  total?: number;
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export function WizardLayout({ step, total = 5, title, subtitle, children }: Props) {
  return (
    <div className="min-h-screen w-full bg-background">
      <div className="mx-auto max-w-xl px-6 py-10">
        <div className="text-center">
          <div className="text-2xl font-bold tracking-tight text-primary">Cuadra</div>
          <div className="mt-1 text-sm text-muted-foreground">{wizard.progress(step, total)}</div>
        </div>
        <Progress value={(step / total) * 100} className="mt-4" />
        <div className="mt-10">
          {title && (
            <div className="space-y-2 mb-8">
              <h1 className="text-3xl">{title}</h1>
              {subtitle && <p className="text-muted-foreground text-base">{subtitle}</p>}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
