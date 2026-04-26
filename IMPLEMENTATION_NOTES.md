# cuadra-desktop — IMPLEMENTATION NOTES

Notas técnicas y deuda conocida tras las sesiones 1-6. Léelo antes de continuar con sesiones siguientes.

## TODOs (sesiones futuras)

- [ ] **Sidecar binaries**: `src-tauri/binaries/` está vacío en este commit. `pnpm tauri:dev` y `tauri:build` fallarán hasta que `cuadra-core/cmd/sidecar` esté compilado y los artefactos copiados con sufijo de target triple.
- [ ] **Iconos de la app**: `src-tauri/icons/` está vacío. Generar con `pnpm tauri icon path/to/source.png` cuando exista el logo final. Tauri build los exige.
- [ ] **Updater pubkey**: `tauri.conf.json` tiene `pubkey: "REPLACE_ME_WITH_TAURI_UPDATER_PUBKEY"`. Generar par con `pnpm tauri signer generate -w ~/.tauri/cuadra.key` y reemplazar (ADR-005).
- [ ] **Plugin updater wired pero no usado**: el endpoint está registrado, el bin de updater está habilitado, pero no hay UI que dispare el flow. Sesión de release-tooling.
- [ ] **`auth/me` y `setup-status` endpoints**: el frontend los consume (ver `useAuth.useHydrateAuth` y `useSetupStatus`). Confirmar que `cuadra-core` los exponga; si no, agregar a la lista de Sesión 1 backend.
- [ ] **Refresh endpoint**: `lib/api.ts` llama a `POST /api/v1/auth/refresh`. Validar contrato exacto con backend.
- [ ] **`auth/change-password` route**: el flujo está en el código (`Login.tsx` redirige si `must_change_password`), pero la página no existe. Agregar en sesión de "operadores" (UC-006 lo necesita).
- [ ] **Wizard hydratación al volver**: `useSetupStatus` existe pero el wizard no se está hidratando todavía (la spec pide saltar al paso correspondiente al volver). El guard de `setup_completed=false` redirige a step-2 siempre. Iterar cuando Sesión 2 toque membresías.
- [ ] **Print a impresora real**: `print_pdf` Tauri command es stub (loguea el tamaño y retorna OK). Wire a la impresora del SO en sesión de billing/comprobantes (UC-020).
- [ ] **SIGTERM antes de SIGKILL**: el plugin `tauri-plugin-shell` solo expone `child.kill()` (envía SIGKILL en Unix). Para shutdown grace de 5s, hay que (a) agregar un endpoint `/_internal/shutdown` en el sidecar que dispare cleanup y luego `os.Exit`, o (b) bajar a `std::process::Command` directo en Rust. Por ahora `sidecar.rs` espera 5s después del kill, lo cual es suboptimo pero seguro.
- [ ] **Sentry**: ADR-003 §2.9 menciona Sentry para frontend y sidecar. No instalado en MVP — agregar antes del primer release.
- [ ] **Auto-i18n**: strings centralizadas en `src/strings/` para futura migración a `i18next` o similar. No urgente.

## Sesión 6 — Reports + Settings + Operadores + Notifications (UC-005, UC-006-010, UC-033-041)

### Endpoints asumidos por el FE
Optimistic shapes; el sidecar/cloud tiene que exponerlos. Si cambian, ajustar los hooks correspondientes:

**Reports / dashboard**
- `GET /api/v1/dashboard` → `DashboardData` con KPIs, ingresos 30d, attention summary, recent payments, caja del día.
- `GET /api/v1/attention-required` → 6 categorías: expiring_soon, expired_recoverable, inactive_involuntary, low_stock, pending_balance, birthdays_today (UC-034).
- `GET /api/v1/reports?period=today|week|month|last_month|3_months|year` → `ReportsRangeData` con totals, income/checkins by day, top members, recent payments, by method.
- `GET /api/v1/reports/{type}/export?format=pdf|xlsx&period=...` → blob (UC-036). El FE lo descarga vía `downloadBlob()` (anchor + ObjectURL — no usa Tauri save dialog para mantenerlo cross-platform y simple).

**Members / persecución (UC-035)**
- `POST /api/v1/members/{id}/contact-attempts` body `{ channel, note? }` → `{ id, created_at }`.
- `POST /api/v1/members/{id}/mark-lost` body `{ reason? }` → `{ ok }`.

**Gym profile (UC-005)**
- `GET /api/v1/gyms/me` → `GymProfile` extendido (rfc, legal_name, postal_code, tax_regime, logo_url, primary/secondary color, open/close_time, kiosk_volume, kiosk_feedback_ttl_ms).
- `PATCH /api/v1/gyms/me` → mismo shape, partial.
- `POST /api/v1/gyms/me/transfer-ownership/start` body `{ target_user_id }` → `{ expires_at }` (envía OTP por email).
- `POST /api/v1/gyms/me/transfer-ownership` body `{ target_user_id, otp }` → `{ ok }` (UC-010).

**Operadores (UC-006-009)**
- `GET /api/v1/users?include_inactive=true` → `{ items: Operator[] }`.
- `POST /api/v1/users` → `{ user, generated_password }` (si el FE manda la password, `generated_password=null`; el server respeta o regenera).
- `PATCH /api/v1/users/{id}` → `Operator`.
- `PATCH /api/v1/users/{id}/active` body `{ active }` → `Operator`.
- `POST /api/v1/users/{id}/reset-password` → `{ user_id, new_password }`. Frontend muestra modal one-shot con la password.

**Notifications**
- `GET /api/v1/gyms/me/whatsapp` → `WhatsappState` con status + stats 30d.
- `POST /api/v1/gyms/me/whatsapp/start` body `{ phone_number }` → `{ expires_at }` (envía OTP por WhatsApp).
- `POST /api/v1/gyms/me/whatsapp/connect` body `{ phone_number, code }` → `WhatsappState`.
- `DELETE /api/v1/gyms/me/whatsapp` → `{ ok }`.
- `GET /api/v1/notification-templates` → `{ items: NotificationTemplate[] }`.
- `PATCH /api/v1/notification-templates/{key}` body `{ body?, enabled? }` → `NotificationTemplate`.
- `POST /api/v1/notification-templates/{key}/reset` → `NotificationTemplate` (vuelve a default).
- `GET /api/v1/owner-alerts` → `{ items: AlertConfig[] }`.
- `PATCH /api/v1/owner-alerts/{key}` body `{ enabled }` → `AlertConfig`.
- `GET /api/v1/broadcasts/preview?audience=...` → `{ recipients_count, sample_phones }`.
- `POST /api/v1/broadcasts` body `{ audience, body }` → `{ broadcast_id, recipients_count, enqueued_at }`.

**Audit log (UC-005 DA-5.1)**
- `GET /api/v1/audit-log?entity_type=&actor_id=&from=&to=&page=&page_size=` → paginado, gated por `role==='owner'` en el FE (servidor también debe enforcear).

### Decisiones específicas

- **Charts vía `recharts` (3.x)**. Es la opción más probada para dashboards simples; pesa pero solo se carga en Dashboard/Reports. Bundle final ~1.3MB minified — aceptable para desktop. Si crece, code-splittear `recharts` por route.
- **Slider** agregado como UI primitive (`@radix-ui/react-slider`) para volumen del kiosko y duración del feedback (DA-31.2 / DA-29.3 quedan satisfechas con esta UI; el sidecar debe leer `gym.kiosk_volume` y `gym.kiosk_feedback_ttl_ms` al iniciar el kiosko — pendiente integración).
- **Exports PDF/XLSX**: implementado como `api.blob()` + `downloadBlob()` (anchor synthesizado). Razón: funciona idéntico en Tauri webview y dev sin pedir permiso de FS. El nombre de archivo usa `Content-Disposition` del backend si está, si no fallback a `reporte-{period}-{from}_{to}.{ext}`.
- **Transfer ownership**: dos pasos — start (envía OTP a email del owner actual) → confirm con OTP. Tras éxito, se hace `window.location.reload()` para que la app re-hidrate la sesión con el rol nuevo. Backend debe invalidar refresh tokens del que dejó de ser owner para forzar re-login con permisos reducidos (DA-10.1).
- **Operator passwords**: charset `abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789` (DA-6.1, sin confusos). Generación client-side vía `crypto.getRandomValues()`. La password se muestra una vez en modal y luego se borra del estado.
- **Hard limit operadores**: 10 (DA-6.2). El FE blockea el botón "Agregar" si `activeCount >= 10`. Soft warning a partir de 5.
- **Templates editor**: live preview reemplazando variables con sample data hardcoded. Las variables son tipadas por `TEMPLATE_VARIABLES[key]`. Click en variable la pega al final del body. Toggle activo/desactivo coexiste con el body editable.
- **AlertsPage**: solo toggles on/off por tipo (DA-40.1). El UI espera 5 keys: `low_stock`, `expired_no_contact`, `vip_member_no_visit`, `cash_close_diff`, `no_payments_today`. Si el backend devuelve keys adicionales, se renderizan con `cfg.description` como fallback (degradación graceful).
- **BroadcastPage**: `useBroadcastPreview()` cachea recipients_count por audience 15s para evitar rehit en cada keystroke del body. Confirmación bloqueada si WhatsApp no está conectado o `recipients_count === 0`.
- **AuditLogPage**: gate de `role==='owner'` en cliente (también server-side). No se permite editar registros — solo lectura. JSON pretty-printed en `<pre>`. Filtros usan key `_all` como sentinela porque Radix Select no permite empty value.
- **Variables WhatsApp**: el preview en `TemplatesPage` y `BroadcastPage` reemplaza `{gym_name}` con el nombre real del gym desde `useAuthStore`, el resto con sample data. Esto comunica al owner cómo se verá realmente sin mockear datos del backend.
- **YouTube placeholder en WhatsAppSetupPage**: usa `youtube-nocookie.com` con un video ID placeholder (Rick Roll 😅). Reemplazar con video real de onboarding antes del release (DA-37.2).

### Pendiente para sesiones futuras

- [ ] `auth/change-password` route — sigue pendiente (UC-006 flujo first-login). Necesario para que un operador recién creado pueda cambiar su temp password sin pasar por owner.
- [ ] **Logo upload a S3/R2**: `useUploadGymLogo` en `useGym.ts` está stubbed (FormData → `POST /api/v1/gyms/me/logo`). Falta wirar el endpoint y actualizar `logo_url` en el form. El campo actual acepta solo URL externa — limitación temporal.
- [ ] **Rate limit en transfer ownership**: el FE no enforza throttle de re-envío de OTP. Si el server lo impone, el toast genérico sale; UX más fina sería un cooldown timer visible.
- [ ] **WhatsApp connect provider real**: hoy es UI-only contra endpoint hipotético. Cuando llegue Twilio/Meta integration (ADR-007 hipotético), validar que el shape de `WhatsappState.stats` coincida.
- [ ] **Code-splitting de Reports/Dashboard**: el bundle pesa ~1.3MB por incluir Recharts. Si los socios sin permisos no necesitan ver Reports, hacer `lazy()` para no cargar.
- [ ] **`Cuadra Desktop completo end-to-end`**: smoke test manual completo (ver Quality Gates en el prompt) requiere sidecar real corriendo. Hoy solo verificado a nivel de typecheck/lint/build/tests.
- [ ] **Audit log "old vs new"**: la UI muestra `changes` como JSON crudo. Una iteración sería diff visual (chips de keys, before/after lado a lado). Out-of-scope MVP.
- [ ] **i18n del nuevo copy**: las strings nuevas viven en `src/strings/{dashboard,attention,reports,settings,messaging}.ts`. Mismo patrón que sesiones previas — listas para migración a i18next sin esfuerzo.

## Sesión 5 — Check-in (UC-028 a UC-032)

### Contratos de backend asumidos por el FE
El sidecar `cuadra-core` debe exponer estos endpoints (se pueden mockear hasta su implementación; el FE usa shapes optimistas):

- `GET /api/v1/biometric/status` → `{ available: boolean, reader: { model, vendor, connected } | null }`. Polling cada 5s desde `useBiometricStatus`.
- `GET /api/v1/checkins/methods` → `{ fingerprint_available, pin_available, manual_available }`. Auto-adaptación de métodos en kiosko (DA-32.4); polling cada 15s.
- `GET /api/v1/checkins?limit=5` → `{ items: CheckinEvent[] }` para sidebar "Últimos ingresos".
- `GET /api/v1/checkins/count-today` → `{ count_today: number }` para contador del kiosko.
- `POST /api/v1/checkins/manual` body `{ member_id }` → `CheckinEvent` (UC-030).
- `POST /api/v1/checkins/pin` body `{ pin }` → `CheckinEvent` (UC-032). El sidecar aplica el lock de 60s tras 5 intentos fallidos.
- `POST /api/v1/checkins/override` body `{ member_id, reason, original_checkin_id? }` → `CheckinEvent` con `manual_override=true` (UC-029 DA-29.2).
- `GET /api/v1/kiosk/events?cursor=&timeout_ms=25000` long-poll → `{ events: KioskEventEnvelope[], cursor }`. El FE re-emite cursor en cada vuelta. Eventos: `attempt_started`, `checkin_result`, `reader_connected`, `reader_disconnected`.
- `POST /api/v1/members/:id/fingerprint/start` → `{ session_id, captures_total }` (UC-028).
- `GET /api/v1/members/:id/fingerprint/progress?session_id=` → `FingerprintProgress` con `status: idle|waiting|capturing|success|failed`, `captures_done`, `captures_total`. El FE long-pollea cada 500ms.
- `POST /api/v1/auth/verify-password` body `{ password }` → 200/401 para gating del exit del modo kiosko (`Ctrl+Shift+K`). No emite token nuevo.

`CheckinEvent` shape:
```ts
{
  id: string;
  result: "allowed_active" | "allowed_expiring_soon" | "denied_expired" |
          "denied_inactive" | "denied_no_membership" | "denied_not_found";
  method: "fingerprint" | "pin" | "manual";
  member_id: string | null;
  member_name: string | null;
  expiry_date: string | null;
  days_until_expiry: number | null;
  manual_override: boolean;
  override_reason?: string | null;
  operator_name?: string | null;
  created_at: string;
}
```

### Audio sin assets binarios
El prompt sugería `public/audio/checkin-{success|warning|denied}.mp3`. En vez de eso `src/lib/audio.ts` sintetiza los 3 tonos con Web Audio API (estilo zzfx, también permitido por el prompt). Razones: (a) evita binarios sin licencia clara en el repo, (b) sin red ni assets que cargar (offline-first), (c) volumen y forma de onda configurables sin re-encodear. Si en V1+ se prefieren MP3 reales, se reemplaza la implementación de `playCheckinTone()` sin tocar callers. La integración con la opción de volumen del kiosko (DA-31.2, default 80%) usa el segundo argumento de `playCheckinTone(tone, volume)` — falta exponer el slider en Settings.

### Decisiones específicas
- **Detección de huella ↔ kiosk events:** la página de check-in (no fullscreen) también suscribe a `/kiosk/events` cuando hay lector conectado. Esto deja al operador trabajar en otras tabs sin perder eventos del lector — el sidecar es el dueño del loop de captura (ADR-004 §3.8).
- **Override flow:** disparado con tecla `O` cuando el último resultado fue denied y tiene `member_id`. No se ofrece override para `denied_not_found` (no hay socio sobre el cual aplicar). Reason obligatoria, mínimo 5 caracteres.
- **Exit del kiosko:** `Ctrl+Shift+K` abre modal de password. No hay botón visible (DA-31.1). Falla silenciosa de password (mensaje genérico).
- **Auto-fade de feedback:** 5s hardcoded vía `useAutoFade`. Cuando se exponga la opción en Settings (DA-29.3 — 3-10s configurable), pasarlo como prop a CheckinPage/KioskPage.
- **Banner de lector desconectado:** badge ámbar en TopBar (visible siempre que el sidecar reporte `available && !connected`). En el kiosko fullscreen aparece como pill arriba derecha.
- **PIN pad teclable:** acepta input numérico del teclado físico además de los botones (DA-32.4 implícito — el dueño/operador puede usar PIN sin touch).
- **`useCheckinMethods` en lugar de derivar de la lista de socios:** evita pull de toda la lista solo para chequear `has_pin`. El backend debe responder con un boolean cacheable.

### Pendiente para sesiones futuras
- [ ] Integrar volumen configurable del audio (Settings → kiosko volume slider, DA-31.2).
- [ ] Hacer el auto-fade configurable (3-10s, DA-29.3) — leer de `gym.kiosk_settings.feedback_ttl_ms`.
- [ ] Settings → Privacidad → "Mis datos biométricos" (ADR-006 §7): contador de socios con huella + botón "Borrar todas".
- [ ] Botón "Borrar mi huella" en detalle de socio (ADR-006 §6, soft-delete).
- [ ] Tauri: invocar `tauri::WindowBuilder` con `fullscreen: true` cuando se entre a `/kiosk`. Hoy se usa CSS fullscreen — funciona en browser y dentro del webview, pero no oculta la barra del SO.

## Decisiones tomadas

- **Cargo workspace**: `src-tauri/Cargo.toml` es un crate aislado. No workspace por ahora; sumar si crece la lógica Rust.
- **Iconos vía Inter (Google Fonts)**: cargados desde `index.html`. Si se requiere offline-pure, reemplazar con `@fontsource/inter` y bundlear. Para MVP, los gyms tienen internet en signup, y la fuente cachea.
- **CSP en `tauri.conf.json`**: `connect-src` permite `http://127.0.0.1:*` (sidecar) y `https://api.cuadra.app` (cloud directo, futuro). `style-src 'unsafe-inline'` por shadcn/Tailwind dynamic styles.
- **Strict TS off**: `noImplicitAny: false`, `strictNullChecks: false`. Igual que flex-control. Velocidad de iteración > seguridad de tipos en MVP.
- **Sin biblioteca de i18n**: copy en español directo en archivos `src/strings/{auth,wizard,common,shell}.ts`. Migración futura cuando exista mercado fuera de México.
- **Emojis vs iconos**: la spec UC-001 Step 5 muestra `🎉`. Implementado con icono `PartyPopper` de lucide para coherencia con DESIGN.md (no emojis decorativos). Visualmente equivalente, mejor accesibilidad.
- **Wizard alterna entre AuthShell (Step 1) y WizardLayout (Steps 2-5)**: Step 1 todavía es signup público (no autenticado), Steps 2-5 ya con sesión y necesitan layout limpio sin la marca lateral.
- **`auth/signup` route**: redirección desde `/auth/login` no implementada (no hay link directo en Login). Para Sesión 1, el flow asumido es: (a) abrir app por primera vez → mostrar `/auth/signup` (Step 1). Por ahora hay que entrar manualmente. Decidir UX en Sesión 2 (botón "Crear cuenta nueva" en Login).

## Rust shell — detalles

### Lifecycle
`src-tauri/src/sidecar.rs` envuelve `tauri-plugin-shell::sidecar()` y maneja:
1. Spawn al `setup` de Tauri (async task).
2. Lee stdout línea a línea, captura `LISTENING_ON=<port>` → arma `http://127.0.0.1:<port>` → emite `sidecar_ready`.
3. Si exit con código != 0 y no shutting_down: re-spawn hasta 3 veces en 60s. Emite `sidecar_restarting`.
4. Si supera 3 retries: emite `sidecar_failed`. Frontend muestra `SidecarFailed`.
5. Al `WindowEvent::CloseRequested`: shutdown + espera 5s.

### Token de sesión local
- Generado con `Uuid::new_v4()` en el constructor de `SidecarManager`.
- Expuesto solo via Tauri command `get_local_auth_token`. **El sidecar no lo conoce**.
- Open question del MVP: el sidecar debería leer el mismo token. Opciones: (a) Tauri lo escribe a un fichero efímero que el sidecar lee (y deletea), (b) Tauri lo pasa como env-var al spawn, (c) el sidecar lo genera y lo imprime a stdout (`LOCAL_TOKEN=<uuid>`) y Tauri lo captura, igual que `LISTENING_ON`. **Recomendación:** opción (c) — el sidecar es la fuente. Cambiar `sidecar.rs` y `commands.rs` cuando se implemente en Go.
- Por ahora `get_local_auth_token` devuelve un UUID que **no coincide** con el del sidecar. Para que la auth local funcione en Sesión 2, decidir e implementar (c) y actualizar este punto.

### Secure storage
- `secure_storage.rs` usa `keyring` crate (Windows Credential Manager / macOS Keychain).
- Service name: `app.cuadra.desktop`. Key arbitrario por entrada.
- Llaves usadas: `user_access_token`, `user_refresh_token`.

## Frontend — detalles

### Boot order
1. `App` monta → `useSidecarUrl` arranca.
2. Mientras no haya `sidecar_ready`, se renderiza `<SidecarFailed state="loading">`.
3. Al recibir la URL, `Bootstrapped` monta. `useHydrateAuth` corre y, si hay tokens en keychain, llama `GET /api/v1/auth/me`.
4. `RouterProvider` renderiza la primera ruta. Los guards esperan a `hydrated=true` antes de redirigir.

### `lib/api.ts`
- Wrapper sobre `fetch`. Lee URL+token via `tauri-bridge` con cache (`bootPromise`).
- Headers automáticos: `X-Local-Token`, `Authorization: Bearer <jwt>` (si autenticado).
- Refresh automático en 401 → rotación de tokens.
- Retry en 5xx con backoff cuadrático corto. 4xx no se reintenta.

### Sync indicator
- Polling de `/sync/status` cada 10s via React Query (`useSyncStatus`).
- Mapea estados de ADR-001 §3.9 a 3 niveles visuales: ok / warn / error.
- Modal con detalle (último sync, items pendientes, último error).

### Stores
- `useAuthStore`: user, gym, hydrated, readOnly. Sin persistencia — se hidrata desde `/auth/me` al boot, los tokens viven en keychain.
- `useSetupWizardStore`: paso, datos del wizard. **No persiste**; se hidratará en Sesión 2 con `useSetupStatus` para retomar el wizard donde quedó.
- `useUIStore`: sidebarCollapsed, theme. No persiste por ahora — agregar `zustand/middleware` `persist` cuando importe.

## Quality gates — cómo correrlos

```bash
pnpm install
pnpm typecheck     # tsc --noEmit
pnpm lint          # ESLint
pnpm build         # vite build → dist/
pnpm tauri:build   # requiere binarios + iconos; ver TODOs arriba
```

`pnpm tauri:dev` requiere los binarios del sidecar en `src-tauri/binaries/<target-triple>`. Sin ellos, Tauri arranca pero `useSidecarUrl` queda en `loading` para siempre.
