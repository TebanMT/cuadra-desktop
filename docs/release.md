# Cómo cortar un release de Tinta Desktop

Este doc cubre el flujo de auto-updates implementado en ADR-005. Para los
instaladores web (descargas iniciales desde el landing), seguir usando el
tag `desktop-v*` que dispara `build-desktop.yml` — ese pipeline sube a
`dl.entinta.app` y NO toca el manifest del updater.

El flujo de **auto-update** usa el tag `v*.*.*` (SemVer) que dispara
`release.yml`.

---

## 1. Pre-requisitos (una sola vez)

### 1.1 Keypair ed25519 para el updater

Tauri firma cada bundle con una llave ed25519. La pública va embebida en el
binario (en `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`), la
privada vive en GitHub Actions como secret.

```bash
# Genera el keystore. Te pide pass twice; guardá esa pass.
pnpm tauri signer generate -w ~/.tauri/tinta-updater.key

# La salida imprime el contenido PRIVATE_KEY (base64) y la PUBLIC KEY.
# Si necesitás recuperar la pública después:
pnpm tauri signer sign --help   # (la public key está en el header del .pub)
cat ~/.tauri/tinta-updater.key.pub
```

Después:

1. **Public key** → reemplazar el valor de
   `src-tauri/tauri.conf.json::plugins.updater.pubkey` (hoy tiene el
   placeholder `REEMPLAZAR_CON_PUBKEY_REAL_VER_docs_release_md`). Commit y
   merge — el binario release-N+1 ya valida firmas con esta llave.
2. **Private key** → guardarla en GitHub Actions secrets:
   - `TAURI_SIGNING_PRIVATE_KEY` = contenido completo del archivo
     `~/.tauri/tinta-updater.key` (NO la pública, sí el privado completo
     con header `untrusted comment: ...`).
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = la pass del keystore.

> ⚠️ **Nunca** committear `~/.tauri/tinta-updater.key`. Si se filtra, hay
> que regenerar el par + bumpear la pubkey del binario en una release
> MAJOR (todos los clientes en versiones viejas quedan sin updates hasta
> que actualicen una vez con la pub vieja todavía válida).

### 1.2 Code signing Authenticode (Windows)

Pendiente hasta que tengamos el cert OV. Ver ADR-005 §3.1.

Mientras tanto, `release.yml` salta el step de signing si el secret
`WINDOWS_CERTIFICATE` no está configurado y deja un warning. Los binarios
sin firmar funcionan pero el SmartScreen los marca como "Unknown
publisher". Aceptable para el release MAJOR v1.0.0 si el cert no llegó.

Cuando el cert esté:

1. Exportar como `.pfx` con la pass.
2. `base64 -i cert.pfx -o cert.pfx.b64`.
3. Pegar el base64 en GitHub Secrets como `WINDOWS_CERTIFICATE`.
4. `WINDOWS_CERTIFICATE_PASSWORD` = la pass del PFX.

### 1.3 Secrets del cloud

Para que el pipeline registre la versión nueva en la tabla `releases` del
cloud automáticamente:

- `TINTA_CLOUD_URL` = `https://api.entinta.app`
- `RELEASES_ADMIN_TOKEN` = shared secret. Generar uno random
  (`openssl rand -hex 32`) y configurarlo:
  - En GH Secrets: `RELEASES_ADMIN_TOKEN=<hex>`
  - En el cloud (`.env` del VPS): `RELEASES_ADMIN_TOKEN=<mismo hex>`. El
    server lo lee al boot y deshabilita el endpoint si está vacío.

---

## 2. Cortar un release

### 2.1 Bump de versión

```bash
# Editar tres archivos al mismo tiempo:
#   1. src-tauri/tauri.conf.json::version
#   2. src-tauri/Cargo.toml::[package].version
#   3. package.json::version
# (idealmente con un script — por ahora manual hasta tener uno).

git add src-tauri/tauri.conf.json src-tauri/Cargo.toml package.json
git commit -m "release: bump version to X.Y.Z"
```

### 2.2 Tag + push

```bash
git tag vX.Y.Z
git push origin main vX.Y.Z
```

El tag dispara `release.yml`. Tarda ~15-20 min. Resultado:

1. **GitHub Releases** → `vX.Y.Z` con `.msi`, `.exe (NSIS)` y sus `.sig`
   adjuntos.
2. **Cloud manifest** → fila nueva en `releases` con `rollout_percent=5`.
3. **macOS internal** → DMG arm64 + x86_64 en artifacts del workflow.
   NO van al manifest público (ADR §3.2).

### 2.3 Subir el rollout

`release.yml` deja el release en 5% el día 0. Tienes que bumpear el % a
mano según las métricas (ADR §2.4):

```sql
-- Día +1 (si métricas OK): 25%
UPDATE releases SET rollout_percent = 25
WHERE version = 'X.Y.Z' AND target_platform = 'x86_64-pc-windows-msvc';

-- Día +3 (si métricas OK): 100%
UPDATE releases SET rollout_percent = 100
WHERE version = 'X.Y.Z' AND target_platform = 'x86_64-pc-windows-msvc';
```

Métricas a mirar antes de bumpear:

- `sync_*_total` en `/_internal/metrics` del cloud — no debe haber spike
  de `rejected_*`.
- Logs del cloud: ningún cliente nuevo reportando `migration_failed` en
  `/api/v1/telemetry/update-event`.

---

## 3. Si algo falla

### 3.1 Pausar el rollout

```sql
UPDATE releases SET rollout_percent = 0
WHERE version = 'X.Y.Z' AND target_platform = 'x86_64-pc-windows-msvc';
```

Nuevos clientes dejan de recibir la versión. Los que ya la aplicaron
NO se revierten — para eso, ver §3.3.

### 3.2 Registrar manualmente (si el POST automático falló)

Si el job `publish` perdió el POST al cloud, los binarios igual están en
GitHub Releases. Para registrar manualmente:

```sql
-- Sacar la signature del .sig adjunto al release:
--   curl -sL https://github.com/OWNER/REPO/releases/download/vX.Y.Z/Tinta_X.Y.Z_x64_en-US.msi.sig
INSERT INTO releases (
    version, target_platform, channel, url,
    signature_ed25519, notes, rollout_percent, force_immediate
) VALUES (
    'X.Y.Z',
    'x86_64-pc-windows-msvc',
    'stable',
    'https://github.com/OWNER/REPO/releases/download/vX.Y.Z/Tinta_X.Y.Z_x64_en-US.msi',
    '<contenido del .sig>',
    'Tinta X.Y.Z',
    5,
    FALSE
);
```

### 3.3 Forzar rollback de un cliente específico

Hot-fix manual desde el cloud (no automatizado todavía). El operador
reporta vía soporte → publicas la versión anterior como fila nueva con un
timestamp más reciente. El próximo check del updater verá la "última"
como la N-1 y descenderá.

```sql
-- Re-publicar la versión anterior con pub_date más nuevo para que sea la
-- "última" desde la perspectiva del updater.
INSERT INTO releases (
    version, target_platform, channel, url,
    signature_ed25519, notes, rollout_percent
) VALUES (
    'X.Y.W',  -- versión vieja conocida-buena
    'x86_64-pc-windows-msvc',
    'stable',
    '<url del .msi de X.Y.W>',
    '<signature de X.Y.W>',
    'Rollback de X.Y.Z',
    100
);
```

Esto cubre el caso "release N+1 roto, volver a N". Limitación: si N+1
metió una migración destructiva (no debería — pattern N+5 del ADR §6),
los datos no se recuperan.

---

## 4. SemVer dentro de Tinta

- **MAJOR (X.0.0)** — breaking change del schema o protocolo. Esta es la
  primera = `v1.0.0`. Bumpear sólo cuando la migración SQLite hace algo
  que clientes viejos NO pueden leer. El toast del operador es visible
  ("Tinta se actualizó a la versión 2.0").
- **MINOR (X.Y.0)** — features nuevas backward-compatible.
- **PATCH (X.Y.Z)** — bugfixes. Silenciosos.

Schema migrations llevan su propia numeración (ADR-002 §5). Un MAJOR
puede o no traer migración; un PATCH normalmente no.
