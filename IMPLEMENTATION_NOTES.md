# cuadra-desktop — IMPLEMENTATION NOTES

Notas técnicas y deuda conocida tras la **Sesión 1**. Léelo antes de continuar con sesiones siguientes.

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
