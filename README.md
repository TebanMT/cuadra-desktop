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

El installer Windows de Tinta integra dos componentes que el lector U.are.U
4500 necesita para funcionar:

1. **HID Authentication Device Client** (antes "DigitalPersona Lite Client") —
   el agente que la app del browser usa por WebSocket para hablar con el reader.
2. **Driver Legacy del U.are.U 4500** (`dPersona_x64.inf`, versión 4.1.1.221) —
   el driver kernel que liga el hardware USB al sistema. Sin esto, Device
   Manager muestra "Code 28: The drivers for this device are not installed".

La integración vive en `src-tauri/windows/installer-hooks.nsh` y se conecta
vía `bundle.windows.nsis.installerHooks` en `tauri.windows.conf.json`.

### Plataforma soportada

**Windows 10/11 x86_64 únicamente.** El driver del U.are.U 4500 que HID
publica es x86_64-only — no existen builds ARM64 (kernel drivers no
emulan en Windows on ARM). Implicaciones:

- **Para testing local en Mac Apple Silicon:** las VMs nativas (Parallels,
  VMware Fusion, UTM ARM) corren Windows 11 ARM64 y NO van a poder cargar
  el driver. Hay que usar UTM con x86_64 emulado vía QEMU (lento, ~10×) o
  una PC física x86_64 para validar el flujo biométrico end-to-end. El
  resto del producto (login, members, billing, sync, reports) sí es
  testeable en ARM64 — solo el reader queda inactivo.
- **Para clientes reales:** este NO es un problema. Los gyms mexicanos
  compran mini-PCs / laptops Intel/AMD baratas, todas x86_64.
- **Para CI:** los workflows ya buildean solo `x86_64-pc-windows-msvc`
  (ver `build-windows-only.yml` línea 65), consistente con esta
  restricción.

Si el hook detecta que la instalación del driver falla (típicamente
porque la máquina es ARM64), Tinta queda instalada y funcional sin
biometría; el `MessageBox` apunta al operador a instalar el driver
manualmente desde la página de HID.

### Cómo funciona

1. El `.exe` de Tinta-Setup NO bundlea ningún binario de HID. El EULA
   prohíbe redistribuirlos (ver `../adr/ADR-004-ter-installer-bundling.md`).
2. Después de copiar los archivos de Tinta, el hook NSIS hace **dos chequeos
   independientes en secuencia**:
   - **Lite Client (agente):** registry 5.x, registry legacy 4.x, o
     `C:\Program Files\DigitalPersona\Bin\dpcagnt.exe`.
   - **Driver:** `pnputil /enum-drivers` filtrado por `dPersona`/`U.are.U`.
3. Para cada uno, si ya está → skip silencioso. Si falta:
   - **Lite Client:** descarga el setup oficial desde
     `https://crossmatch.hid.gl/lite-client/store/5.2.0/...`, verifica
     SHA256 publicado por HID, ejecuta silent (`/s /v"/qn"`). 1 UAC.
   - **Driver:** descarga el ZIP del Legacy 4.1.1.221 desde
     `https://www.hidglobal.com/sites/default/files/drivers/...`,
     extrae con `Expand-Archive`, llama `pnputil /add-driver
     dPersona_x64.inf /install` con `-Verb RunAs`. 1 UAC adicional.
4. Si cualquiera de las dos descargas o instalaciones falla (sin internet,
   URL stale, hash mismatch, ARM64 incompatible, etc.) → `MessageBox`
   claro en español + (para el driver) abre el browser a la página oficial
   de HID. Tinta sigue arrancable; la app muestra el banner "lector
   desconectado" en la UI hasta que el operador complete la instalación
   manual.

Total UACs en la primera instalación: **2 (Lite Client + driver)**.
En instalaciones donde alguno ya está presente: 1 o 0.

### Requisito: internet en el momento de instalar

Si la PC del gym no tiene internet cuando se corre `Tinta-Setup.exe`, el
hook cae en los branches "instálalo manual" — la app queda instalada pero
el lector queda inactivo hasta que el dueño corra los setups por su
cuenta. Trade-off documentado y aceptado: el primer handshake desktop↔cloud
también requiere internet (ver memoria `project_first_handshake.md`), así que
no es una regresión vs el offline-first del producto en operación normal.

### Versión del Lite Client (pin manual)

La URL y el hash SHA256 están hardcodeados en `installer-hooks.nsh`. Para
bumpear:

1. Validar la nueva versión en una VM Windows 10/11 limpia x86_64 (sin DP
   previo).
2. Confirmar que `@digitalpersona/fingerprint` sigue conectando con la nueva
   versión del agente sin cambios al FE.
3. Actualizar `TINTA_DP_URL` y `TINTA_DP_SHA256` en el `.nsh`.
4. Cortar release de Tinta.

NO apuntar a "latest" — HID podría publicar una versión rota y se
distribuiría instantáneamente a todo gym nuevo.

### Versión del driver (pin manual)

`TINTA_DP_DRIVER_URL` en el `.nsh` es **best-guess** del path estable de
HID, basada en el patrón observado en otros SFW (ej.
`sfw-01357_reve_dtc1500_...zip`). HID no publica un endpoint estable
oficial, solo la página landing (`/drivers/49061`). Si HID rota el path:

- La descarga retorna 404.
- El hook cae al branch `tinta_drv_download_fail` y abre el browser a la
  página oficial con instrucciones claras en español.
- Cero impacto en la app instalada — Tinta sigue arrancable; biometría
  queda diferida hasta que el operador instale el driver a mano.

Para bumpear (cuando HID publique una versión nueva o rote la URL):

1. Bajar el ZIP desde [hidglobal.com/drivers/49061](https://www.hidglobal.com/drivers/49061)
   y capturar la URL real del download (DevTools → Network al click).
2. Validar el INF en una VM Windows 10/11 x86_64 limpia.
3. Actualizar `TINTA_DP_DRIVER_URL` en el `.nsh`.
4. NO hace falta hash — el `.cat` embebido en el ZIP está firmado WHQL
   por Microsoft, validado por Windows al hacer `pnputil /add-driver`.

### Cómo probarlo en VM Windows x86_64 limpia

> **Importante:** usa Windows **x86_64**, NO ARM64. En Mac Apple Silicon
> esto significa UTM con emulación QEMU (lento pero funcional) o un host
> Intel/AMD físico.

```powershell
# 1. Verificar que no hay DP previo (Lite Client + driver)
Get-ItemProperty 'HKLM:\SOFTWARE\HID Global\HID Authentication Device Client' -ErrorAction SilentlyContinue
Get-ItemProperty 'HKLM:\SOFTWARE\DigitalPersona\Bin' -ErrorAction SilentlyContinue
Test-Path 'C:\Program Files\DigitalPersona\Bin\dpcagnt.exe'
pnputil /enum-drivers | Select-String -Pattern 'dPersona|U\.are\.U'   # debe estar vacío

# 2. Correr Tinta-Setup_X.Y.Z_x64-setup.exe
# Observar:
#   - Barra de progreso "Descargando soporte (~50 MB)" + 1 UAC del Lite Client
#   - "Verificando driver del lector de huella..." + 2do UAC del pnputil
#   - DetailPrint "Driver del lector instalado en el driver store"

# 3. Confirmar post-install
Get-Service -Name 'DpHost' -ErrorAction SilentlyContinue   # agente como servicio (Running)
Test-Path 'C:\Program Files\DigitalPersona\Bin\dpcagnt.exe'  # binario del agente
pnputil /enum-drivers | Select-String -Pattern 'dPersona|U\.are\.U'  # driver registrado
Get-PnpDevice -InstanceId 'USB\VID_05BA*' -ErrorAction SilentlyContinue | Format-Table FriendlyName, Status

# 4. Conectar el U.are.U 4500 al USB de la VM (passthrough). Esperado:
#    Get-PnpDevice debe mostrar Status: OK. Si Class está vacío con Status
#    Unknown → probablemente la VM es ARM64 (ver sección "Plataforma soportada").

# 5. Abrir Tinta → ir a Ajustes → biometría → debería ver el reader.
```

Para test del modo "sin internet": desconectar la VM antes de correr el
setup, observar que el `MessageBox` claro aparece y que Tinta arranca igual.

## Branding y UI

- Color primario: deep navy (`#1E3A8A`, HSL 224 76% 33%).
- Tipografía: Inter (cargada vía `index.html`).
- shadcn primitives en `src/components/ui/`. Si falta uno, agregar con `pnpm dlx shadcn@latest add <componente>`.
