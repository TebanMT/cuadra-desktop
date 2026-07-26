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

Desde ADR-004-quater el subsistema biométrico es el **motor nativo
tinta-bio** (dos componentes, dos rutas de distribución):

1. **`tinta-bio.exe`** — helper C#/.NET 8 (cuadra-core `tools/tinta-bio`)
   que captura, extrae e identifica con FingerJet. Viaja DENTRO del bundle
   (`bundle.resources` en `tauri.windows.conf.json`, staging vía
   `scripts/prepare-tinta-bio-windows.sh`) y aterriza junto al sidecar, que
   lo spawnea por NDJSON stdio. El EULA del Biometric SDK §1.1(c) permite
   redistribuirlo dentro de la app.
2. **RTE del DigitalPersona Biometric SDK 3.6.1** — el runtime nativo
   (dpfpdd/dpfj y su capa de soporte) **más el driver** del U.are.U 4500.
   Lo instala el hook NSIS en silent desde el mirror R2
   (`dl.entinta.app/vendor/hid/dp-bio-rte-*.zip`, SHA256 pineado).

**REGLA anti-sombra:** el RTE es la ÚNICA fuente del runtime nativo. Jamás
copiar DLLs del SDK junto a los exes — un subconjunto le hace sombra al
runtime instalado y el lector muere en `no_device` silencioso.

Ya NO existen el HID Authentication Device Client ("Lite Client") ni el
paso separado del driver: el hook los RETIRA — en PCs que actualizan desde
Tinta ≤ v1.0.16 desinstala el Lite Client (o detiene + deshabilita su
servicio DpHost) porque su sesión con el lector bloquea el open EXCLUSIVE
del motor nuevo (DEVICE_BUSY).

La integración vive en `src-tauri/windows/installer-hooks.nsh` y se conecta
vía `bundle.windows.nsis.installerHooks` en `tauri.windows.conf.json`.

### Plataforma soportada

**Windows 10/11 x86_64 únicamente.** El RTE que bundleamos es el build
x64 del SDK y el driver del U.are.U 4500 es x86_64-only — no existen
builds ARM64 (kernel drivers no emulan en Windows on ARM). Implicaciones:

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

### Setup de VM Windows x64 en UTM (Mac Apple Silicon)

Si tu host es Mac M-series y necesitas validar el `.exe` end-to-end (con
flujo biométrico incluido), UTM con emulación QEMU es la única ruta:

1. **Instalar UTM**: [mac.getutm.app](https://mac.getutm.app) (~30 MB, MIT).
2. **Bajar ISO de Windows 11 x64** desde Microsoft directo:
   [https://www.microsoft.com/software-download/windows11](https://www.microsoft.com/software-download/windows11)
   → "Download Windows 11 Disk Image (ISO) for x64 devices". ~5 GB.
3. **Crear VM en UTM**:
   - File → New → **Emulate** (NO "Virtualize" — virtualize es solo ARM64).
   - Operating System: Windows.
   - Architecture: **x86_64** (importantísimo, NO aarch64).
   - Boot ISO: el archivo descargado.
   - RAM: 8 GB mínimo (cuanto más mejor — la emulación es CPU-bound).
   - CPU cores: dejá 4-6 asignados al guest.
   - Storage: 60 GB virtual disk.
   - TPM: habilítalo en Settings → System (Windows 11 lo exige).
4. **Instalar Windows**: proceso normal. Esperar 1-2 horas — la emulación
   QEMU sobre Apple Silicon es lentísima. Una vez instalado, los reboots
   subsecuentes son ~5-10 min.
5. **USB passthrough del U.are.U** (con VM corriendo): Devices → USB →
   seleccionar "DigitalPersona U.are.U 4500" en la lista.
6. **Verificar arch antes de bajar el .exe**:
   ```powershell
   Get-CimInstance Win32_OperatingSystem | Select OSArchitecture
   ```
   Debe decir `OSArchitecture : 64-bit` (NO "ARM 64-bit Processor"). Si
   dice ARM64, te equivocaste de architecture en el paso 3.

#### Quirks conocidos de UTM x86_64 emulado

- **Unblock-File necesario en cada descarga.** Cuando bajes el `.exe`
  desde `dl.entinta.app` (o desde el artifact del GitHub Action),
  Windows le pone Mark-of-the-Web. Antes de doble-click:
  ```powershell
  Unblock-File "$env:USERPROFILE\Downloads\Tinta-Setup.exe"
  ```
  Y al ejecutar, SmartScreen va a mostrar "Windows protected your PC" —
  click "More info" → "Run anyway". (Esto desaparece cuando tengamos
  code-signing cert en V1.0+ — ver `build-desktop.yml:24-27`.)
- **Velocidad para iterar:** correr el .exe en UTM toma ~30s (vs ~5s
  nativo). Suficiente para validar el hook, no para dev loop.
- **Si el USB passthrough se cuelga:** Devices → USB → unmark y remark
  el reader. UTM a veces pierde el binding cuando suspendes la VM.

Si el hook detecta que la instalación del RTE falla (típicamente porque
la máquina es ARM64 o no hay internet), Tinta queda instalada y funcional
sin biometría; el `MessageBox` apunta al operador a la instalación manual
(descargar el zip del mirror, descomprimir, `setup.exe`).

### Cómo funciona

1. El `.exe` de Tinta-Setup bundlea `tinta-bio.exe` (permitido: EULA
   §1.1(c), redistribución en object code dentro de la app) pero NO el
   runtime nativo — ese lo instala el hook. Ver
   `../adr/ADR-004-quater-motor-nativo.md`.
2. Después de copiar los archivos de Tinta, el hook NSIS corre **cuatro
   pasos en secuencia**:
   - **Migración:** si existe el servicio `DpHost` (Lite Client, Tinta
     ≤ v1.0.16), lo desinstala vía `msiexec /x <ProductCode del registro>`;
     si falla, detiene + deshabilita el servicio. Sin esto el motor nuevo
     recibe DEVICE_BUSY al abrir el lector en EXCLUSIVE.
   - **¿RTE ya instalado?** ProductCode del MSI 3.6.1
     (`{7FC7AAC6-...}`) o `dpfpdd.dll` + `dpfj.dll` en
     `Program Files\DigitalPersona\Bin` (runtime funcional por otra vía,
     p.ej. el SDK de dev) → skip.
   - **Pre-check de conflicto:** DigitalPersona viejo (One Touch /
     U.are.U SDK 4.x — típico en PCs que migran de HDLEON) → aviso
     accionable, sin instalar encima.
   - **Descarga + install:** baja el zip del RTE (~175 MB) del mirror R2,
     verifica SHA256 pineado, extrae y corre el InstallShield en silent
     (`setup.exe /s /v"/qn /norestart /l*v <log>"` — los flags del
     `InstallOnly.bat` oficial del SDK). El RTE instala runtime + driver.
3. Si cualquier paso falla (sin internet, hash mismatch, ARM64, MSI
   1603...) → `MessageBox` claro en español con la ruta manual. Tinta
   sigue arrancable; la app muestra el aviso de lector en la UI.

Total UACs en la primera instalación: **1** (la elevación perMachine del
installer cubre msiexec y el setup del RTE — ver header del `.nsh`).

### Requisito: internet en el momento de instalar

Si la PC del gym no tiene internet cuando se corre `Tinta-Setup.exe`, el
hook cae en los branches "instálalo manual" — la app queda instalada pero
el lector queda inactivo hasta que el dueño corra el setup del RTE por su
cuenta. Trade-off documentado y aceptado: el primer handshake desktop↔cloud
también requiere internet (ver memoria `project_first_handshake.md`), así que
no es una regresión vs el offline-first del producto en operación normal.

### Versión del RTE (pin manual)

URL, SHA256 y ProductCode están hardcodeados en `installer-hooks.nsh`.
Para bumpear cuando HID publique un Biometric SDK nuevo:

1. Zipear la carpeta `RTE/x64` del SDK nuevo y subirla a R2 con nombre
   versionado (`vendor/hid/dp-bio-rte-X.Y.Z-x64.zip`, cache immutable).
2. Actualizar `TINTA_RTE_URL`, `TINTA_RTE_SHA256` y
   `TINTA_RTE_PRODUCT_KEY` (el ProductCode sale del `Setup.ini` del RTE).
3. Rebuildear `tinta-bio.exe` contra el SDK nuevo si cambió el API
   (release `tinta-bio-v*` en cuadra-core + bump de
   `TINTA_BIO_RELEASE_TAG` en los workflows).
4. Validar en VM Windows 10/11 x86_64 limpia + PC con la versión anterior
   (upgrade path). Cortar release de Tinta.

NO apuntar a "latest" ni reusar el nombre del zip en R2 — el pin SHA256 y
el cache immutable dependen de que cada versión sea un objeto nuevo.

### Cómo probarlo en VM Windows x86_64 limpia

> **Importante:** usa Windows **x86_64**, NO ARM64. En Mac Apple Silicon
> esto significa UTM con emulación QEMU (lento pero funcional) o un host
> Intel/AMD físico.

```powershell
# 1. Verificar que no hay DP previo (runtime, Lite Client, One Touch)
Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{7FC7AAC6-4A7E-4DA4-92ED-D37FB6BDCA18}' -ErrorAction SilentlyContinue
Test-Path 'C:\Program Files\DigitalPersona\Bin\dpfpdd.dll'
Test-Path 'C:\Program Files\DigitalPersona\Bin\dpfj.dll'
Get-Service -Name 'DpHost' -ErrorAction SilentlyContinue   # debe estar vacío

# 2. Correr Tinta-Setup_X.Y.Z_x64-setup.exe (1 solo UAC)
# Observar en el detalle del installer:
#   - "Verificando el runtime del lector de huella..."
#   - "Runtime del lector no detectado. Descargando (~175 MB)."
#   - "Instalando el runtime del lector de huella..."
#   - "Runtime del lector de huella instalado correctamente."

# 3. Confirmar post-install
Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{7FC7AAC6-4A7E-4DA4-92ED-D37FB6BDCA18}' | Select DisplayName, DisplayVersion
Test-Path 'C:\Program Files\DigitalPersona\Bin\dpfpdd.dll'   # True
Test-Path 'C:\Program Files\DigitalPersona\Bin\dpfj.dll'     # True
Test-Path "$env:ProgramFiles\Tinta\tinta-bio.exe"            # True (bundleado)
Get-PnpDevice -InstanceId 'USB\VID_05BA*' -ErrorAction SilentlyContinue | Format-Table FriendlyName, Status

# 4. Conectar el U.are.U 4500 al USB de la VM (passthrough). Esperado:
#    Get-PnpDevice debe mostrar Status: OK. Si Class está vacío con Status
#    Unknown → probablemente la VM es ARM64 (ver sección "Plataforma soportada").

# 5. Abrir Tinta → Ajustes → biometría → debería ver el reader (vía el
#    SSE del sidecar; ya no hay agente ni WebSocket).
```

Para test del modo "sin internet": desconectar la VM antes de correr el
setup, observar que el `MessageBox` claro aparece y que Tinta arranca igual.

Para test del **upgrade path** (migración del Lite Client): instalar
primero un Tinta ≤ v1.0.16 (deja el ADC + DpHost), luego el nuevo setup.
Esperado: "Retirando el soporte anterior del lector..." y al final
`Get-Service DpHost` vacío (desinstalado) o `Stopped`+`Disabled`.

## Branding y UI

- Color primario: deep navy (`#1E3A8A`, HSL 224 76% 33%).
- Tipografía: Inter (cargada vía `index.html`).
- shadcn primitives en `src/components/ui/`. Si falta uno, agregar con `pnpm dlx shadcn@latest add <componente>`.
