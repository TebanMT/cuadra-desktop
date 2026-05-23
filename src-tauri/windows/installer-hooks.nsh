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
    Pop $2
    Pop $1
    Pop $0
!macroend
