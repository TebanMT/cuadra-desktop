import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── mocks de auth: el cliente sólo necesita base URL + headers ─────────
const getAuthedRequestContext = vi.fn(async () => ({
  baseUrl: "http://127.0.0.1:7070",
  headers: { Authorization: "Bearer tok", "X-Local-Token": "local" },
}));
const refreshAccessToken = vi.fn(async () => "tok2");
vi.mock("@/lib/api", () => ({
  getAuthedRequestContext: (...args: unknown[]) =>
    getAuthedRequestContext(...(args as [])),
  refreshAccessToken: () => refreshAccessToken(),
}));

import {
  connectBiometricEvents,
  createSseParser,
  type SseFrame,
} from "../biometricEvents";

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

describe("createSseParser", () => {
  it("parsea un frame completo event+data", () => {
    const frames: SseFrame[] = [];
    const p = createSseParser((f) => frames.push(f));
    p.push('event: checkin_result\ndata: {"type":"checkin_result"}\n\n');
    expect(frames).toEqual([
      { event: "checkin_result", data: '{"type":"checkin_result"}' },
    ]);
  });

  it("re-ensambla frames cortados en chunks arbitrarios (el stream corta donde quiere)", () => {
    const frames: SseFrame[] = [];
    const p = createSseParser((f) => frames.push(f));
    p.push("event: sta");
    p.push('tus\ndata: {"connected"');
    p.push(":true}\n");
    expect(frames).toHaveLength(0); // el frame aún no cierra
    p.push("\nevent: reader_connected\ndata: {}\n\n");
    expect(frames).toEqual([
      { event: "status", data: '{"connected":true}' },
      { event: "reader_connected", data: "{}" },
    ]);
  });

  it("ignora los heartbeats (comentarios ': hb') sin emitir frames", () => {
    const frames: SseFrame[] = [];
    const p = createSseParser((f) => frames.push(f));
    p.push(": hb\n\n: hb\n\n");
    expect(frames).toHaveLength(0);
  });

  it("tolera CRLF", () => {
    const frames: SseFrame[] = [];
    const p = createSseParser((f) => frames.push(f));
    p.push('event: status\r\ndata: {"connected":false}\r\n\r\n');
    expect(frames).toEqual([{ event: "status", data: '{"connected":false}' }]);
  });
});

// ---------------------------------------------------------------------------
// Conexión
// ---------------------------------------------------------------------------

function sseChunk(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

// Response-like con un ReadableStream. `close: false` deja el stream
// abierto (long-lived, como el real).
function sseResponse(chunks: Uint8Array[], opts: { close?: boolean } = {}) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      if (opts.close !== false) controller.close();
    },
  });
  return { ok: true, status: 200, body } as Response;
}

describe("connectBiometricEvents", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getAuthedRequestContext.mockClear();
    refreshAccessToken.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("manda Authorization + X-Local-Token y entrega status snapshot y eventos tipados", async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse(
        [
          sseChunk("status", { connected: true, available: true }),
          sseChunk("checkin_no_match", {
            type: "checkin_no_match",
            timestamp: "2026-07-26T10:00:00Z",
          }),
        ],
        { close: false },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const onOpen = vi.fn();
    const onStatus = vi.fn();
    const onEvent = vi.fn();
    const conn = connectBiometricEvents({ onOpen, onStatus, onEvent });
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:7070/api/v1/biometric/events",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
          "X-Local-Token": "local",
          Accept: "text/event-stream",
        }),
      }),
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith({ connected: true, available: true });
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "checkin_no_match" }),
    );
    conn.close();
  });

  it("cuando el server cierra el stream, avisa onDown y redialea con backoff", async () => {
    const fetchMock = vi.fn(async () => sseResponse([])); // cierra al instante
    vi.stubGlobal("fetch", fetchMock);

    const onDown = vi.fn();
    const conn = connectBiometricEvents({ onDown });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onDown).toHaveBeenCalledTimes(1);

    // Backoff exponencial: 1s → 2s.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2); // aún no cumple los 2s
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    conn.close();
  });

  it("un open exitoso resetea el backoff", async () => {
    // 1a conexión: entrega un evento y cierra (open exitoso). 2a: cierra
    // sin abrir bien... ambas son ok:200, así que ambas resetean; lo que
    // validamos es que tras un open el siguiente retry vuelve a ser 1s.
    const fetchMock = vi.fn(async () =>
      sseResponse([sseChunk("status", { connected: true, available: true })]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const conn = connectBiometricEvents({});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(3); // sigue en 1s, no 2s
    conn.close();
  });

  it("en 401 refresca el token y reintenta", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, body: null } as Response)
      .mockResolvedValue(sseResponse([], { close: false }));
    vi.stubGlobal("fetch", fetchMock);

    const conn = connectBiometricEvents({});
    await vi.advanceTimersByTimeAsync(0);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    conn.close();
  });

  it("close() detiene los reintentos", async () => {
    const fetchMock = vi.fn(async () => sseResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const conn = connectBiometricEvents({});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    conn.close();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
