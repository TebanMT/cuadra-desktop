#!/usr/bin/env bash
# prepare-nbis-windows.sh — descarga los binarios NBIS Windows (mindtct.exe +
# bozorth3.exe) desde un release de este mismo repo (cuadra-desktop) y los
# deja donde Tauri los espera para el bundle Windows.
#
# Pipeline:
#   1. cuadra-desktop/.github/workflows/build-nbis-windows.yml compila los dos
#      .exe con MSYS2/MinGW y publica un release `nbis-vX.Y` con los binarios
#      como assets (en este mismo repo).
#   2. cuadra-desktop/.github/workflows/build-desktop.yml (job Windows) llama
#      a este script ANTES de `pnpm tauri build` — usa el GITHUB_TOKEN del
#      runner para autenticarse contra los releases del propio repo, sin PAT
#      cross-repo.
#   3. Tauri los empaqueta vía `bundle.externalBin` (configuración en
#      src-tauri/tauri.windows.conf.json, sólo aplica al target Windows).
#      externalBin exige que cada binario tenga el sufijo del target triple
#      (igual que el sidecar `tinta-sidecar-<triple>.exe`); Tauri lo strippea
#      al bundlear y deja `mindtct.exe` / `bozorth3.exe` al lado del exe
#      principal. Por eso este script guarda los .exe CON el sufijo
#      `-x86_64-pc-windows-msvc`.
#   4. El sidecar Go (digitalpersona.go resolveBinaries) los encuentra al
#      lado de su propio .exe dentro del install dir y los ejecuta como
#      subprocess (ADR-004-bis).
#
# Uso (CI):
#
#   NBIS_VERSION=nbis-v1 GH_TOKEN=$GITHUB_TOKEN \
#     bash scripts/prepare-nbis-windows.sh
#
# Uso (local — sólo si querés probar el bundle Windows desde tu máquina, que
# en general no funciona desde macOS por el toolchain MSVC):
#
#   gh auth status                   # asegurate de estar logueado
#   NBIS_VERSION=nbis-v1 bash scripts/prepare-nbis-windows.sh
#
# Variables:
#   NBIS_VERSION    (required) tag del release de este repo, ej. "nbis-v1".
#   NBIS_REPO       default "TebanMT/cuadra-desktop" (override sólo si moviste
#                   los releases a otro repo).
#   GH_TOKEN        Token con scope `contents: read` sobre NBIS_REPO. En CI
#                   el GITHUB_TOKEN default del runner alcanza (mismo repo).
#                   Si está vacío, asumimos `gh auth` ya está configurado.
#   TARGET_TRIPLE   default "x86_64-pc-windows-msvc" — el sufijo que Tauri
#                   externalBin espera. Sólo cambialo si agregás un target
#                   Windows distinto (arm64, etc).
#   DEST_DIR        default "src-tauri/binaries/nbis"
#
# Idempotente: si los .exe ya existen y matchean el tag esperado (vía un
# .nbis-version stamp), no re-descarga.

set -euo pipefail

: "${NBIS_VERSION:?Falta NBIS_VERSION (ej: nbis-v1) — debe coincidir con un tag de release en NBIS_REPO}"

NBIS_REPO="${NBIS_REPO:-TebanMT/cuadra-desktop}"
TARGET_TRIPLE="${TARGET_TRIPLE:-x86_64-pc-windows-msvc}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST_DIR="${DEST_DIR:-$REPO_ROOT/src-tauri/binaries/nbis}"
STAMP_FILE="$DEST_DIR/.nbis-version"

# Nombres de salida con el sufijo del triple que externalBin exige. El asset
# en el release se llama `mindtct.exe` a secas — el sufijo lo agregamos acá.
MINDTCT_OUT="$DEST_DIR/mindtct-$TARGET_TRIPLE.exe"
BOZORTH3_OUT="$DEST_DIR/bozorth3-$TARGET_TRIPLE.exe"

mkdir -p "$DEST_DIR"

# Skip-cache si los assets esperados ya están y matchean la versión pedida.
# Útil en local cuando el dev itera sobre `pnpm tauri build` sin querer pegarle
# a la red en cada vuelta.
if [ -f "$STAMP_FILE" ] && [ -f "$MINDTCT_OUT" ] && [ -f "$BOZORTH3_OUT" ]; then
  current=$(cat "$STAMP_FILE")
  if [ "$current" = "$NBIS_VERSION" ]; then
    echo "✓ NBIS $NBIS_VERSION ya está en $DEST_DIR (skip download)"
    exit 0
  fi
fi

# Preferimos `gh` por simplicidad de auth con repos privados — en el runner
# de GitHub Actions viene preinstalado. Fallback a `curl` con header Bearer
# para entornos sin gh (raros, pero el código es 8 líneas más). Si ninguno
# está disponible, fallar fuerte para no construir un installer sin matcher.
download_with_gh() {
  local asset="$1"
  local out="$2"
  echo "  ↓ $asset (via gh release)"
  gh release download "$NBIS_VERSION" \
    --repo "$NBIS_REPO" \
    --pattern "$asset" \
    --output "$out" \
    --clobber
}

download_with_curl() {
  local asset="$1"
  local out="$2"
  if [ -z "${GH_TOKEN:-}" ]; then
    echo "::error:: GH_TOKEN vacío y gh CLI no disponible — no hay forma de autenticar contra el release" >&2
    exit 1
  fi
  # La API REST de GitHub permite resolver el asset por nombre dentro del tag,
  # pero requiere dos llamadas (release-by-tag → assets[]). Más simple: usar
  # el endpoint /releases/tags/{tag} y filtrar con jq. Si no hay jq tampoco,
  # caemos al endpoint legacy de assets que sí da redirección directa.
  echo "  ↓ $asset (via curl REST)"
  local api="https://api.github.com/repos/$NBIS_REPO/releases/tags/$NBIS_VERSION"
  local asset_url
  asset_url=$(curl -fsSL \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "$api" \
    | grep -oE "\"url\": \"[^\"]+/assets/[0-9]+\"" \
    | sed 's/"url": "\(.*\)"/\1/' \
    | while read -r url; do
        # Cada URL es del shape /assets/<id>. Necesitamos el name asociado
        # para filtrar el correcto. Hacemos una segunda llamada por asset —
        # son <10 assets en este release, costo despreciable.
        name=$(curl -fsSL \
          -H "Authorization: Bearer $GH_TOKEN" \
          -H "Accept: application/vnd.github+json" \
          "$url" | grep -oE "\"name\": \"[^\"]+\"" | head -1 | sed 's/"name": "\(.*\)"/\1/')
        if [ "$name" = "$asset" ]; then
          echo "$url"
          break
        fi
      done)
  if [ -z "$asset_url" ]; then
    echo "::error:: No encontré el asset '$asset' en $NBIS_REPO@$NBIS_VERSION" >&2
    exit 1
  fi
  curl -fsSL \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/octet-stream" \
    -o "$out" \
    "$asset_url"
}

download_asset() {
  local asset="$1"
  local out="$2"
  if command -v gh >/dev/null 2>&1; then
    download_with_gh "$asset" "$out"
  else
    download_with_curl "$asset" "$out"
  fi
}

echo "→ Descargando NBIS $NBIS_VERSION desde $NBIS_REPO"
download_asset "mindtct.exe" "$MINDTCT_OUT"
download_asset "bozorth3.exe" "$BOZORTH3_OUT"

# Defensa: que tengan tamaño razonable (>50KB) — un .exe NBIS stripped pesa
# ~100KB, cualquier asset corrupto sería detectable acá.
for f in "$MINDTCT_OUT" "$BOZORTH3_OUT"; do
  size=$(wc -c < "$f")
  if [ "$size" -lt 50000 ]; then
    echo "::error:: $f parece corrupto (tamaño=$size bytes, esperado >50KB)" >&2
    exit 1
  fi
done

echo "$NBIS_VERSION" > "$STAMP_FILE"
echo "✓ Listos en $DEST_DIR"
ls -lh "$DEST_DIR"
