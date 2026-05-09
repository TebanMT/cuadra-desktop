#!/usr/bin/env bash
# upload-installers-to-r2.sh — sube los installers Tauri a Cloudflare R2.
#
# Caso de uso: build local manual (`make build-mac-arm64` etc) y querés
# publicar a dl.entinta.app sin tener que pushear un tag y esperar el CI.
# El CI normal (build-desktop.yml) hace lo mismo automático al taggear
# `desktop-v*` — este script es el "escape hatch".
#
# Setup (una sola vez):
#
#   1. Crear bucket en CF dashboard:
#        Cloudflare → R2 → Create bucket
#          Name: tinta-installers
#          Location: Automatic
#
#   2. Conectar bucket al subdominio dl.entinta.app:
#        Cloudflare → R2 → tinta-installers → Settings → Custom Domains
#          → Connect Domain → "dl.entinta.app"
#        CF crea el CNAME automáticamente en la zona entinta.app.
#
#   3. Crear API token con write access:
#        Cloudflare → R2 → Manage R2 API Tokens → Create
#          Permissions: Object Read & Write
#          Specify bucket: tinta-installers
#        Te da: access_key_id, secret_access_key, endpoint URL.
#
#   4. ~/.aws/credentials:
#        [r2-tinta]
#        aws_access_key_id = ...
#        aws_secret_access_key = ...
#        chmod 600 ~/.aws/credentials
#
#   5. (Opcional) Lifecycle rule en el bucket para limpiar versiones viejas:
#        CF dashboard → R2 → tinta-installers → Settings → Lifecycle
#          Rule: delete objects under desktop/v*/ older than 90 days
#          (versiones más viejas que 3 meses se borran auto)
#
# Uso:
#
#   VERSION=0.6.1 bash scripts/upload-installers-to-r2.sh
#
# Variables:
#   VERSION         (required) ej. "0.6.1" — usado en el path
#                   desktop/v$VERSION/...
#   BUCKET          default "tinta-installers"
#   R2_ENDPOINT     default lee de ~/.aws/config si está
#   R2_PROFILE      default "r2-tinta"
#   ARTIFACTS_DIR   default "src-tauri/target/release/bundle"
#   SKIP_LATEST     si =1, no actualiza /latest/ (solo /v$VERSION/)

set -euo pipefail

: "${VERSION:?Falta VERSION (ej: 0.6.1)}"

BUCKET="${BUCKET:-tinta-installers}"
R2_PROFILE="${R2_PROFILE:-r2-tinta}"
ARTIFACTS_DIR="${ARTIFACTS_DIR:-src-tauri/target/release/bundle}"

# Endpoint: tomar de env o construir desde el account ID + .r2.cloudflarestorage.com
if [ -z "${R2_ENDPOINT:-}" ]; then
  echo "::error:: Falta R2_ENDPOINT. Setealo o agregalo a tu shell:" >&2
  echo "  export R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com" >&2
  exit 1
fi

# Helper de upload
upload() {
  local file="$1"
  local key="$2"
  local cache="$3"
  local content_type="$4"

  if [ ! -f "$file" ]; then
    echo "  ⊘ skip: $file no existe (build no produjo este artifact?)"
    return 0
  fi

  local size=$(du -h "$file" | cut -f1)
  echo "  → ${key}  (${size})"

  aws s3 cp "${file}" "s3://${BUCKET}/${key}" \
    --endpoint-url "${R2_ENDPOINT}" \
    --profile "${R2_PROFILE}" \
    --cache-control "${cache}" \
    --content-type "${content_type}" \
    --only-show-errors
}

# Buscar los archivos producidos por la build (Tauri usa names variables
# según versión, así que matcheamos por extensión).
echo "→ Buscando installers en ${ARTIFACTS_DIR}..."
DMG_ARM64=$(find "${ARTIFACTS_DIR}" -name '*aarch64*.dmg' -o -name '*arm64*.dmg' 2>/dev/null | head -1 || true)
DMG_X64=$(find "${ARTIFACTS_DIR}" -name '*x86_64*.dmg' -o -name '*x64*.dmg' 2>/dev/null | head -1 || true)
EXE=$(find "${ARTIFACTS_DIR}" -name '*Setup*.exe' -o -name '*setup*.exe' 2>/dev/null | head -1 || true)
MSI=$(find "${ARTIFACTS_DIR}" -name '*.msi' 2>/dev/null | head -1 || true)

if [ -z "$DMG_ARM64$DMG_X64$EXE$MSI" ]; then
  echo "::error:: No se encontró ningún installer en ${ARTIFACTS_DIR}" >&2
  echo "Corre primero: pnpm tauri build (o el target específico)" >&2
  exit 1
fi

echo "→ Subiendo a s3://${BUCKET}/desktop/v${VERSION}/..."

# Versioned path — immutable, cache 1 año
[ -n "$DMG_ARM64" ] && upload "$DMG_ARM64" "desktop/v${VERSION}/Tinta-arm64.dmg"   "public, max-age=31536000, immutable" "application/x-apple-diskimage"
[ -n "$DMG_X64"   ] && upload "$DMG_X64"   "desktop/v${VERSION}/Tinta-x64.dmg"     "public, max-age=31536000, immutable" "application/x-apple-diskimage"
[ -n "$EXE"       ] && upload "$EXE"       "desktop/v${VERSION}/Tinta-Setup.exe"   "public, max-age=31536000, immutable" "application/octet-stream"
[ -n "$MSI"       ] && upload "$MSI"       "desktop/v${VERSION}/Tinta.msi"         "public, max-age=31536000, immutable" "application/x-msi"

# Latest alias — cache corto (5 min) para que nueva versión propague rápido
if [ "${SKIP_LATEST:-0}" != "1" ]; then
  echo "→ Actualizando alias /latest/..."
  [ -n "$DMG_ARM64" ] && upload "$DMG_ARM64" "desktop/latest/Tinta-arm64.dmg"   "public, max-age=300" "application/x-apple-diskimage"
  [ -n "$DMG_X64"   ] && upload "$DMG_X64"   "desktop/latest/Tinta-x64.dmg"     "public, max-age=300" "application/x-apple-diskimage"
  [ -n "$EXE"       ] && upload "$EXE"       "desktop/latest/Tinta-Setup.exe"   "public, max-age=300" "application/octet-stream"
  [ -n "$MSI"       ] && upload "$MSI"       "desktop/latest/Tinta.msi"         "public, max-age=300" "application/x-msi"
fi

echo ""
echo "✓ Publicado v${VERSION}"
echo ""
echo "Direct links públicos (asumiendo dl.entinta.app conectado al bucket):"
[ -n "$DMG_ARM64" ] && echo "  https://dl.entinta.app/desktop/latest/Tinta-arm64.dmg"
[ -n "$DMG_X64"   ] && echo "  https://dl.entinta.app/desktop/latest/Tinta-x64.dmg"
[ -n "$EXE"       ] && echo "  https://dl.entinta.app/desktop/latest/Tinta-Setup.exe"
[ -n "$MSI"       ] && echo "  https://dl.entinta.app/desktop/latest/Tinta.msi"
