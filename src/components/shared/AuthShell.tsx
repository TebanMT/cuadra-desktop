import { ReactNode } from "react";

interface Props {
  children: ReactNode;
  hero?: ReactNode;
}

export function AuthShell({ children, hero }: Props) {
  return (
    <div className="grid min-h-screen w-full lg:grid-cols-2">
      <div className="hidden bg-primary text-primary-foreground lg:flex flex-col justify-between p-12">
        <div>
          <div className="text-3xl font-bold tracking-tight">Cuadra</div>
          <p className="mt-2 text-primary-foreground/70 text-sm">Sistema operativo para gimnasios.</p>
        </div>
        <div>
          {hero ?? (
            <blockquote className="text-2xl font-medium leading-snug max-w-md">
              "Tu gym al día, sin pelearte con la computadora."
            </blockquote>
          )}
        </div>
        <div className="text-xs text-primary-foreground/50">
          © {new Date().getFullYear()} Cuadra
        </div>
      </div>
      <main className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
