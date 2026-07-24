import { describe, it, expect, vi, beforeEach } from "vitest";

// ── SDK asset stub ────────────────────────────────────────────────────
// Los imports `?url` de DigitalPersona se aliasean a src/test/sdkUrlStub.ts
// (ver vitest.config.ts) — ambos resuelven al string "dp-sdk-stub.js". En
// beforeEach pre-marcamos ese <script> como cargado para que loadScript
// resuelva sin red; el namespace `window.Fingerprint` lo aporta MockWebApi.

type Handler = (e: unknown) => void;

// Cola de comportamientos para enumerateDevices, UNO por instancia creada.
// Cada `new WebApi()` consume el siguiente; si la cola se vacía, default a
// un lector presente. Así cada test declara el guion de sus canales.
let enumerateScript: Array<() => Promise<string[]>> = [];
let instances: MockWebApi[] = [];

class MockWebApi {
  handlers = new Map<string, Set<Handler>>();
  enumerateImpl: () => Promise<string[]>;
  webChannel = { disconnect: vi.fn() };
  startAcquisition = vi.fn(async () => undefined);
  stopAcquisition = vi.fn(async () => undefined);

  constructor() {
    this.enumerateImpl =
      enumerateScript.shift() ?? (async () => ["dev-1"]);
    instances.push(this);
  }

  enumerateDevices() {
    return this.enumerateImpl();
  }

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return this;
  }

  off(event?: string, handler?: Handler) {
    if (event && handler) this.handlers.get(event)?.delete(handler);
    else if (event) this.handlers.delete(event);
    else this.handlers.clear();
    return this;
  }

  fire(event: string, payload: unknown) {
    this.handlers.get(event)?.forEach((h) => h(payload));
  }
}

async function importBiometric() {
  return await import("../biometric");
}

beforeEach(() => {
  // Módulo fresco por test: sdkPromise/readerInstance son singletons de
  // módulo y el punto de estos tests es exactamente su ciclo de vida.
  vi.resetModules();
  instances = [];
  enumerateScript = [];
  document
    .querySelectorAll("script[data-tinta-bio]")
    .forEach((el) => el.remove());
  const tag = document.createElement("script");
  tag.dataset.tintaBio = "dp-sdk-stub.js";
  tag.dataset.loaded = "true";
  document.head.appendChild(tag);
  window.Fingerprint = {
    WebApi: MockWebApi as never,
    SampleFormat: { PngImage: 5 as const },
    b64UrlTo64: (s: string) => s,
  } as never;
});

describe("canal persistente al Lite Client", () => {
  it("reusa el mismo WebApi entre streams consecutivos (regresión: logout→login dejaba el lector sordo)", async () => {
    const bio = await importBiometric();
    const noop = { onSample: () => undefined };

    const s1 = await bio.startCaptureStream(noop);
    await s1.stop();
    const s2 = await bio.startCaptureStream(noop);
    await s2.stop();

    // Antes: un new WebApi() (y un WebSocket abandonado) por cada arranque.
    expect(instances).toHaveLength(1);
    expect(instances[0].webChannel.disconnect).not.toHaveBeenCalled();
  });

  it("captureOnePng comparte el canal del stream (enroll no fabrica canal aparte)", async () => {
    const bio = await importBiometric();
    const stream = await bio.startCaptureStream({ onSample: () => undefined });
    await stream.stop();

    const capture = bio.captureOnePng({ timeoutMs: 5_000 });
    // captureOnePng registra sus handlers tras un par de awaits — esperar
    // a que estén antes de disparar el dedazo simulado.
    await vi.waitFor(() => {
      expect(instances[0].handlers.get("SamplesAcquired")?.size ?? 0).toBeGreaterThan(0);
    });
    // El PNG viaja como JSON de base64url (elemento [0]).
    instances[0].fire("SamplesAcquired", {
      samples: JSON.stringify([btoa("PNG")]),
    });
    const { png } = await capture;

    expect(new TextDecoder().decode(png)).toBe("PNG");
    expect(instances).toHaveLength(1);
  });

  it("canal muerto: redialea UNA vez cerrando el socket viejo", async () => {
    enumerateScript = [
      async () => {
        throw new Error("communication failure");
      },
      async () => ["dev-1"],
    ];
    const bio = await importBiometric();

    const stream = await bio.startCaptureStream({ onSample: () => undefined });
    await stream.stop();

    expect(instances).toHaveLength(2);
    expect(instances[0].webChannel.disconnect).toHaveBeenCalledTimes(1);
    expect(instances[1].webChannel.disconnect).not.toHaveBeenCalled();
    expect(instances[1].startAcquisition).toHaveBeenCalled();
  });

  it("redial también fallido: sube el error clasificado", async () => {
    enumerateScript = [
      async () => {
        throw new Error("communication failure");
      },
      async () => {
        throw new Error("websocket closed");
      },
    ];
    const bio = await importBiometric();

    await expect(
      bio.startCaptureStream({ onSample: () => undefined }),
    ).rejects.toMatchObject({ code: "lite_client_unreachable" });
    expect(instances).toHaveLength(2);
  });

  it("lector desenchufado con canal sano: no_device sin redial", async () => {
    enumerateScript = [async () => []];
    const bio = await importBiometric();

    await expect(
      bio.captureOnePng({ timeoutMs: 5_000 }),
    ).rejects.toMatchObject({ code: "no_device" });
    expect(instances).toHaveLength(1);
    expect(instances[0].webChannel.disconnect).not.toHaveBeenCalled();
  });

  it("isReaderConnected se auto-cura en el mismo poll tras canal muerto", async () => {
    enumerateScript = [
      async () => {
        throw new Error("communication failure");
      },
      async () => ["dev-1"],
    ];
    const bio = await importBiometric();

    await expect(bio.isReaderConnected()).resolves.toBe(true);
    expect(instances).toHaveLength(2);
    expect(instances[0].webChannel.disconnect).toHaveBeenCalledTimes(1);
  });
});
