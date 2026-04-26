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

## Branding y UI

- Color primario: deep navy (`#1E3A8A`, HSL 224 76% 33%).
- Tipografía: Inter (cargada vía `index.html`).
- shadcn primitives en `src/components/ui/`. Si falta uno, agregar con `pnpm dlx shadcn@latest add <componente>`.
