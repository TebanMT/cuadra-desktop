import { describe, it, expect, afterEach } from "vitest";
import { MutationObserver, onlineManager } from "@tanstack/react-query";
import { queryClient } from "../queryClient";

// Regresión del incidente de campo (jul-2026): con la app CORRIENDO y el
// hotspot/WiFi cayéndose (evento `offline` → navigator.onLine=false), el
// default de TanStack (networkMode 'online') pausaba TODA query y mutation
// aunque el backend es el sidecar en 127.0.0.1 — búsquedas mudas, alta sin
// planes, banner de offline ciego, y mutations encoladas que disparaban en
// ráfaga al reconectar (socio duplicado real).
//
// Estos tests simulan EXACTAMENTE esa transición vía onlineManager (la
// fuente que TanStack consulta para navigator.onLine): si alguien quita el
// networkMode 'always' del queryClient, los tests de ejecución-offline se
// quedan colgados en 'paused' y revientan por timeout.
describe("queryClient offline-first (networkMode)", () => {
  afterEach(() => {
    onlineManager.setOnline(true);
    queryClient.clear();
  });

  it("los defaults fijan networkMode 'always' en queries y mutations", () => {
    const d = queryClient.getDefaultOptions();
    expect(d.queries?.networkMode).toBe("always");
    expect(d.mutations?.networkMode).toBe("always");
  });

  it("una query EJECUTA aunque el navegador reporte offline (hotspot caído)", async () => {
    onlineManager.setOnline(false); // ← el evento `offline` de la transición

    let ran = false;
    const result = await queryClient.fetchQuery({
      queryKey: ["offline-smoke"],
      queryFn: async () => {
        ran = true;
        return "sidecar-local-respondió";
      },
    });

    expect(ran).toBe(true);
    expect(result).toBe("sidecar-local-respondió");
  });

  it("una mutation DISPARA de inmediato offline (no se encola para replay)", async () => {
    onlineManager.setOnline(false);

    let calls = 0;
    const observer = new MutationObserver(queryClient, {
      mutationFn: async (v: string) => {
        calls += 1;
        return v;
      },
    });

    // El bug original: mutate() quedaba 'paused' en silencio y el operador
    // reintentaba; al reconectar, TODAS disparaban → duplicado. Con
    // 'always' debe resolver aquí mismo, una vez por invocación.
    const out = await observer.mutate("inscribir-socio");
    expect(out).toBe("inscribir-socio");
    expect(calls).toBe(1);
  });
});
