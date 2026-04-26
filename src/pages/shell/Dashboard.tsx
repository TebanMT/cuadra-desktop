import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/stores/useAuthStore";

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const gym = useAuthStore((s) => s.gym);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl">Hola, {user?.full_name?.split(" ")[0] ?? "operador"}</h1>
        <p className="text-muted-foreground">
          {gym?.name ? `Bienvenido a ${gym.name}.` : "Bienvenido a Cuadra."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Socios activos</CardTitle>
            <CardDescription>Próximamente</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-muted-foreground">—</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cobros del día</CardTitle>
            <CardDescription>Próximamente</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-muted-foreground">—</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Asistencias hoy</CardTitle>
            <CardDescription>Próximamente</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-muted-foreground">—</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Esto es solo el principio</CardTitle>
          <CardDescription>
            La sesión 1 montó la base de Cuadra desktop. Las pantallas de socios, cobros, productos
            y check-in llegan en las próximas sesiones.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
