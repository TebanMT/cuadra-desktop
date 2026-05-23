# cuadra-desktop

App desktop de Cuadra (Tauri 2 + React + TypeScript). Embeda el sidecar Go (`cuadra-core/cmd/sidecar`) que provee la API local.

## Stack

- Tauri 2.x (Rust shell + WebView del sistema)
- React 18 + TypeScript (strict desactivado, como flex-control)
- Vite 5 + plugin React SWC
- Tailwind 3 + shadcn/ui (Radix)
- TanStack React Query 5
- React Router 6 con auth guards
- React Hook Form + Zod
- Zustand (estado cliente)
- date-fns con `es`
- pnpm

## Setup

```bash
# 1. Instalar deps
pnpm install

# 2. Compilar el sidecar Go (en otro repo)
cd ../cuadra-core
make sidecar          # produce binarios para el target actual
# Copia los binarios a cuadra-desktop/src-tauri/binaries/ con sufijo de target triple:
#   cuadra-sidecar-aarch64-apple-darwin
#   cuadra-sidecar-x86_64-apple-darwin
#   cuadra-sidecar-x86_64-pc-windows-msvc.exe

# 3. Tauri en dev
cd ../cuadra-desktop
pnpm tauri:dev
```

### Dev sin Tauri (frontend solo)

```bash
# Levanta el sidecar standalone en :9090
cd ../cuadra-core && make sidecar-standalone

# Vite con override de URL
cd ../cuadra-desktop
VITE_SIDECAR_URL=http://localhost:9090 pnpm dev
```

En este modo:
- Las llamadas Tauri (`secure_storage_*`, `print_pdf`, `quit_app`) son no-ops en navegador.
- El JWT se persiste en `localStorage` con prefijo `cuadra:`.

## Scripts

- `pnpm dev` — Vite (sin Tauri).
- `pnpm tauri:dev` — Tauri + Vite con sidecar embebido.
- `pnpm build` — build del frontend (a `dist/`).
- `pnpm tauri:build` — build instalador (.msi en Windows, .dmg en Mac).
- `pnpm typecheck` — `tsc --noEmit`.
- `pnpm lint` — ESLint.

## Estructura

Ver `IMPLEMENTATION_NOTES.md` para detalle. Resumen:

- `src/` — frontend (rutas, páginas, componentes, hooks, stores, strings).
- `src-tauri/` — shell Rust + comandos + sidecar lifecycle.
- `src-tauri/binaries/` — sidecar compilado, **gitignored** (excepto `.gitkeep`).

## Lecturas obligadas

- `../CLAUDE.md` — instrucciones del proyecto.
- `../CUADRA-USE-CASES.md` — UC-001 a UC-010 (Sesión 1).
- `../adr/ADR-003-tauri-go-sidecar.md` — fuente de verdad técnica.
- `../adr/ADR-001-sync-protocol.md` §3.9 — estados del indicador de sync.
- `./DESIGN.md` — principios de diseño visual.

## Lector de huella en Windows

El installer Windows de Tinta integra el flujo del **HID Authentication Device
Client** (antes "DigitalPersona Lite Client") — el agente que la app necesita
para hablar con el lector U.are.U 4500. La integración está en
`src-tauri/windows/installer-hooks.nsh` y se conecta vía `bundle.windows.nsis.installerHooks`
en `tauri.windows.conf.json`.

### Cómo funciona

1. El `.exe` de Tinta-Setup NO bundlea el binario de HID. El EULA de HID
   prohíbe redistribuirlo (ver `../adr/ADR-004-ter-installer-bundling.md`).
2. Después de copiar los archivos de Tinta, el hook NSIS detecta si el agente
   ya está instalado (registry 5.x, registry legacy 4.x, o presencia del
   binario en `C:\Program Files\DigitalPersona\Bin\dpcagnt.exe`).
3. Si **ya está** → skip silencioso.
4. Si **falta** → descarga el setup oficial desde
   `https://crossmatch.hid.gl/lite-client/store/5.2.0/...` con PowerShell
   `Invoke-WebRequest`, verifica el SHA256 publicado por HID, y lo ejecuta
   silent (`/s /v"/qn"`). Windows pide elevación UAC una sola vez para ese
   paso.
5. Si la descarga o instalación falla (sin internet, hash mismatch, exit code
   distinto de cero) → mensaje claro al operador en español + Tinta queda
   instalada y funcional sin el lector. La app muestra un banner pidiendo
   reintentar manualmente.

### Requisito: internet en el momento de instalar

Si la PC del gym no tiene internet cuando se corre `Tinta-Setup.exe`, el
hook cae en el branch "instálalo manual" — la app queda instalada pero el
lector queda inactivo hasta que el dueño corra el setup de HID por su
cuenta. Trade-off documentado y aceptado: el primer handshake desktop↔cloud
también requiere internet (ver memoria `project_first_handshake.md`), así que
no es una regresión vs el offline-first del producto en operación normal.

### Versión del Lite Client (pin manual)

La URL y el hash SHA256 están hardcodeados en `installer-hooks.nsh`. Para
bumpear:

1. Validar la nueva versión en una VM Windows 10/11 limpia (sin DP previo).
2. Confirmar que `@digitalpersona/fingerprint` sigue conectando con la nueva
   versión del agente sin cambios al FE.
3. Actualizar `TINTA_DP_URL` y `TINTA_DP_SHA256` en el `.nsh`.
4. Cortar release de Tinta.

NO apuntar a "latest" — HID podría publicar una versión rota y se
distribuiría instantáneamente a todo gym nuevo.

### Cómo probarlo en VM Windows limpia

```powershell
# 1. Verificar que no hay DP previo
Get-ItemProperty 'HKLM:\SOFTWARE\HID Global\HID Authentication Device Client' -ErrorAction SilentlyContinue
Get-ItemProperty 'HKLM:\SOFTWARE\DigitalPersona\Bin' -ErrorAction SilentlyContinue
Test-Path 'C:\Program Files\DigitalPersona\Bin\dpcagnt.exe'

# 2. Correr Tinta-Setup_X.Y.Z_x64-setup.exe
# Observar: barra de progreso "Descargando soporte (~50 MB)" + 1 UAC + "Instalando..."

# 3. Confirmar post-install
Get-Service -Name 'DpHostW' -ErrorAction SilentlyContinue   # agente como servicio
Test-Path 'C:\Program Files\DigitalPersona\Bin\dpcagnt.exe'  # binario

# 4. Abrir Tinta → conectar U.are.U 4500 → ir a Ajustes → biometría → debería
#    ver el reader.
```

Para test del modo "sin internet": desconectar la VM antes de correr el
setup, observar que el `MessageBox` claro aparece y que Tinta arranca igual.

## Branding y UI

- Color primario: deep navy (`#1E3A8A`, HSL 224 76% 33%).
- Tipografía: Inter (cargada vía `index.html`).
- shadcn primitives en `src/components/ui/`. Si falta uno, agregar con `pnpm dlx shadcn@latest add <componente>`.
