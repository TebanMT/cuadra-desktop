# Validación manual v1.1.0 — motor tinta-bio (prueba de fuego)

Checklist para el release que reemplaza el stack biométrico completo
(ADR-004-quater): Lite Client + NBIS → tinta-bio.exe + RTE 3.6.1.
**Nada de esto se automatiza**: el hook NSIS, el retiro del Lite Client y
el motor nativo sólo se validan contra el .exe INSTALADO en hardware real
(lección de mayo-2026: el WebSdk divergía entre `tauri dev` y WebView2;
misma política ahora).

## 0. Pre-requisitos del release (una vez, antes de buildear)

- [ ] **Tag de core v1.0.17** sobre main con los fixes biométricos de la
      validación del 26-jul (probe de colisión del primer enroll vs
      galería vacía; enroll a 4 capturas — FingerJet exige 4;
      enroll_failed terminal — la sesión zombie se tragaba los dedazos
      del check-in; no_match honesto con galería vacía). `TINTA_CORE_REF`
      ya pinea v1.0.17; sin el tag, el checkout del sidecar falla.
      **Ojo:** el release.yml de cuadra-core corre en tags `v*` → el push
      del tag también DESPLIEGA el cloud.

      ```bash
      cd ../cuadra-core && git tag v1.0.17 && git push origin v1.0.17
      ```

      (v1.0.15/v1.0.16 ya desplegados; v1.0.17 se taggea DESPUÉS de mergear
      el PR del fix de colisión, sobre main.)

- [x] Release `tinta-bio-v0.1.0` publicado en cuadra-core con
      `tinta-bio-win-x64.zip` (ya existe, validado en hardware 27-jul).
- [x] RTE en R2: `https://dl.entinta.app/vendor/hid/dp-bio-rte-3.6.1-x64.zip`
      (SHA256 `C9B35841…D978F` verificado end-to-end contra el dominio
      público; pineado en `installer-hooks.nsh`).
- [x] PR de esta rama (`feat/installer-tinta-bio`) mergeado (PR #17,
      main `e80d294`).

## 1. Build SIN publicar el update (validar antes de que nadie actualice)

**NO pushear el tag `v1.1.0` directo**: el push del tag registra el
manifest con rollout 100 y TODOS los gyms en ≤1.0.16 actualizan en
minutos, antes de validar. Para esta migración (installer radicalmente
distinto) el orden es:

- [ ] Correr `release.yml` por **workflow_dispatch** con:
      `tag=1.1.0`, `skip_manifest=true` (y `skip_macos=true` si quieres
      iterar rápido). Esto buildea firmado, sube a R2
      (`desktop/v1.1.0/Tinta-Setup.exe`) y **NO** toca el manifest.
      *Nota:* también actualiza `desktop/latest/` (el CTA del landing
      servirá 1.1.0 a instalaciones nuevas — aceptable, hoy las controlas
      tú).
- [ ] Guardar el output `nsis_signature` del job (o el artifact
      `*.exe.sig`) — se necesita para registrar el manifest a mano en el
      paso 3 **con la firma del MISMO binario que validaste** (un rebuild
      produce bytes y .sig distintos; no mezclar).

## 2. Prueba de fuego en la PC problemática del gym

La PC de recepción que se comió toda la saga del Lite Client (el install
rodado atrás 7336428 + registro huérfano + DpHostW). Es a la vez el mejor
test del **upgrade path** (tiene Tinta ≤1.0.16 + ADC instalados) y del
retiro del stack viejo.

### 2.1 Instalación / migración

- [ ] Descargar `https://dl.entinta.app/desktop/v1.1.0/Tinta-Setup.exe`
      y correrlo (doble click, 1 UAC).
- [ ] Observar en el detalle del installer:
      - "Retirando el soporte anterior del lector (Lite Client)..." →
        "Lite Client anterior desinstalado" (o el fallback "servicio
        detenido y deshabilitado" — ambos OK; MessageBox de error NO OK).
      - "Runtime del lector no detectado. Descargando (~175 MB)." →
        "Runtime del lector de huella instalado correctamente." (o
        "…al reiniciar la PC" si pide reboot — reiniciar y seguir).
- [ ] Post-install (PowerShell):

      ```powershell
      Get-Service DpHost -ErrorAction SilentlyContinue        # vacío, o Stopped+Disabled
      Test-Path 'C:\Program Files\DigitalPersona\Bin\dpfpdd.dll'   # True
      Test-Path 'C:\Program Files\DigitalPersona\Bin\dpfj.dll'     # True
      Test-Path "$env:ProgramFiles\Tinta\tinta-bio.exe"            # True
      Get-Process tinta-bio -ErrorAction SilentlyContinue     # corriendo (lo spawnea el sidecar)
      ```

### 2.2 Smoke biométrico (todo contra el .exe instalado)

- [ ] **Enroll**: alta de huella de un socio desde el modal (sesión de
      enroll por SSE; progreso de las 4 capturas; guardar OK). Intentar
      enrolar el MISMO dedo en otro socio → colisión con mensaje claro.
- [ ] **Check-in repetido**: 10+ dedazos seguidos en recepción — cada uno
      pinta resultado <1.5s, sin latencia creciente, sin "sordera" (el
      bug clásico del stack viejo: 1ª lee, 2ª jamás).
- [ ] **Logout → login → huella**: cerrar sesión del operador, entrar de
      nuevo, dedazo inmediato. Debe funcionar SIN reiniciar la app (el
      lector sordo post-relogin era bug de campo del stack viejo; el
      canal SSE se recicla por construcción — verificarlo en real).
- [ ] **USB out/in**: desconectar el U.are.U 4500 en caliente → la UI
      avisa lector desconectado; reconectarlo → se recupera solo (engine
      re-enumera: no_device → connected) y el siguiente dedazo funciona.
      Sin reiniciar app ni sidecar.
- [ ] **Kiosko + flotante**: abrir kiosko y modo flotante a la vez →
      dedazo → AMBAS superficies pintan el MISMO resultado (broadcast
      SSE), la main NO duplica feedback (regla anti-doble-feedback).
      Minimizar el flotante y verificar que un dedazo lo sigue
      alimentando (ya no existe el ruteo-por-foco del agente).
- [ ] **Reboot completo de la PC**: Windows arranca → Tinta arranca →
      dedazo funciona sin tocar nada (el RTE no depende de ningún
      servicio que haya que "levantar").
- [ ] **Sanity no-biométrico**: check-in manual, una venta, sync en verde
      (`/sync/status` sin atoradas).

### 2.3 (Recomendado) VM x86_64 limpia — install fresco

Cubre el gym NUEVO (sin DP previo): seguir la sección "Cómo probarlo en
VM Windows x86_64 limpia" del README (detección, descarga RTE, soft-fail
sin internet).

## 3. Rollout (sólo con TODO lo anterior en verde)

- [ ] Registrar el manifest apuntando al binario YA validado, con el
      `.sig` guardado en el paso 1:

      ```bash
      curl -sS -X POST "https://api.entinta.app/api/v1/admin/releases" \
        -H "Authorization: Bearer $RELEASES_ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$(jq -n --arg sig "$NSIS_SIG" '{
          version: "1.1.0", target_platform: "windows", channel: "stable",
          url: "https://dl.entinta.app/desktop/v1.1.0/Tinta-Setup.exe",
          signature_ed25519: $sig,
          notes: "Tinta 1.1.0 — nuevo motor del lector de huella.",
          rollout_percent: 100, force_immediate: false }')"
      ```

- [ ] Pushear el tag `v1.1.0` para el bookkeeping (GitHub Release de
      respaldo). El re-run del manifest choca contra el UNIQUE y no pisa
      nada; los binarios de R2 sí se re-suben (bytes nuevos ≠ validados)
      — si quieres conservar EXACTAMENTE lo validado, crea el GitHub
      Release a mano desde los artifacts del run del paso 1 en vez de
      taggear con build.
- [ ] Vigilar 24–48h el gym piloto tras el auto-update (el updater corre
      el NSIS en passive → el hook corre igual: retiro ADC + RTE).

> **Nota rollout 5%→100%:** el staged rollout del cloud existe
> (`inRolloutBucket`) pero el updater de Tauri aún NO manda
> `X-Tinta-Gym-ID`, así que un manifest con rollout<100 no llega a
> NADIE (comentario en release.yml). Hoy el "5%" real es esta validación
> manual en la PC del gym; el staged de verdad queda para cuando se
> cablee el header en el updater (backlog).

## 4. Rollback (si la prueba de fuego falla)

- Instalar `https://dl.entinta.app/desktop/v1.0.16/Tinta-Setup.exe`
  encima (downgrade limpio: el installer viejo re-instala el Lite Client
  que este hook retiró; el registro del manifest de 1.1.0 aún no existe,
  así que ningún otro gym se entera).
- Los FMDs enrolados con 1.1.0 NO sirven en 1.0.16 (formato
  `fmd_xml_b64` vs template NBIS) — en el gym piloto hoy no hay
  enrolados en producción, por eso el clean break es ahora.
