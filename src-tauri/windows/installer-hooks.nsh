; ============================================================================
; installer-hooks.nsh — Tauri 2 NSIS post-install hook para Tinta (Windows).
;
; Detecta si el HID Authentication Device Client (antes "DigitalPersona Lite
; Client") está presente y, si falta, lo descarga del server oficial de HID
; y lo instala en silent. El cliente FE necesita ese agente corriendo en
; localhost para que @digitalpersona/fingerprint pueda hablar con el lector
; U.are.U 4500 — sin él no hay biometría aunque Tinta esté instalada.
;
; ¿Por qué descarga y no bundle?
;   El EULA estándar de DigitalPersona prohíbe explícitamente redistribuir el
;   binario ("you may not reproduce, distribute, redistribute ... or bundle
;   ... with any fingerprint recognition product not authorized by
;   DigitalPersona"), y la guía oficial para devs pide enviar a los usuarios
;   al download link de HID. Plan B: el .exe lo sirve HID directamente; este
;   hook solo lo invoca. Ver ADR-004-ter para el razonamiento completo.
;
; Trade-off conocido:
;   Si la PC del gym no tiene internet en el momento de instalar, este hook
;   falla "blando": Tinta queda instalada y funcional, pero el lector queda
;   inactivo hasta que el dueño corra el setup de HID manualmente. El primer
;   handshake desktop↔cloud también requiere internet, así que el offline-
;   first del producto no se rompe — solo del momento de instalación.
;
; Documentación:
;   - Tauri 2 NSIS hooks: https://v2.tauri.app/distribute/windows-installer/
;   - Macros disponibles: NSIS_HOOK_PREINSTALL / NSIS_HOOK_POSTINSTALL /
;     NSIS_HOOK_PREUNINSTALL / NSIS_HOOK_POSTUNINSTALL.
; ============================================================================

; Pin a una versión específica del Lite Client. Bumpear a mano cuando HID
; publica nueva versión y validamos en VM Windows limpia. Apuntar a "latest"
; sería un footgun: cualquier release roto se distribuye instantáneamente a
; todo gym que instale Tinta nuevo. Hash SHA256 publicado por HID al lado
; del archivo en su store (verificado 2026-05-22).
!define TINTA_DP_URL "https://crossmatch.hid.gl/lite-client/store/5.2.0/HID%20Authentication%20Device%20Client.exe"
!define TINTA_DP_SHA256 "C5268289CF772FE288DEAC4CFC12E09BCC7055C29C7EBFA569D53570EE5E977A"
!define TINTA_DP_HELP_URL "https://crossmatch.hid.gl/lite-client/"
!define TINTA_DP_AGENT_BIN "$PROGRAMFILES64\DigitalPersona\Bin\dpcagnt.exe"
!define TINTA_DP_REG_NEW "SOFTWARE\HID Global\HID Authentication Device Client"
!define TINTA_DP_REG_LEGACY "SOFTWARE\DigitalPersona\Bin"
!define TINTA_DP_TEMP_EXE "$TEMP\tinta-hid-adc.exe"
!define TINTA_DP_TEMP_PS1 "$TEMP\tinta-dp-fetch.ps1"

; ─── Driver del U.are.U 4500 (separado del Lite Client) ─────────────────────
; El Lite Client (agente) NO incluye el driver kernel del reader. Validado
; empíricamente: instalación limpia del agente deja el reader con "Code 28
; - The drivers for this device are not installed" en Device Manager.
;
; URL: extraída via scrape del HTML de /drivers/49061 (Mi best-guess inicial
; era wrong — HID NO normaliza nombres a lowercase+underscores como otros
; SFW de su sitio; mantiene espacios y paréntesis, URL-encoded como
; %20 y %28%29 respectivamente). Verificado HTTP 200 / 5.48 MB /
; application/zip el 2026-05-24. Si HID rota el path, la descarga retorna
; 404 y caemos al fallback (MessageBox + abrir browser a la página
; oficial). NO bake-eamos hash porque HID no lo publica al lado del ZIP
; del driver (a diferencia del agente que sí lo expone). Confiamos en la
; firma WHQL de Microsoft del .cat embebido, que Windows valida al hacer
; pnputil /add-driver /install.
;
; ARCH: el driver del 49061 es x86_64 ONLY. En Windows 11 ARM64 el .sys no
; carga (kernel drivers no emulan). Documentado en README — Tinta no soporta
; Windows ARM64 hoy. El hook intenta el install de todas formas; pnputil
; falla limpio en ARM64 y caemos al MessageBox.
!define TINTA_DP_DRIVER_URL "https://www.hidglobal.com/sites/default/files/drivers/SFW-02580-DP4500%20Fingerprint%20Reader%20Driver%20%28Legacy%29%20with%20installer%20v.4.1.1.221.zip"
!define TINTA_DP_DRIVER_HELP_URL "https://www.hidglobal.com/drivers/49061"
!define TINTA_DP_DRIVER_TEMP_ZIP "$TEMP\tinta-dp-driver.zip"
!define TINTA_DP_DRIVER_TEMP_DIR "$TEMP\tinta-dp-driver"
!define TINTA_DP_DRIVER_TEMP_PS1 "$TEMP\tinta-dp-driver.ps1"

!macro NSIS_HOOK_POSTINSTALL
  Push $0
  Push $1
  Push $2

  DetailPrint "Verificando soporte para el lector de huella..."

  ; Las claves del Lite Client viven en la hive de 64-bit. Sin SetRegView 64
  ; el installer (NSIS de 32-bit) leería la vista WOW6432Node y daría falso
  ; negativo en máquinas que SÍ tienen DP instalado, gatillando una descarga
  ; innecesaria y una elevación UAC molesta.
  SetRegView 64

  ; Detección en cascada: 3 chequeos, cualquiera positivo gatilla skip.
  ;   1. Registry de la línea nueva (5.x — HID Global rebrand).
  ;   2. Registry legacy (4.x y anteriores — marca DigitalPersona).
  ;   3. File presence del agente (red de seguridad para instalaciones
  ;      portables, antivirus que limpiaron registry, etc).
  ReadRegStr $0 HKLM "${TINTA_DP_REG_NEW}" "InstallDir"
  StrCmp $0 "" tinta_dp_check_legacy tinta_dp_already

  tinta_dp_check_legacy:
    ReadRegStr $0 HKLM "${TINTA_DP_REG_LEGACY}" "InstallDir"
    StrCmp $0 "" tinta_dp_check_file tinta_dp_already

  tinta_dp_check_file:
    IfFileExists "${TINTA_DP_AGENT_BIN}" tinta_dp_already tinta_dp_download

  tinta_dp_download:
    DetailPrint "Lector de huella no detectado. Descargando soporte (~50 MB)."
    DetailPrint "Esto solo pasa una vez y necesita conexion a internet."

    ; Escribimos el fetch a un .ps1 temporal y le pasamos URL/path/hash como
    ; argv (param block). No los incrustamos como literales en el script
    ; porque $TEMP puede contener apóstrofes ("C:\Users\Juan's PC\...") y
    ; eso rompería cualquier PowerShell single-quoted string. Argv parser
    ; de PowerShell maneja apóstrofes en valores quoted sin pestañear.
    ;
    ; El .ps1 inline (sin variables): cualquier modificación a la lógica
    ; vive acá, NO en el server de HID ni en config remota. Convenciones
    ; de escape NSIS:
    ;   $$ → $   (PowerShell ve "$variable" en lugar de NSIS expandirla).
    ;   $\r$\n  → CRLF, necesario para que PowerShell parsee statements.
    ;   $\"     → comilla doble literal dentro de un single-quoted NSIS string.
    FileOpen $2 "${TINTA_DP_TEMP_PS1}" w
    FileWrite $2 'param([string]$$Url,[string]$$Out,[string]$$Expected)$\r$\n'
    FileWrite $2 '$$ErrorActionPreference = $\"Stop$\"$\r$\n'
    FileWrite $2 '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12$\r$\n'
    FileWrite $2 'try { Invoke-WebRequest -Uri $$Url -OutFile $$Out -UseBasicParsing -TimeoutSec 180 } catch { exit 1 }$\r$\n'
    FileWrite $2 '$$actual = (Get-FileHash $$Out -Algorithm SHA256).Hash$\r$\n'
    FileWrite $2 'if ($$actual -ne $$Expected) { Remove-Item $$Out -Force -ErrorAction SilentlyContinue; exit 2 }$\r$\n'
    FileWrite $2 'exit 0$\r$\n'
    FileClose $2

    ; -NoProfile evita correr cualquier $PROFILE custom del operador (suelen
    ;   tener side effects que rompen scripts no interactivos).
    ; -ExecutionPolicy Bypass evita el bloqueo de scripts no firmados sin
    ;   modificar la policy del sistema.
    ; Los tres args van quoted para sobrevivir paths/URLs con espacios.
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${TINTA_DP_TEMP_PS1}" "${TINTA_DP_URL}" "${TINTA_DP_TEMP_EXE}" "${TINTA_DP_SHA256}"'
    Pop $0
    Delete "${TINTA_DP_TEMP_PS1}"

    StrCmp $0 "0" tinta_dp_run
    StrCmp $0 "2" tinta_dp_hash_fail
    ; Cualquier otro código (1 = network/timeout, otro = PowerShell murió)
    ; cae a download_fail. El operador puede instalar manual después.
    Goto tinta_dp_download_fail

  tinta_dp_run:
    DetailPrint "Instalando soporte para el lector. Windows va a pedir permiso una vez."
    ; /s = wrapper-silent (wrapper InstallShield/MSI).
    ; /v"/qn" = pasa /qn al msiexec interno → cero UI del MSI.
    ; ExecWait bloquea hasta que el subproceso termine; el UAC del child
    ; aparece ahí (no hay forma de evitarlo, y tampoco queremos: es la
    ; ÚNICA elevación que pedimos en toda la instalación).
    ExecWait '"${TINTA_DP_TEMP_EXE}" /s /v"/qn"' $1
    Delete "${TINTA_DP_TEMP_EXE}"
    IntCmp $1 0 tinta_dp_run_ok tinta_dp_run_fail tinta_dp_run_fail

  tinta_dp_run_ok:
    DetailPrint "Soporte para el lector de huella instalado correctamente."
    Goto tinta_dp_done

  tinta_dp_run_fail:
    ; No abortamos la instalación de Tinta. La app sigue siendo útil sin
    ; biometría (búsqueda manual + PIN cubren el caso); el banner del FE
    ; le va a pedir al dueño que reintente.
    MessageBox MB_OK|MB_ICONINFORMATION "El soporte para el lector de huella no se instalo completamente (codigo $1). Tinta va a abrir igual y vas a poder operar sin el lector. Cuando puedas, instala el soporte manualmente desde:$\r$\n$\r$\n${TINTA_DP_HELP_URL}"
    Goto tinta_dp_done

  tinta_dp_download_fail:
    ; Limpieza defensiva: si la descarga falló a medias quedó un .exe
    ; truncado. Delete sobre archivo inexistente es no-op silencioso.
    Delete "${TINTA_DP_TEMP_EXE}"
    MessageBox MB_OK|MB_ICONINFORMATION "No pude descargar el soporte para el lector de huella. Puede ser que no haya conexion a internet o que el server de HID no haya respondido. Tinta queda instalada y funcional.$\r$\n$\r$\nCuando tengas internet, descarga el instalador desde:$\r$\n${TINTA_DP_HELP_URL}"
    Goto tinta_dp_done

  tinta_dp_hash_fail:
    ; Hash mismatch → MITM, asset rotado por HID sin avisar, o disco
    ; corrupto durante la descarga. Cualquiera de las tres: no ejecutamos
    ; ese binario, punto. Mejor pedir instalación manual.
    Delete "${TINTA_DP_TEMP_EXE}"
    MessageBox MB_OK|MB_ICONEXCLAMATION "El instalador del lector que descargue no coincide con la firma esperada — no lo voy a ejecutar por seguridad. Tinta queda instalada.$\r$\n$\r$\nDescarga el soporte manualmente desde:$\r$\n${TINTA_DP_HELP_URL}"
    Goto tinta_dp_done

  tinta_dp_already:
    DetailPrint "Soporte para el lector de huella ya esta instalado — sin cambios."
    Goto tinta_dp_done

  tinta_dp_done:
    ; ─── Driver del reader: check + auto-install, independiente del agente ─
    ; Agente y driver son DOS componentes separados. El agente puede estar
    ; instalado sin el driver (típico cuando la PC nunca tuvo un U.are.U
    ; antes). Sin driver, Device Manager muestra Code 28 y el FE recibe
    ; "no_device" eternamente. Esta sección lo cubre.
    DetailPrint "Verificando driver del lector de huella..."

    ; Detección: pnputil enum-drivers retorna todos los drivers del store.
    ; Si alguna fila matchea "dPersona" o "U.are.U", está registrado.
    ; Esto NO requiere que el reader esté conectado físicamente al instalar
    ; — chequeamos el driver store, no Device Manager.
    ; NSIS escape: '' NO es escape de apóstrofe; uso $\' para que PowerShell
    ; reciba el regex literal 'dPersona|U\.are\.U' en su Pattern parameter.
    nsExec::ExecToStack 'powershell.exe -NoProfile -Command "if (pnputil /enum-drivers | Select-String -Pattern $\'dPersona|U\.are\.U$\' -Quiet) { exit 0 } else { exit 1 }"'
    Pop $0
    Pop $1  ; output, descarted
    StrCmp $0 "0" tinta_drv_already tinta_drv_download

  tinta_drv_download:
    DetailPrint "Driver del lector no detectado. Descargando (~5 MB)."

    ; Script PowerShell que: (1) descarga el ZIP del driver desde HID,
    ; (2) lo extrae, (3) detecta arquitectura (x86 vs x64), (4) corre
    ; pnputil /add-driver /install. Mismo patrón que el .ps1 del agente
    ; — archivo temporal, argv quoted, sin escapar comillas inline.
    ;
    ; Exit codes:
    ;   0 = ok (driver registrado en el store, listo para bindear cuando
    ;       el reader se conecte físicamente)
    ;   1 = falló la descarga (404, sin internet, URL stale)
    ;   2 = falló la extracción (ZIP corrupto)
    ;   3 = falló pnputil (driver incompatible con arch — típicamente ARM64)
    FileOpen $2 "${TINTA_DP_DRIVER_TEMP_PS1}" w
    FileWrite $2 'param([string]$$Url,[string]$$ZipPath,[string]$$ExtractDir)$\r$\n'
    ; NOTA escape NSIS: dentro de un single-quoted NSIS string '...', usar
    ; `''` NO es escape de apóstrofe — NSIS lo lee como "cierra string,
    ; reabre string", produciendo múltiples argumentos a FileWrite (de ahí
    ; el error que vi en CI: "FileWrite expects 2 parameters, got 4").
    ; Las apóstrofes literales se escapan con $\' o se evitan usando comillas
    ; dobles en PowerShell, que dentro de '...' de NSIS son literales sin
    ; ningún escape necesario. Voy por las dobles — mismo patrón que el
    ; bloque del Lite Client arriba.
    FileWrite $2 '$$ErrorActionPreference = $\"Stop$\"$\r$\n'
    FileWrite $2 '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12$\r$\n'
    ; Headers de browser. hidglobal.com tiene Cloudflare Bot Management
    ; sobre /sites/default/files/drivers/... — un request "pelado" desde
    ; PowerShell se topa con challenge JS que no podemos resolver
    ; (PowerShell no ejecuta JS). Con User-Agent + Referer + Accept
    ; "realistas", CF usa heurística distinta y normalmente sirve el
    ; archivo estático sin challenge. NO garantiza pass al 100%; si CF
    ; aprieta más adelante, caemos al MessageBox que abre el browser
    ; (donde el JS challenge SÍ corre).
    FileWrite $2 '$$headers = @{ $\"User-Agent$\" = $\"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36$\"; $\"Accept$\" = $\"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8$\"; $\"Accept-Language$\" = $\"en-US,en;q=0.9$\"; $\"Referer$\" = $\"https://www.hidglobal.com/drivers/49061$\" }$\r$\n'
    FileWrite $2 'try { Invoke-WebRequest -Uri $$Url -OutFile $$ZipPath -UseBasicParsing -TimeoutSec 180 -Headers $$headers } catch { exit 1 }$\r$\n'
    FileWrite $2 'try { if (Test-Path $$ExtractDir) { Remove-Item $$ExtractDir -Recurse -Force } } catch {}$\r$\n'
    FileWrite $2 'try { Expand-Archive -Path $$ZipPath -DestinationPath $$ExtractDir -Force } catch { exit 2 }$\r$\n'
    ; Busca el INF en la subcarpeta x64. El ZIP tiene estructura
    ; Legacy-X.Y.Z/DP4500-X.Y.Z/x64/dPersona_x64.inf, así que -Recurse.
    FileWrite $2 '$$inf = Get-ChildItem -Path $$ExtractDir -Filter $\"dPersona_x64.inf$\" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1$\r$\n'
    FileWrite $2 'if (-not $$inf) { exit 2 }$\r$\n'
    ; pnputil necesita admin. El instalador de Tinta corre sin elevación
    ; (perfilUser por default en Tauri NSIS), así que pedimos elevación
    ; específicamente para este step via -Verb RunAs. Eso dispara un UAC
    ; adicional al del Lite Client — dos UAC en total en la primera
    ; instalación, una por componente. Acepable; el alternativo era forzar
    ; perMachine install para todo Tinta, lo cual agrega friction al 100%
    ; de instalaciones (incluyendo re-installs y updates donde el driver
    ; ya está). -NoNewWindow es incompatible con -Verb RunAs así que lo
    ; quitamos — el flash del console window es trade-off aceptable.
    ; pnputil retorna 0 en éxito, no-cero en cualquier fallo (firma, arch,
    ; INF inválido). Mapeamos cualquier fallo a exit 3.
    FileWrite $2 '$$proc = Start-Process -FilePath $\"pnputil.exe$\" -ArgumentList $\"/add-driver$\", $$inf.FullName, $\"/install$\" -Wait -PassThru -Verb RunAs$\r$\n'
    FileWrite $2 'if ($$proc.ExitCode -ne 0) { exit 3 }$\r$\n'
    FileWrite $2 'exit 0$\r$\n'
    FileClose $2

    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${TINTA_DP_DRIVER_TEMP_PS1}" "${TINTA_DP_DRIVER_URL}" "${TINTA_DP_DRIVER_TEMP_ZIP}" "${TINTA_DP_DRIVER_TEMP_DIR}"'
    Pop $0
    Delete "${TINTA_DP_DRIVER_TEMP_PS1}"
    Delete "${TINTA_DP_DRIVER_TEMP_ZIP}"
    ; El extract dir lo dejamos como evidencia para debug si algo falló.
    ; pnputil ya copió lo que necesitaba al driver store; no hace falta el
    ; staging. Si quieres limpiarlo: RMDir /r "${TINTA_DP_DRIVER_TEMP_DIR}".

    StrCmp $0 "0" tinta_drv_ok
    StrCmp $0 "1" tinta_drv_download_fail
    StrCmp $0 "2" tinta_drv_extract_fail
    StrCmp $0 "3" tinta_drv_install_fail
    ; Cualquier otro código (PowerShell murió, signal, etc.) → tratamos
    ; como download_fail (el branch más informativo + URL al manual).
    Goto tinta_drv_download_fail

  tinta_drv_ok:
    DetailPrint "Driver del lector de huella instalado en el driver store."
    DetailPrint "Cuando conectes el lector, Windows lo va a reconocer automaticamente."
    Goto tinta_drv_done

  tinta_drv_download_fail:
    ; URL del ZIP cambió, sin internet, o el host bloqueó la descarga.
    ; Abrimos browser a la página oficial — es 2 clicks más para el
    ; operador pero no es un dealbreaker.
    Delete "${TINTA_DP_DRIVER_TEMP_ZIP}"
    MessageBox MB_OK|MB_ICONINFORMATION "No pude descargar el driver del lector de huella automaticamente. Tinta queda instalada y funcional, pero el lector no va a responder hasta que instales el driver.$\r$\n$\r$\nVoy a abrirte la pagina oficial de HID. Descarga el archivo (.zip), descomprimelo, y ejecuta setup_x64.msi adentro de la carpeta x64.$\r$\n$\r$\n${TINTA_DP_DRIVER_HELP_URL}"
    ExecShell "open" "${TINTA_DP_DRIVER_HELP_URL}"
    Goto tinta_drv_done

  tinta_drv_extract_fail:
    Delete "${TINTA_DP_DRIVER_TEMP_ZIP}"
    MessageBox MB_OK|MB_ICONEXCLAMATION "El driver del lector se descargo pero el archivo parece corrupto. Tinta queda instalada. Descarga el driver manualmente desde:$\r$\n${TINTA_DP_DRIVER_HELP_URL}"
    ExecShell "open" "${TINTA_DP_DRIVER_HELP_URL}"
    Goto tinta_drv_done

  tinta_drv_install_fail:
    ; pnputil falló: arquitectura incompatible (ARM64 host), Windows
    ; rechazó por policy, o firma del driver vencida.
    MessageBox MB_OK|MB_ICONINFORMATION "El driver del lector se descargo pero Windows no lo acepto (posiblemente esta maquina es ARM64, donde el driver no funciona). Tinta queda instalada. Si necesitas usar el lector, asegurate de estar en Windows x86_64 e instala el driver manualmente desde:$\r$\n${TINTA_DP_DRIVER_HELP_URL}"
    Goto tinta_drv_done

  tinta_drv_already:
    DetailPrint "Driver del lector de huella ya esta registrado en el sistema."
    Goto tinta_drv_done

  tinta_drv_done:
    Pop $2
    Pop $1
    Pop $0
!macroend
