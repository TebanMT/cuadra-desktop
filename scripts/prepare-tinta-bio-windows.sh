#!/usr/bin/env bash
# prepare-tinta-bio-windows.sh — descarga el motor biométrico tinta-bio.exe
# desde un release de cuadra-core y lo deja donde Tauri lo espera para el
# bundle Windows.
#
# Pipeline:
#   1. cuadra-core/.github/workflows/build-tinta-bio-windows.yml compila el
#      helper C#/.NET 8 (self-contained win-x64) y publica un release
#      `tinta-bio-vX.Y.Z` con `tinta-bio-win-x64.zip` como asset (el zip trae
#      tinta-bio.exe + BUILD_INFO.txt de provenance).
#   2. cuadra-desktop/.github/workflows/release.yml (job Windows) llama a
#      este script ANTES de `pnpm tauri build`. cuadra-core es repo privado
#      DISTINTO a este, así que el GITHUB_TOKEN del runner no alcanza — se
#      usa el PAT TINTA_CORE_TOKEN (el mismo del checkout del sidecar).
#   3. Tauri lo empaqueta vía `bundle.resources` (tauri.windows.conf.json)
#      con destino `./` → aterriza al lado de Tinta.exe y del sidecar en el
#      install dir. A diferencia de externalBin, resources NO exige sufijo
#      de target triple, así que el .exe conserva su nombre real.
#   4. El sidecar Go (shared/biometric/engine.go resolvePath) lo encuentra
#      junto a su propio .exe y lo spawnea como proceso hijo (NDJSON stdio).
#
# OJO: tinta-bio.exe NO es autosuficiente — necesita el runtime nativo del
# DigitalPersona Biometric SDK (RTE) instalado en la PC (dpfpdd/dpfj y su
# capa de soporte). Eso lo instala el hook NSIS (installer-hooks.nsh), NUNCA
# se copian DLLs del SDK junto al exe (les harían sombra al runtime real y
# el lector muere en no_device silencioso — visto en campo).
#
# Uso (CI):
#
#   TINTA_BIO_RELEASE_TAG=tinta-bio-v0.1.0 GH_TOKEN=$TINTA_CORE_TOKEN \
#     bash scripts/prepare-tinta-bio-windows.sh
#
# Uso (local — sólo si quieres probar el bundle Windows desde tu máquina,
# que en general no funciona desde macOS por el toolchain MSVC):
#
#   gh auth status                   # asegúrate de estar logueado
#   TINTA_BIO_RELEASE_TAG=tinta-bio-v0.1.0 bash scripts/prepare-tinta-bio-windows.sh
#
# Variables:
#   TINTA_BIO_RELEASE_TAG (required) tag del release en cuadra-core, ej.
#                         "tinta-bio-v0.1.0".
#   TINTA_BIO_REPO        default "TebanMT/cuadra-core".
#   GH_TOKEN              Token con scope `Contents: Read` sobre el repo de
#                         arriba. En CI: secrets.TINTA_CORE_TOKEN. Si está
#                         vacío, asumimos `gh auth` ya configurado.
#   DEST_DIR              default "src-tauri/binaries/tinta-bio"
#
# Idempotente: si el .exe ya existe y matchea el tag esperado (vía un
# .tinta-bio-version stamp), no re-descarga.

set -euo pipefail

: "${TINTA_BIO_RELEASE_TAG:?Falta TINTA_BIO_RELEASE_TAG (ej: tinta-bio-v0.1.0) — debe coincidir con un tag de release en TINTA_BIO_REPO}"

TINTA_BIO_REPO="${TINTA_BIO_REPO:-TebanMT/cuadra-core}"
ASSET_NAME="tinta-bio-win-x64.zip"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST_DIR="${DEST_DIR:-$REPO_ROOT/src-tauri/binaries/tinta-bio}"
STAMP_FILE="$DEST_DIR/.tinta-bio-version"
EXE_OUT="$DEST_DIR/tinta-bio.exe"
ZIP_TMP="$DEST_DIR/$ASSET_NAME"

mkdir -p "$DEST_DIR"

# Skip-cache si el exe ya está y matchea la versión pedida. Útil en local
# cuando el dev itera sobre `pnpm tauri build` sin pegarle a la red.
if [ -f "$STAMP_FILE" ] && [ -f "$EXE_OUT" ]; then
  current=$(cat "$STAMP_FILE")
  if [ "$current" = "$TINTA_BIO_RELEASE_TAG" ]; then
    echo "✓ tinta-bio $TINTA_BIO_RELEASE_TAG ya está en $DEST_DIR (skip download)"
    exit 0
  fi
fi

# Preferimos `gh` por simplicidad de auth con repos privados — en el runner
# de GitHub Actions viene preinstalado. Fallback a `curl` REST para entornos
# sin gh. Si ninguno funciona, fallar fuerte: un installer sin motor
# biométrico es un bundle roto.
download_with_gh() {
  echo "  ↓ $ASSET_NAME (via gh release)"
  gh release download "$TINTA_BIO_RELEASE_TAG" \
    --repo "$TINTA_BIO_REPO" \
    --pattern "$ASSET_NAME" \
    --output "$ZIP_TMP" \
    --clobber
}

download_with_curl() {
  if [ -z "${GH_TOKEN:-}" ]; then
    echo "::error:: GH_TOKEN vacío y gh CLI no disponible — no hay forma de autenticar contra el release" >&2
    exit 1
  fi
  echo "  ↓ $ASSET_NAME (via curl REST)"
  local api="https://api.github.com/repos/$TINTA_BIO_REPO/releases/tags/$TINTA_BIO_RELEASE_TAG"
  local asset_url
  asset_url=$(curl -fsSL \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "$api" \
    | grep -oE "\"url\": \"[^\"]+/assets/[0-9]+\"" \
    | sed 's/"url": "\(.*\)"/\1/' \
    | while read -r url; do
        name=$(curl -fsSL \
          -H "Authorization: Bearer $GH_TOKEN" \
          -H "Accept: application/vnd.github+json" \
          "$url" | grep -oE "\"name\": \"[^\"]+\"" | head -1 | sed 's/"name": "\(.*\)"/\1/')
        if [ "$name" = "$ASSET_NAME" ]; then
          echo "$url"
          break
        fi
      done)
  if [ -z "$asset_url" ]; then
    echo "::error:: No encontré el asset '$ASSET_NAME' en $TINTA_BIO_REPO@$TINTA_BIO_RELEASE_TAG" >&2
    exit 1
  fi
  curl -fsSL \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/octet-stream" \
    -o "$ZIP_TMP" \
    "$asset_url"
}

echo "→ Descargando tinta-bio $TINTA_BIO_RELEASE_TAG desde $TINTA_BIO_REPO"
if command -v gh >/dev/null 2>&1; then
  download_with_gh
else
  download_with_curl
fi

# El zip trae tinta-bio.exe + BUILD_INFO.txt. Extraemos ambos: el exe es lo
# que se bundlea; el BUILD_INFO queda en el dir de staging como provenance
# (no viaja en el installer).
unzip -o -q "$ZIP_TMP" -d "$DEST_DIR"
rm -f "$ZIP_TMP"

if [ ! -f "$EXE_OUT" ]; then
  echo "::error:: El asset $ASSET_NAME no contenía tinta-bio.exe" >&2
  exit 1
fi

# Defensa: un publish .NET self-contained pesa decenas de MB — cualquier
# descarga truncada o asset equivocado se detecta acá.
size=$(wc -c < "$EXE_OUT")
if [ "$size" -lt 10000000 ]; then
  echo "::error:: $EXE_OUT parece corrupto (tamaño=$size bytes, esperado >10MB)" >&2
  exit 1
fi

echo "$TINTA_BIO_RELEASE_TAG" > "$STAMP_FILE"
echo "✓ Listo en $DEST_DIR"
ls -lh "$DEST_DIR"
