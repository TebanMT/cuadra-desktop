import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // networkMode 'always': el backend de este FE es el SIDECAR LOCAL
      // (http://127.0.0.1) — la conectividad del OS es irrelevante. El
      // default de TanStack ('online') PAUSA queries y mutations cuando
      // navigator.onLine=false (adaptador caído, WiFi apagado): búsquedas
      // muertas, planes vacíos en el alta, y el banner de offline ciego
      // (su propia query de /sync/status quedaba pausada). Peor: las
      // mutations pausadas se ENCOLAN y disparan en ráfaga al volver la
      // red — así se duplicó un socio en campo (dos "Inscribir" offline
      // = dos POSTs replayed). Con 'always' todo ejecuta de inmediato
      // contra el sidecar, con o sin internet — que es la definición de
      // offline-first de este producto. OJO: NO copiar esta config al
      // dashboard (ese sí habla con la nube; su default es correcto).
      networkMode: "always",
      retry: (failureCount, error: any) => {
        if (error?.status >= 400 && error?.status < 500) return false;
        return failureCount < 2;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0, networkMode: "always" },
  },
});
