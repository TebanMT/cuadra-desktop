; ============================================================================
; installer-hooks.nsh — Tauri 2 NSIS post-install hook para Tinta (Windows).
;
; Instala el runtime nativo del lector de huella: el RTE del DigitalPersona
; Biometric SDK 3.6.1 (ADR-004-quater). El RTE trae TODO lo que el motor
; tinta-bio.exe necesita en la PC — dpfpdd/dpfj y su capa de soporte
; (dpusbada, dpdevctl, dpd*/dpi*) Y el driver del U.are.U 4500. Con eso
; muere el hook anterior completo: la descarga del Lite Client (55 MB, el
; agente DpHost que el FE ya no usa) y la sección separada del driver
; standalone (pnputil + zip anidado) — un solo instalador cubre ambos.
;
; REGLA anti-sombra (aprendida en campo, ver ADR-004-quater): el RTE es la
; ÚNICA fuente del runtime nativo. JAMÁS bundlear DLLs del SDK junto a
; tinta-bio.exe o al sidecar — un subconjunto copiado le hace sombra al
; runtime instalado y el lector muere en `no_device` silencioso.
;
; ¿Por qué mirror propio (dl.entinta.app) y no el server de HID?
;   1. El EULA del Biometric SDK §1.1(c) permite redistribuir el RTE en
;      object code dentro de la app (con copyright notice de HID) — al
;      contrario del Lite Client, acá NO hay tensión de licencia: la
;      redistribución vía mirror propio está dentro del permiso.
;   2. hidglobal.com está detrás de Cloudflare Bot Management desde
;      jul-2026 (403 a todo cliente headless) y además el RTE ni siquiera
;      tiene URL pública de descarga (viene dentro del SDK, que requiere
;      cuenta del developer center). El mirror es la única ruta viable.
;   El pin SHA256 protege la cadena: si el objeto en R2 rota sin actualizar
;   el define, el installer NO lo ejecuta.
;
; Elevación:
;   Este hook ASUME que el installer corre elevado (installMode perMachine
;   en tauri.windows.conf.json → UAC único al doble click). El setup.exe
;   del RTE (InstallShield → msiexec, instala driver + servicios) necesita
;   admin; sin elevación ambiente, ExecWait ni siquiera lanza (CreateProcess
;   no dispara UAC) — el histórico "codigo 5847420" del hook viejo.
;
; Trade-off conocido (soft-fail):
;   Si la PC no tiene internet al instalar, este hook falla "blando": Tinta
;   queda instalada y funcional (búsqueda manual + número de socio cubren la
;   operación), el lector queda inactivo hasta instalar el RTE manualmente.
;   El primer handshake desktop↔cloud también requiere internet, así que el
;   offline-first del producto no se rompe — sólo el momento de instalación.
;
; Documentación:
;   - Tauri 2 NSIS hooks: https://v2.tauri.app/distribute/windows-installer/
;   - Macros disponibles: NSIS_HOOK_PREINSTALL / NSIS_HOOK_POSTINSTALL /
;     NSIS_HOOK_PREUNINSTALL / NSIS_HOOK_POSTUNINSTALL.
; ============================================================================

; ─── RTE del DigitalPersona Biometric SDK 3.6.1 ─────────────────────────────
; Pin a versión específica servida desde el mirror R2. El zip es la carpeta
; RTE/x64 del SDK tal cual (setup.exe + setup.msi + Data1.cab + prereqs de
; InstallShield). Al bumpear versión del RTE: subir zip nuevo a R2 con OTRO
; nombre (versionado, cache immutable), actualizar URL + SHA256 + ProductCode
; (sale de Setup.ini del RTE nuevo) y validar en VM Windows limpia.
!define TINTA_RTE_URL "https://dl.entinta.app/vendor/hid/dp-bio-rte-3.6.1-x64.zip"
!define TINTA_RTE_SHA256 "C9B35841761A9FC62363EF4A536590E9C2C551CE08B49F7E61A1247AA36D978F"

; Footprint REAL del RTE instalado — 2 señales, cualquiera positiva = skip:
;   1. ProductCode del MSI ({7FC7AAC6-...}, de Setup.ini del RTE 3.6.1).
;      A diferencia del InstallShield del Lite Client (que dejaba registro
;      huérfano tras un rollback — la lección del 7336428), la entrada
;      Uninstall de un MSI es transaccional: si está, el producto instaló.
;   2. dpfpdd.dll + dpfj.dll presentes en Program Files\DigitalPersona\Bin
;      — las DOS piezas que tinta-bio.exe carga (captura + FingerJet), en
;      la primera ruta donde su DllImportResolver busca. Cubre máquinas con
;      el runtime funcional por otra vía (p.ej. el SDK completo de dev
;      instalado, que trae el mismo runtime con otro ProductCode).
;      El check exige AMBAS DLLs: dpfpdd solo también lo dejaba un One
;      Touch viejo (era 4.x) y ese runtime NO trae FingerJet — esas
;      máquinas deben caer al pre-check de conflicto, no a un skip.
!define TINTA_RTE_PRODUCT_KEY "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{7FC7AAC6-4A7E-4DA4-92ED-D37FB6BDCA18}"
!define TINTA_RTE_RUNTIME_DIR "$PROGRAMFILES64\DigitalPersona\Bin"

!define TINTA_RTE_TEMP_ZIP "$TEMP\tinta-dp-rte.zip"
!define TINTA_RTE_TEMP_DIR "$TEMP\tinta-dp-rte"
!define TINTA_RTE_TEMP_PS1 "$TEMP\tinta-dp-rte-fetch.ps1"
!define TINTA_RTE_MSI_LOG "$TEMP\tinta-dp-rte-msi.log"

; ─── Migración: retiro del Lite Client (Tinta ≤ v1.0.16) ────────────────────
; Las PCs que actualizan desde el stack viejo tienen el HID Authentication
; Device Client instalado y su servicio DpHost puede quedar corriendo con
; una sesión abierta al lector — eso bloquea el open EXCLUSIVE del motor
; tinta-bio (DEVICE_BUSY). Ya no hay fallback que lo use (el FE migró a SSE
; del sidecar): se desinstala en silencio; si el MSI falla, como mínimo se
; detiene + deshabilita el servicio para soltar el lector.
!define TINTA_ADC_SVC "SYSTEM\CurrentControlSet\Services\DpHost"
!define TINTA_ADC_PS1 "$TEMP\tinta-adc-remove.ps1"

!define TINTA_DP_CHECK_PS1 "$TEMP\tinta-dp-check.ps1"

; TrimNewLines: la salida de nsExec::ExecToStack trae CRLF final; sin trim,
; los mensajes que embeben esa salida se parten feo a media oración.
!include "TextFunc.nsh"

; ─── PowerShell 64-bit explicit ─────────────────────────────────────────────
; NSIS es 32-bit. Si llamamos a "powershell.exe" sin path absoluto, Windows
; resuelve via PATH y el redirector WOW64 nos manda a SysWOW64 (PowerShell
; 32-bit). El alias "Sysnative" lo expone Windows EXCLUSIVAMENTE a procesos
; 32-bit para saltarse la redirección y llegar al System32 real (PowerShell
; 64-bit, con la vista de registro y Program Files correcta).
; En 32-bit Windows Sysnative no existe → la llamada falla → caemos al
; branch de fallo blando. No soportamos 32-bit Windows (README lo dice).
!define TINTA_PS64 "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"

; ─── PREINSTALL: soltar los procesos de Tinta antes de copiar archivos ──────
; El template de Tauri cierra Tinta.exe, pero el sidecar es un proceso hijo
; APARTE que puede seguir vivo — típico en updates: el updater termina la app
; con process::exit (sin RunEvent::Exit → sin shutdown del sidecar) y el
; huérfano bloquea su propio .exe → "error opening file for writing".
; Con el motor biométrico hay un SEGUNDO hijo: tinta-bio.exe (spawneado por
; el sidecar, vive junto a él en el install dir) — mismo problema, mismo
; remedio. Orden importa: primero el sidecar (si matáramos al helper primero,
; el engine del sidecar lo respawnea con backoff y perdemos la carrera); el
; helper además se cierra solo al ver EOF en stdin cuando muere el sidecar,
; el taskkill es el cinturón. Fallo del taskkill = no estaba corriendo →
; ignorar. El sleep da margen a que Windows suelte los handles.
!macro NSIS_HOOK_PREINSTALL
  Push $0
  DetailPrint "Cerrando procesos de Tinta..."
  nsExec::ExecToLog 'taskkill /F /IM tinta-sidecar.exe'
  Pop $0
  nsExec::ExecToLog 'taskkill /F /IM tinta-bio.exe'
  Pop $0
  Sleep 500
  Pop $0
!macroend

; Mismo problema al DESINSTALAR: el uninstaller no puede borrar exes en
; ejecución.
!macro NSIS_HOOK_PREUNINSTALL
  Push $0
  nsExec::ExecToLog 'taskkill /F /IM tinta-sidecar.exe'
  Pop $0
  nsExec::ExecToLog 'taskkill /F /IM tinta-bio.exe'
  Pop $0
  Sleep 500
  Pop $0
!macroend

!macro NSIS_HOOK_POSTINSTALL
  Push $0
  Push $1
  Push $2

  ; Las claves de DigitalPersona viven en la hive de 64-bit. Sin SetRegView
  ; 64 el installer (NSIS de 32-bit) leería la vista WOW6432Node y daría
  ; falso negativo en máquinas que SÍ tienen el runtime, gatillando una
  ; descarga de ~175 MB innecesaria.
  SetRegView 64

  ; ── Paso 1 · Migración: retirar el Lite Client si esta PC lo trae ───────
  ; Corre SIEMPRE (aunque el RTE ya esté instalado): el conflicto real es el
  ; servicio DpHost vivo acaparando el lector, independiente del runtime.
  ; Señal: el servicio DpHost en la hive SYSTEM (sin split WOW64) — la misma
  ; señal robusta que usaba la detección del hook viejo, ahora al revés:
  ; presente = hay que quitarlo.
  ReadRegStr $0 HKLM "${TINTA_ADC_SVC}" "ImagePath"
  StrCmp $0 "" tinta_adc_done

    DetailPrint "Retirando el soporte anterior del lector (Lite Client)..."
    ; El .ps1: (1) busca el Authentication Device Client en las hives de
    ; desinstalación y lo quita con msiexec /x <ProductCode> /qn (el GUID
    ; sale del registro de ESTA máquina — los ProductCode de MSI cambian
    ; por versión, hardcodearlo sería frágil); (2) si el MSI falla o la
    ; entrada no está (el registro huérfano de la saga del 7336428), como
    ; mínimo detiene + deshabilita DpHost para soltar el lector.
    ; Exit codes: 0 = no había servicio (carrera; nada que hacer),
    ; 1 = desinstalado, 2 = servicio detenido y deshabilitado (sin
    ; desinstalar), 3 = no se pudo ni detener.
    ; Convenciones de escape NSIS dentro de strings '...':
    ;   $$ → $ literal para PowerShell; $\r$\n → CRLF; $\" → comilla doble.
    ;   Apóstrofes JAMÁS ('' NO es escape en NSIS — parte el string).
    FileOpen $2 "${TINTA_ADC_PS1}" w
    FileWrite $2 '$$svc = Get-Service -Name $\"DpHost$\" -ErrorAction SilentlyContinue$\r$\n'
    FileWrite $2 'if (-not $$svc) { exit 0 }$\r$\n'
    FileWrite $2 '$$hives = @($\"HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*$\", $\"HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*$\")$\r$\n'
    FileWrite $2 '$$adc = Get-ItemProperty -Path $$hives -ErrorAction SilentlyContinue | Where-Object { $$_.DisplayName -match $\"Authentication Device Client|Lite Client$\" } | Select-Object -First 1$\r$\n'
    FileWrite $2 'if ($$adc -and $$adc.PSChildName -match $\"^\{[0-9A-Fa-f\-]+\}$$$\") {$\r$\n'
    FileWrite $2 '  $$p = Start-Process -FilePath $\"msiexec.exe$\" -ArgumentList ($\"/x $\" + $$adc.PSChildName + $\" /qn /norestart$\") -Wait -PassThru -NoNewWindow$\r$\n'
    FileWrite $2 '  if (($$p.ExitCode -eq 0) -or ($$p.ExitCode -eq 3010)) { exit 1 }$\r$\n'
    FileWrite $2 '}$\r$\n'
    FileWrite $2 'try { Stop-Service -Name $\"DpHost$\" -Force -ErrorAction Stop } catch {}$\r$\n'
    FileWrite $2 'try { Set-Service -Name $\"DpHost$\" -StartupType Disabled -ErrorAction Stop } catch {}$\r$\n'
    FileWrite $2 '$$svc = Get-Service -Name $\"DpHost$\" -ErrorAction SilentlyContinue$\r$\n'
    FileWrite $2 'if ($$svc -and ($$svc.Status -ne $\"Stopped$\")) { exit 3 }$\r$\n'
    FileWrite $2 'exit 2$\r$\n'
    FileClose $2
    nsExec::ExecToLog '"${TINTA_PS64}" -NoProfile -ExecutionPolicy Bypass -File "${TINTA_ADC_PS1}"'
    Pop $0
    Delete "${TINTA_ADC_PS1}"

    StrCmp $0 "1" tinta_adc_removed
    StrCmp $0 "2" tinta_adc_stopped
    StrCmp $0 "0" tinta_adc_done
    ; 3 o cualquier otro código (PowerShell murió): el servicio viejo puede
    ; seguir agarrando el lector. Aviso accionable, sin abortar — la app y
    ; el resto del hook siguen (el RTE se instala igual; el lector queda
    ; ocupado hasta resolver esto).
    MessageBox MB_OK|MB_ICONEXCLAMATION "No pude quitar el soporte anterior del lector (HID Authentication Device Client). Su servicio puede dejar el lector ocupado y la huella no va a funcionar.$\r$\n$\r$\nDesinstalalo desde Panel de control > Programas y caracteristicas y reinicia la PC."
    Goto tinta_adc_done

  tinta_adc_removed:
    DetailPrint "Lite Client anterior desinstalado (el motor nuevo no lo usa)."
    Goto tinta_adc_done

  tinta_adc_stopped:
    DetailPrint "No se pudo desinstalar el Lite Client; su servicio quedo detenido y deshabilitado (suficiente para liberar el lector)."
    Goto tinta_adc_done

  tinta_adc_done:

  ; ── Paso 2 · ¿El RTE ya está? (ANTES de descargar ~175 MB) ──────────────
  DetailPrint "Verificando el runtime del lector de huella..."
  ReadRegStr $0 HKLM "${TINTA_RTE_PRODUCT_KEY}" "DisplayName"
  StrCmp $0 "" 0 tinta_rte_already

  ; ── Paso 3 · Pre-check de conflicto con software DP viejo ───────────────
  ; Heredado del hook anterior, mismo hallazgo de campo: PCs que migran de
  ; otro sistema de gym (HDLEON y similares) traen DigitalPersona viejo
  ; (típico: "One Touch for Windows" / U.are.U SDK 4.x). El readme del SDK
  ; 3.6.1 pide desinstalar versiones previas de U.are.U SDK / One Touch /
  ; Biometric SDK antes de instalar; encimarle el RTE arriesga un 1603
  ; opaco o una mezcla de runtimes rota en DigitalPersona\Bin. Detectarlo
  ; ANTES da mensaje accionable y ahorra la descarga.
  ; Este paso corre ANTES del check por archivos (paso 4) a propósito: un
  ; One Touch viejo también deja dpfpdd.dll en DigitalPersona\Bin y un skip
  ; por archivo ahí sería un falso positivo (ese runtime no trae FingerJet).
  ; Exclusiones del match: nuestro propio RTE/SDK ("Biometric SDK") y el
  ; Lite Client (lo maneja el paso 1). Best-effort: si el check falla,
  ; seguimos al install (peor caso: el error real queda en el log MSI).
  FileOpen $2 "${TINTA_DP_CHECK_PS1}" w
  FileWrite $2 '$$hives = @($\"HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*$\", $\"HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*$\")$\r$\n'
  FileWrite $2 '$$dp = Get-ItemProperty -Path $$hives -ErrorAction SilentlyContinue | Where-Object { $$_.DisplayName -match $\"DigitalPersona|Altus|One Touch|U\.are\.U$\" -and $$_.DisplayName -notmatch $\"Biometric SDK|Authentication Device Client|Lite Client$\" } | Select-Object -First 1$\r$\n'
  FileWrite $2 'if ($$dp) { Write-Output $$dp.DisplayName; exit 2 }$\r$\n'
  FileWrite $2 'exit 0$\r$\n'
  FileClose $2
  nsExec::ExecToStack '"${TINTA_PS64}" -NoProfile -ExecutionPolicy Bypass -File "${TINTA_DP_CHECK_PS1}"'
  Pop $0
  Pop $2
  ${TrimNewLines} "$2" $2
  Delete "${TINTA_DP_CHECK_PS1}"
  StrCmp $0 "2" tinta_rte_conflict

  ; ── Paso 4 · Runtime funcional por otra vía (SDK de dev, etc.) ──────────
  ; Sólo se llega acá sin ProductCode del RTE y sin productos DP viejos.
  ; Si las DOS DLLs que tinta-bio carga ya están donde su resolver busca,
  ; el runtime sirve — instalar el RTE encima sería redundante.
  IfFileExists "${TINTA_RTE_RUNTIME_DIR}\dpfpdd.dll" 0 tinta_rte_download
  IfFileExists "${TINTA_RTE_RUNTIME_DIR}\dpfj.dll" tinta_rte_already tinta_rte_download

  tinta_rte_download:
    DetailPrint "Runtime del lector no detectado. Descargando (~175 MB)."
    DetailPrint "Esto solo pasa una vez y necesita conexion a internet."

    ; Fetch a un .ps1 temporal con URL/paths/hash como argv (param block).
    ; No se incrustan como literales: $TEMP puede traer apóstrofes
    ; ("C:\Users\Juan's PC\...") y romperia cualquier single-quoted string.
    ; El .ps1: (1) descarga el zip del mirror R2, (2) verifica el SHA256
    ; pineado, (3) extrae, (4) confirma que setup.exe está donde esperamos.
    ; Exit codes: 0 = listo para instalar; 1 = descarga falló (sin internet,
    ; 404, timeout); 2 = zip corrupto o sin setup.exe; 4 = hash mismatch
    ; (MITM, objeto rotado en R2 sin actualizar el pin, descarga corrupta).
    FileOpen $2 "${TINTA_RTE_TEMP_PS1}" w
    FileWrite $2 'param([string]$$Url,[string]$$ZipPath,[string]$$ExtractDir,[string]$$Expected)$\r$\n'
    FileWrite $2 '$$ErrorActionPreference = $\"Stop$\"$\r$\n'
    FileWrite $2 '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12$\r$\n'
    ; WebClient.DownloadFile y NO Invoke-WebRequest: el IWR de Windows
    ; PowerShell 5.1 es lentísimo con archivos grandes (actualiza la progress
    ; bar en cada read chico Y bufferea la respuesta COMPLETA en memoria
    ; antes de escribir el -OutFile — 173 MB en RAM de una PC de gym).
    ; WebClient streamea directo a disco a velocidad de línea. Mordió en la
    ; primera validación real: la descarga "tardaba demasiado".
    FileWrite $2 'try { (New-Object System.Net.WebClient).DownloadFile($$Url, $$ZipPath) } catch { exit 1 }$\r$\n'
    FileWrite $2 'if ((Get-FileHash $$ZipPath -Algorithm SHA256).Hash -ne $$Expected) { Remove-Item $$ZipPath -Force -ErrorAction SilentlyContinue; exit 4 }$\r$\n'
    FileWrite $2 'try { if (Test-Path $$ExtractDir) { Remove-Item $$ExtractDir -Recurse -Force } } catch {}$\r$\n'
    FileWrite $2 'try { Expand-Archive -Path $$ZipPath -DestinationPath $$ExtractDir -Force } catch { exit 2 }$\r$\n'
    FileWrite $2 'if (-not (Test-Path (Join-Path $$ExtractDir $\"setup.exe$\"))) { exit 2 }$\r$\n'
    FileWrite $2 'exit 0$\r$\n'
    FileClose $2

    ; -NoProfile evita $PROFILE custom del operador; -ExecutionPolicy Bypass
    ; evita el bloqueo de scripts sin firmar sin tocar la policy global.
    nsExec::ExecToLog '"${TINTA_PS64}" -NoProfile -ExecutionPolicy Bypass -File "${TINTA_RTE_TEMP_PS1}" "${TINTA_RTE_URL}" "${TINTA_RTE_TEMP_ZIP}" "${TINTA_RTE_TEMP_DIR}" "${TINTA_RTE_SHA256}"'
    Pop $0
    Delete "${TINTA_RTE_TEMP_PS1}"

    StrCmp $0 "0" tinta_rte_run
    StrCmp $0 "4" tinta_rte_hash_fail
    StrCmp $0 "2" tinta_rte_extract_fail
    ; 1 = network/timeout; cualquier otro = PowerShell murió. Mismo destino.
    Goto tinta_rte_download_fail

  tinta_rte_run:
    DetailPrint "Instalando el runtime del lector de huella (puede tardar unos minutos)..."
    ; Flags del launcher InstallShield del RTE — los MISMOS que su
    ; InstallOnly.bat oficial, más /norestart y log a path conocido:
    ;   /s      = launcher en silent.
    ;   /v"..." = passthrough al msiexec interno: /qn (cero UI), /norestart
    ;             (instala driver; sin reboot automático — si hace falta,
    ;             devuelve 3010), /l*v (log verbose = la evidencia).
    ; Comillas internas del path del log escapadas \" — formato documentado
    ; de InstallShield para params de /v con espacios.
    ;
    ; ExecWait REQUIERE la elevación ambiente del installer (installMode
    ; perMachine — ver header). CreateProcess no dispara UAC: desde un
    ; installer per-user este paso moriría sin arrancar siquiera.
    Delete "${TINTA_RTE_MSI_LOG}"
    ClearErrors
    ExecWait '"${TINTA_RTE_TEMP_DIR}\setup.exe" /s /v"/qn /norestart /l*v \"${TINTA_RTE_MSI_LOG}\""' $1
    ; Si ExecWait no pudo LANZAR el proceso, deja $1 INDEFINIDA (docs de
    ; NSIS) — checar el error flag antes de leerla. No hacerlo era el bug
    ; original del "codigo 5847420": basura residual de $1 como si fuera
    ; un exit code real.
    IfErrors tinta_rte_exec_error
    IntCmp $1 0 tinta_rte_run_ok
    ; 3010 = ERROR_SUCCESS_REBOOT_REQUIRED: quedó instalado (típico cuando
    ; el driver se registró); termina de activar al siguiente boot.
    IntCmp $1 3010 tinta_rte_run_ok_reboot
    StrCpy $2 "codigo $1, log en ${TINTA_RTE_MSI_LOG}"
    Goto tinta_rte_run_fail

  tinta_rte_exec_error:
    StrCpy $2 "no se pudo ejecutar el instalador descargado"
    Goto tinta_rte_run_fail

  tinta_rte_run_ok:
    DetailPrint "Runtime del lector de huella instalado correctamente."
    DetailPrint "Cuando conectes el lector, Windows lo reconoce automaticamente."
    Goto tinta_rte_cleanup

  tinta_rte_run_ok_reboot:
    DetailPrint "Runtime del lector instalado. Se termina de activar al reiniciar la PC."
    Goto tinta_rte_cleanup

  tinta_rte_cleanup:
    ; El staging pesa ~350 MB entre zip y extract — se limpia SIEMPRE tras
    ; un install exitoso. El log MSI se queda en $TEMP: es la evidencia.
    Delete "${TINTA_RTE_TEMP_ZIP}"
    RMDir /r "${TINTA_RTE_TEMP_DIR}"
    Goto tinta_rte_done

  tinta_rte_conflict:
    ; $2 = DisplayName del producto DP conflictivo (stdout del .ps1).
    ; Caso migración: PCs que vienen de otro sistema de gym con lector
    ; DigitalPersona (HDLEON → One Touch, etc). No instalamos encima.
    DetailPrint "Conflicto: esta PC ya tiene $2."
    MessageBox MB_OK|MB_ICONEXCLAMATION "Esta PC tiene instalado otro software de DigitalPersona ($2) que puede chocar con el runtime del lector que usa Tinta. Tinta va a abrir igual y vas a poder operar sin el lector.$\r$\n$\r$\nPara usar el lector de huella aqui: desinstala ese programa desde Panel de control > Programas y vuelve a correr este instalador, o usa una PC dedicada para Tinta."
    Goto tinta_rte_done

  tinta_rte_run_fail:
    ; No abortamos la instalación de Tinta. La app es útil sin biometría
    ; (búsqueda manual + número de socio); el banner del FE avisa del lector.
    ; $2 trae el detalle REAL (exit code + path del log MSI) — no números
    ; opacos. El staging se limpia; el log queda.
    Delete "${TINTA_RTE_TEMP_ZIP}"
    RMDir /r "${TINTA_RTE_TEMP_DIR}"
    DetailPrint "Instalacion del runtime del lector fallo: $2"
    MessageBox MB_OK|MB_ICONINFORMATION "El runtime del lector de huella no se instalo completamente ($2). Tinta va a abrir igual y vas a poder operar sin el lector.$\r$\n$\r$\nCuando puedas: descarga ${TINTA_RTE_URL} en un navegador, descomprime el zip y ejecuta setup.exe."
    Goto tinta_rte_done

  tinta_rte_download_fail:
    ; Limpieza defensiva: una descarga a medias deja un zip truncado.
    Delete "${TINTA_RTE_TEMP_ZIP}"
    MessageBox MB_OK|MB_ICONINFORMATION "No pude descargar el runtime del lector de huella (se necesita internet para este paso). Tinta queda instalada y funcional.$\r$\n$\r$\nCuando tengas internet: descarga ${TINTA_RTE_URL} en un navegador, descomprime el zip y ejecuta setup.exe."
    Goto tinta_rte_done

  tinta_rte_extract_fail:
    Delete "${TINTA_RTE_TEMP_ZIP}"
    RMDir /r "${TINTA_RTE_TEMP_DIR}"
    MessageBox MB_OK|MB_ICONEXCLAMATION "El runtime del lector se descargo pero el archivo parece corrupto. Tinta queda instalada.$\r$\n$\r$\nDescarga ${TINTA_RTE_URL} manualmente, descomprime el zip y ejecuta setup.exe."
    Goto tinta_rte_done

  tinta_rte_hash_fail:
    ; Mismatch contra el pin: MITM, objeto rotado en R2 sin actualizar el
    ; define, o disco corrupto. Cualquiera de los tres: ese zip NO se
    ; ejecuta, punto.
    MessageBox MB_OK|MB_ICONEXCLAMATION "El runtime del lector que descargue no coincide con la firma esperada — no lo voy a ejecutar por seguridad. Tinta queda instalada.$\r$\n$\r$\nAvisa a soporte de Tinta; mientras tanto puedes operar sin el lector."
    Goto tinta_rte_done

  tinta_rte_already:
    DetailPrint "Runtime del lector de huella ya esta instalado — sin cambios."
    Goto tinta_rte_done

  tinta_rte_done:
    Pop $2
    Pop $1
    Pop $0
!macroend
