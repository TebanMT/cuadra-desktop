// Modo de ejecución del FE, leído de VITE_TINTA_MODE. Espeja
// `cuadra-core/src/shared/runtime` del backend.
//
// El consumidor canónico es `canAccessPlusFeatures` en useSubscription:
// en `dev` devuelve true para cualquier plan y se desbloquean todos los
// gates Plus localmente. `isPlusPlan`, `isPaidPlan` y `bannerLevelFor`
// NO miran este modo — el estado real del gym sigue siendo honesto
// incluso en dev.
//
// Fail-closed: cualquier valor inesperado (o ausente) cae a "production".
// VITE_ es prefijo obligatorio de Vite para exponer la var al cliente —
// no se puede leer `TINTA_MODE` a secas del build.

export type RuntimeMode = "dev" | "test" | "production";

// Normaliza: trim, lowercase, y descarta cualquier comentario inline
// (`VITE_TINTA_MODE=dev #yolo` puede llegar acá como "dev #yolo" según
// la versión de dotenv que use Vite). Después del split por whitespace
// nos quedamos con el primer token.
const raw = (import.meta.env.VITE_TINTA_MODE ?? "production")
  .toString()
  .trim()
  .toLowerCase()
  .split(/\s+/)[0];

export const MODE: RuntimeMode =
  raw === "dev" || raw === "development"
    ? "dev"
    : raw === "test"
      ? "test"
      : "production";

export const isDev = MODE === "dev";

// Log diagnóstico cuando no estamos en production: si seteaste
// VITE_TINTA_MODE pero esto imprime "production", el archivo no se está
// cargando (nombre incorrecto, dev server sin reiniciar, o mode equivocado
// de Vite). Silencio en production para no ensuciar la consola del usuario.
if (MODE !== "production") {
  // eslint-disable-next-line no-console
  console.info(
    `[tinta] runtime mode = ${MODE} (VITE_TINTA_MODE=${import.meta.env.VITE_TINTA_MODE ?? "<unset>"})`,
  );
}
