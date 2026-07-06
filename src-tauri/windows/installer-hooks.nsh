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
;   UPDATE jul-2026: hidglobal.com puso Cloudflare Bot Management delante de
;   sus descargas (403 a todo cliente headless) y mató el paso del driver.
;   Ambos binarios se sirven ahora desde mirror propio en R2 (dl.entinta.app)
;   con pin SHA256; para el Lite Client se conserva el origen de HID como
;   fallback. Hay tensión conocida entre el mirror y la cláusula de
;   no-redistribución del EULA — decisión operativa consciente (el origen
;   dejó de ser alcanzable en install-time); ADR-004-ter pendiente de
;   actualizar.
;
; Elevación:
;   Este hook ASUME que el installer corre elevado (installMode perMachine
;   en tauri.windows.conf.json → UAC único al doble click). Tanto el exe de
;   HID (manifest requireAdministrator, instala servicios) como pnputil
;   (driver store) necesitan admin. Sin elevación ambiente, el ExecWait del
;   Lite Client ni siquiera lanza (CreateProcess no dispara UAC) — el
;   histórico "codigo 5847420".
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
; del archivo en su store (verificado 2026-05-22). URL primaria = mirror R2
; (mismo binario byte a byte — el hash pineado aplica igual); fallback = el
; store de HID, que hoy sigue sirviendo headless sin challenge.
!define TINTA_DP_URL "https://dl.entinta.app/vendor/hid/lite-client-5.2.0.exe"
!define TINTA_DP_URL_FALLBACK "https://crossmatch.hid.gl/lite-client/store/5.2.0/HID%20Authentication%20Device%20Client.exe"
!define TINTA_DP_SHA256 "C5268289CF772FE288DEAC4CFC12E09BCC7055C29C7EBFA569D53570EE5E977A"
!define TINTA_DP_HELP_URL "https://crossmatch.hid.gl/lite-client/"
; Footprint REAL del Authentication Device Client 5.2.0.50, dump-eado de
; una instalación real el 5-jul-2026 (NO suposiciones — las claves
; anteriores no existían y el installer re-descargaba 55 MB en cada
; install y cada auto-update):
;   - Servicio: DpHost ("HID Authentication Device Service") →
;     SYSTEM\CurrentControlSet\Services\DpHost (hive sin split WOW64).
;   - Uninstall (vista 64-bit): product code {AFB5AC65-...}, DisplayName
;     "HID Authentication Device Client" 5.2.0.50. El GUID cambia si HID
;     publica versión nueva — bumpear junto con TINTA_DP_URL/SHA256.
;   - Binario del host: HID Global\Authentication Device Client\Bin\
;     DpHostW.exe (dpcagnt.exe y DigitalPersona\Bin eran de la era 4.x).
!define TINTA_DP_SVC "SYSTEM\CurrentControlSet\Services\DpHost"
!define TINTA_DP_UNINST "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{AFB5AC65-F772-4AA8-ADA1-630480C03438}"
!define TINTA_DP_AGENT_BIN "$PROGRAMFILES64\HID Global\Authentication Device Client\Bin\DpHostW.exe"
!define TINTA_DP_REG_LEGACY "SOFTWARE\DigitalPersona\Bin"
!define TINTA_DP_TEMP_EXE "$TEMP\tinta-hid-adc.exe"
!define TINTA_DP_TEMP_PS1 "$TEMP\tinta-dp-fetch.ps1"
!define TINTA_DP_CHECK_PS1 "$TEMP\tinta-dp-check.ps1"
!define TINTA_DP_MSI_LOG "$TEMP\tinta-hid-adc-msi.log"

; TrimNewLines: la salida de nsExec::ExecToStack trae CRLF final; sin trim,
; los mensajes que embeben esa salida se parten feo a media oración.
!include "TextFunc.nsh"

; ─── Driver del U.are.U 4500 (separado del Lite Client) ─────────────────────
; El Lite Client (agente) NO incluye el driver kernel del reader. Validado
; empíricamente: instalación limpia del agente deja el reader con "Code 28
; - The drivers for this device are not installed" en Device Manager.
;
; URL: mirror propio en R2 (dl.entinta.app). El origen (hidglobal.com
; /sites/default/files/drivers/...) quedó detrás de Cloudflare Bot
; Management con challenge JS: desde jul-2026 responde 403 a TODO cliente
; headless — curl y PowerShell por igual, con o sin headers de browser
; spoofeados (el challenge exige Sec-CH-UA-* y ejecutar JS). El spoof de
; headers que vivía acá ya había chocado con eso antes y la carrera se
; perdió. El ZIP se bajó UNA vez con navegador real desde /drivers/49061
; (verificado 2026-05-24, 5.48 MB), y ahora se sirve desde infra propia
; CON hash pineado — cosa que HID nunca publicó para el driver. La firma
; WHQL del .cat embebido sigue validándose al hacer pnputil /add-driver.
; Si el mirror falla, el fallback sigue siendo MessageBox + abrir browser
; a la página oficial (donde el challenge JS sí corre).
;
; ARCH: el driver del 49061 es x86_64 ONLY. En Windows 11 ARM64 el .sys no
; carga (kernel drivers no emulan). Documentado en README — Tinta no soporta
; Windows ARM64 hoy. El hook intenta el install de todas formas; pnputil
; falla limpio en ARM64 y caemos al MessageBox.
!define TINTA_DP_DRIVER_URL "https://dl.entinta.app/vendor/hid/dp4500-driver-4.1.1.221.zip"
!define TINTA_DP_DRIVER_SHA256 "61B40F347971225E6EB77626EB4322AF7B0C6D59451D66C886F7DE35538EBED1"
!define TINTA_DP_DRIVER_HELP_URL "https://www.hidglobal.com/drivers/49061"
!define TINTA_DP_DRIVER_TEMP_ZIP "$TEMP\tinta-dp-driver.zip"
!define TINTA_DP_DRIVER_TEMP_DIR "$TEMP\tinta-dp-driver"
!define TINTA_DP_DRIVER_TEMP_PS1 "$TEMP\tinta-dp-driver.ps1"

; ─── PowerShell 64-bit explicit ─────────────────────────────────────────────
; NSIS es 32-bit. Si llamamos a "powershell.exe" sin path absoluto, Windows
; resuelve via PATH y el redirector WOW64 nos manda a SysWOW64 (PowerShell
; 32-bit). Dentro de 32-bit PS, pnputil.exe NO se encuentra (solo existe en
; el System32 verdadero, no en SysWOW64). El alias mágico "Sysnative" lo
; expone Windows EXCLUSIVAMENTE a procesos 32-bit para saltarse la
; redirección y acceder al System32 real. Esta macro la usamos en TODOS
; los nsExec con PowerShell para garantizar 64-bit consistente.
;
; En 64-bit Windows: Sysnative resuelve al System32 real → 64-bit
;   powershell.exe → pnputil encuentra natural.
; En 32-bit Windows: Sysnative no existe → falla la llamada → caemos al
;   fallback (browser-open). No soportamos 32-bit Windows hoy (README
;   lo dice explícito) — degradación aceptable.
!define TINTA_PS64 "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"

; ─── PREINSTALL: soltar tinta-sidecar.exe antes de copiar archivos ─────────
; El template de Tauri cierra Tinta.exe antes de instalar, pero el sidecar
; es un proceso hijo APARTE que puede seguir vivo — típico en updates: el
; updater termina la app con process::exit (sin RunEvent::Exit, o sea sin
; el shutdown del sidecar) y el huérfano bloquea su propio .exe →
; "error opening file for writing: tinta-sidecar.exe". El watcher de
; parent-PID del Go no detecta padre muerto en Windows (no hay reparenting;
; Getppid devuelve el PID viejo congelado). taskkill por nombre de imagen
; mata también huérfanos de crashes que no son hijos de este proceso.
; Fallo del taskkill = no estaba corriendo → ignorar. El sleep da margen a
; que Windows suelte los handles del proceso muerto antes del primer File.
!macro NSIS_HOOK_PREINSTALL
  Push $0
  DetailPrint "Cerrando procesos de Tinta..."
  nsExec::ExecToLog 'taskkill /F /IM tinta-sidecar.exe'
  Pop $0
  Sleep 500
  Pop $0
!macroend

; Mismo problema al DESINSTALAR: el uninstaller no puede borrar un
; tinta-sidecar.exe en ejecución.
!macro NSIS_HOOK_PREUNINSTALL
  Push $0
  nsExec::ExecToLog 'taskkill /F /IM tinta-sidecar.exe'
  Pop $0
  Sleep 500
  Pop $0
!macroend

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

  ; Detección en cascada contra el footprint REAL (ver defines arriba):
  ; 4 chequeos, cualquiera positivo gatilla skip.
  ;   1. Servicio DpHost — la señal más robusta: la hive SYSTEM no tiene
  ;      split WOW64 y el servicio ES lo que el FE necesita corriendo.
  ;      El nombre viene de la era DigitalPersona → cubre 4.x también.
  ;   2. Entrada de desinstalación del MSI 5.2.0 (product code pineado).
  ;   3. File presence del host (red para registry limpiado a mano).
  ;   4. Registry legacy 4.x (marca DigitalPersona) — histórico.
  ReadRegStr $0 HKLM "${TINTA_DP_SVC}" "ImagePath"
  StrCmp $0 "" 0 tinta_dp_already
  ReadRegStr $0 HKLM "${TINTA_DP_UNINST}" "DisplayName"
  StrCmp $0 "" 0 tinta_dp_already
  IfFileExists "${TINTA_DP_AGENT_BIN}" tinta_dp_already
  ReadRegStr $0 HKLM "${TINTA_DP_REG_LEGACY}" "InstallDir"
  StrCmp $0 "" tinta_dp_download tinta_dp_already

  tinta_dp_download:
    ; Pre-check de conflicto ANTES de descargar 55 MB: según HID, el
    ; Device Client "cannot be installed on a computer with any other
    ; Altus or DigitalPersona products" (One Touch incluido — típico en
    ; PCs que migran de otro sistema de gym con lector DP). En silent ese
    ; conflicto muere en un 1603 opaco; detectarlo antes da un mensaje
    ; accionable y ahorra la descarga. Best-effort: si el check mismo
    ; falla, seguimos al install normal (peor caso: el error real queda
    ; en el log MSI).
    FileOpen $2 "${TINTA_DP_CHECK_PS1}" w
    FileWrite $2 '$$hives = @($\"HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*$\", $\"HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*$\")$\r$\n'
    FileWrite $2 '$$dp = Get-ItemProperty -Path $$hives -ErrorAction SilentlyContinue | Where-Object { $$_.DisplayName -match $\"DigitalPersona|Altus|One Touch for Windows$\" -and $$_.DisplayName -notmatch $\"Authentication Device Client|Lite Client$\" } | Select-Object -First 1$\r$\n'
    FileWrite $2 'if ($$dp) { Write-Output $$dp.DisplayName; exit 2 }$\r$\n'
    FileWrite $2 'exit 0$\r$\n'
    FileClose $2
    nsExec::ExecToStack '"${TINTA_PS64}" -NoProfile -ExecutionPolicy Bypass -File "${TINTA_DP_CHECK_PS1}"'
    Pop $0
    Pop $2
    ${TrimNewLines} "$2" $2
    Delete "${TINTA_DP_CHECK_PS1}"
    StrCmp $0 "2" tinta_dp_conflict

    DetailPrint "Lector de huella no detectado. Descargando soporte (~55 MB)."
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
    ; Mirror R2 primero; origen HID como fallback. El hash se verifica POR
    ; DESCARGA: si el mirror sirve un archivo corrupto o rotado, el origen
    ; todavía puede salvar la instalación (y viceversa). Unblock-File quita
    ; el Mark-of-the-Web tras validar el pin — sin él, SmartScreen puede
    ; interceptar la ejecución de un exe descargado; nuestro SHA256 pineado
    ; ya cumple el rol que el MOTW pretende cubrir.
    FileOpen $2 "${TINTA_DP_TEMP_PS1}" w
    FileWrite $2 'param([string]$$Url,[string]$$UrlFallback,[string]$$Out,[string]$$Expected)$\r$\n'
    FileWrite $2 '$$ErrorActionPreference = $\"Stop$\"$\r$\n'
    FileWrite $2 '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12$\r$\n'
    FileWrite $2 '$$got = $$false$\r$\n'
    FileWrite $2 'foreach ($$u in @($$Url, $$UrlFallback)) {$\r$\n'
    FileWrite $2 '  try { Invoke-WebRequest -Uri $$u -OutFile $$Out -UseBasicParsing -TimeoutSec 180 } catch { continue }$\r$\n'
    FileWrite $2 '  $$got = $$true$\r$\n'
    FileWrite $2 '  if ((Get-FileHash $$Out -Algorithm SHA256).Hash -eq $$Expected) { Unblock-File -Path $$Out -ErrorAction SilentlyContinue; exit 0 }$\r$\n'
    FileWrite $2 '}$\r$\n'
    FileWrite $2 'Remove-Item $$Out -Force -ErrorAction SilentlyContinue$\r$\n'
    FileWrite $2 'if ($$got) { exit 2 } else { exit 1 }$\r$\n'
    FileClose $2

    ; -NoProfile evita correr cualquier $PROFILE custom del operador (suelen
    ;   tener side effects que rompen scripts no interactivos).
    ; -ExecutionPolicy Bypass evita el bloqueo de scripts no firmados sin
    ;   modificar la policy del sistema.
    ; Todos los args van quoted para sobrevivir paths/URLs con espacios.
    nsExec::ExecToLog '"${TINTA_PS64}" -NoProfile -ExecutionPolicy Bypass -File "${TINTA_DP_TEMP_PS1}" "${TINTA_DP_URL}" "${TINTA_DP_URL_FALLBACK}" "${TINTA_DP_TEMP_EXE}" "${TINTA_DP_SHA256}"'
    Pop $0
    Delete "${TINTA_DP_TEMP_PS1}"

    StrCmp $0 "0" tinta_dp_run
    StrCmp $0 "2" tinta_dp_hash_fail
    ; Cualquier otro código (1 = network/timeout, otro = PowerShell murió)
    ; cae a download_fail. El operador puede instalar manual después.
    Goto tinta_dp_download_fail

  tinta_dp_run:
    DetailPrint "Instalando soporte para el lector de huella (puede tardar unos minutos)..."
    ; Flags del instalador de HID — validados contra docs.hidglobal.com
    ; ("Installing the HID Authentication Device Client") y confirmados
    ; en máquina real (jul-2026, corriendo elevado):
    ;   /s      = launcher InstallShield en silent.
    ;   /v"..." = passthrough al msiexec interno: /qn (cero UI),
    ;             /norestart (sin reboot automatico), /l*v (log verbose
    ;             a path conocido — la evidencia cuando algo falla).
    ; Las comillas internas del path del log van escapadas \" — formato
    ; documentado por InstallShield para params de /v con espacios.
    ;
    ; ExecWait REQUIERE la elevación ambiente del installer (installMode
    ; perMachine — ver header). El exe de HID está manifestado
    ; requireAdministrator; CreateProcess (lo que usa ExecWait) no puede
    ; disparar UAC, así que desde un installer per-user este paso moría
    ; con ERROR_ELEVATION_REQUIRED sin arrancar siquiera. Si algún día
    ; se vuelve a per-user, este paso necesita relanzarse via
    ; ShellExecute/RunAs (como hacía el interactivo por doble-click).
    Delete "${TINTA_DP_MSI_LOG}"
    ClearErrors
    ExecWait '"${TINTA_DP_TEMP_EXE}" /s /v"/qn /norestart /l*v \"${TINTA_DP_MSI_LOG}\""' $1
    Delete "${TINTA_DP_TEMP_EXE}"
    ; Si ExecWait no pudo LANZAR el proceso, deja $1 INDEFINIDA (docs de
    ; NSIS) — hay que checar el error flag antes de leerla. No hacerlo
    ; era el bug original: el MessageBox mostraba basura residual de $1
    ; (el histórico "codigo 5847420") en vez de un error real.
    IfErrors tinta_dp_exec_error
    IntCmp $1 0 tinta_dp_run_ok
    ; 3010 = ERROR_SUCCESS_REBOOT_REQUIRED: quedó instalado, el agente
    ; termina de levantar al siguiente boot. Éxito con nota.
    IntCmp $1 3010 tinta_dp_run_ok_reboot
    StrCpy $2 "codigo $1, log en ${TINTA_DP_MSI_LOG}"
    Goto tinta_dp_run_fail

  tinta_dp_exec_error:
    StrCpy $2 "no se pudo ejecutar el instalador descargado"
    Goto tinta_dp_run_fail

  tinta_dp_run_ok:
    DetailPrint "Soporte para el lector de huella instalado correctamente."
    Goto tinta_dp_done

  tinta_dp_run_ok_reboot:
    DetailPrint "Soporte del lector instalado. Se termina de activar al reiniciar la PC."
    Goto tinta_dp_done

  tinta_dp_conflict:
    ; $2 = DisplayName del producto DP conflictivo (stdout del .ps1).
    ; Caso migración: PCs que vienen de otro sistema de gym con lector
    ; DigitalPersona (One Touch, etc). Instalar encima falla siempre;
    ; mejor decirlo claro que escupir un exit code.
    DetailPrint "Conflicto: esta PC ya tiene $2."
    MessageBox MB_OK|MB_ICONEXCLAMATION "Esta PC tiene instalado otro software de DigitalPersona ($2) que es incompatible con el soporte del lector que usa Tinta. Tinta va a abrir igual y vas a poder operar sin el lector.$\r$\n$\r$\nPara usar el lector de huella aqui: desinstala ese programa desde Panel de Control > Programas y vuelve a correr este instalador, o usa una PC dedicada para Tinta."
    Goto tinta_dp_done

  tinta_dp_run_fail:
    ; No abortamos la instalación de Tinta. La app sigue siendo útil sin
    ; biometría (búsqueda manual + PIN cubren el caso); el banner del FE
    ; le va a pedir al dueño que reintente. $2 trae el detalle REAL del
    ; fallo (exit code + path del log MSI verbose) — no números opacos.
    ; El log MSI se queda en $TEMP a propósito: es la evidencia.
    DetailPrint "Instalacion del soporte del lector fallo: $2"
    MessageBox MB_OK|MB_ICONINFORMATION "El soporte para el lector de huella no se instalo completamente ($2). Tinta va a abrir igual y vas a poder operar sin el lector. Cuando puedas, instala el soporte manualmente desde:$\r$\n$\r$\n${TINTA_DP_HELP_URL}"
    Goto tinta_dp_done

  tinta_dp_download_fail:
    ; Limpieza defensiva: si la descarga falló a medias quedó un .exe
    ; truncado. Delete sobre archivo inexistente es no-op silencioso.
    Delete "${TINTA_DP_TEMP_EXE}"
    MessageBox MB_OK|MB_ICONINFORMATION "No pude descargar el soporte para el lector de huella. Puede ser que no haya conexion a internet o que el server de HID no haya respondido. Tinta queda instalada y funcional.$\r$\n$\r$\nCuando tengas internet, descarga el instalador desde:$\r$\n${TINTA_DP_HELP_URL}"
    Goto tinta_dp_done

  tinta_dp_hash_fail:
    ; Hash mismatch en AMBAS fuentes (mirror y origen) → MITM, asset
    ; rotado sin actualizar el pin, o disco corrupto. Cualquiera de las
    ; tres: no ejecutamos ese binario, punto. Instalación manual.
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
    nsExec::ExecToStack '"${TINTA_PS64}" -NoProfile -Command "if (pnputil /enum-drivers | Select-String -Pattern $\'dPersona|U\.are\.U$\' -Quiet) { exit 0 } else { exit 1 }"'
    Pop $0
    Pop $1  ; output, descarted
    StrCmp $0 "0" tinta_drv_already tinta_drv_download

  tinta_drv_download:
    DetailPrint "Driver del lector no detectado. Descargando (~5 MB)."

    ; Script PowerShell que: (1) descarga el ZIP del driver del mirror R2,
    ; (2) verifica el SHA256 pineado, (3) lo extrae, (4) corre
    ; pnputil /add-driver /install. Mismo patrón que el .ps1 del agente
    ; — archivo temporal, argv quoted, sin escapar comillas inline.
    ;
    ; Exit codes:
    ;   0 = ok (driver registrado en el store, listo para bindear cuando
    ;       el reader se conecte físicamente)
    ;   1 = falló la descarga (404, sin internet, URL stale)
    ;   2 = falló la extracción (ZIP corrupto)
    ;   3 = falló pnputil (driver incompatible con arch — típicamente ARM64)
    ;   4 = hash mismatch (MITM, objeto rotado en R2, descarga corrupta)
    FileOpen $2 "${TINTA_DP_DRIVER_TEMP_PS1}" w
    FileWrite $2 'param([string]$$Url,[string]$$ZipPath,[string]$$ExtractDir,[string]$$Expected)$\r$\n'
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
    ; Descarga directa del mirror R2 — sin headers "mágicos": el bucket es
    ; nuestro, cero bot-protection. (El spoof de browser que vivía acá era
    ; para el Cloudflare de hidglobal.com; esa carrera se perdió en
    ; jul-2026 — ver comentario del define TINTA_DP_DRIVER_URL.)
    FileWrite $2 'try { Invoke-WebRequest -Uri $$Url -OutFile $$ZipPath -UseBasicParsing -TimeoutSec 180 } catch { exit 1 }$\r$\n'
    FileWrite $2 'if ((Get-FileHash $$ZipPath -Algorithm SHA256).Hash -ne $$Expected) { Remove-Item $$ZipPath -Force -ErrorAction SilentlyContinue; exit 4 }$\r$\n'
    FileWrite $2 'try { if (Test-Path $$ExtractDir) { Remove-Item $$ExtractDir -Recurse -Force } } catch {}$\r$\n'
    FileWrite $2 'try { Expand-Archive -Path $$ZipPath -DestinationPath $$ExtractDir -Force } catch { exit 2 }$\r$\n'
    ; El paquete SFW-02580 de HID contiene un ZIP ANIDADO:
    ;   Legacy-X.Y.Z/DP4500-X.Y.Z.zip  ← este tiene el driver adentro
    ;   Legacy-X.Y.Z/Release Notes ...pdf
    ; Expand-Archive solo descomprime un nivel; sin recursión sobre los
    ; .zip que aparezcan después, Get-ChildItem nunca encuentra el .inf
    ; (vive adentro del .zip nested que sigue sin tocar). Loopeamos hasta
    ; que no queden .zip nuevos — con cap a 5 vueltas por defensa contra
    ; loops infinitos (ZIP malicioso con auto-referencias improbable
    ; pero no imposible).
    FileWrite $2 'for ($$i = 0; $$i -lt 5; $$i++) {$\r$\n'
    FileWrite $2 '  $$nested = Get-ChildItem -Path $$ExtractDir -Filter $\"*.zip$\" -Recurse -ErrorAction SilentlyContinue$\r$\n'
    FileWrite $2 '  if (-not $$nested) { break }$\r$\n'
    FileWrite $2 '  foreach ($$nz in $$nested) {$\r$\n'
    FileWrite $2 '    $$dst = Join-Path $$nz.DirectoryName ($$nz.BaseName + $\"_x$\")$\r$\n'
    FileWrite $2 '    try { Expand-Archive -Path $$nz.FullName -DestinationPath $$dst -Force } catch { }$\r$\n'
    ; Remove-Item siempre, dentro o fuera del try — si Expand falló queremos
    ; sacar el .zip corrupto del filesystem para que la próxima iteración no
    ; lo re-encuentre y queme las 5 vueltas del cap sin progreso.
    FileWrite $2 '    Remove-Item $$nz.FullName -Force -ErrorAction SilentlyContinue$\r$\n'
    FileWrite $2 '  }$\r$\n'
    FileWrite $2 '}$\r$\n'
    ; Busca el INF en cualquier subcarpeta. Después del unzip recursivo,
    ; la estructura típica es Legacy-X.Y.Z/DP4500-X.Y.Z_x/x64/dPersona_x64.inf.
    FileWrite $2 '$$inf = Get-ChildItem -Path $$ExtractDir -Filter $\"dPersona_x64.inf$\" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1$\r$\n'
    FileWrite $2 'if (-not $$inf) { exit 2 }$\r$\n'
    ; pnputil necesita admin — cubierto por la elevación ambiente del
    ; installer (installMode perMachine, UAC único al doble click; antes
    ; el installer era per-user y este paso pedía su PROPIO UAC via
    ; -Verb RunAs). Sin RunAs, -NoNewWindow vuelve a ser compatible y
    ; evita el flash de console window.
    ; pnputil retorna 0 en éxito, no-cero en cualquier fallo (firma, arch,
    ; INF inválido). Mapeamos cualquier fallo a exit 3.
    ; El path del INF va quoted DENTRO de un único string de argumentos:
    ; Windows PowerShell 5.1 hace join naive de -ArgumentList sin quotear
    ; elementos con espacios — con un TEMP tipo C:\Users\Juan Perez\...,
    ; pnputil recibiría el path partido en dos argumentos y fallaría.
    FileWrite $2 '$$pnpArgs = $\'/add-driver "{0}" /install$\' -f $$inf.FullName$\r$\n'
    FileWrite $2 '$$proc = Start-Process -FilePath $\"pnputil.exe$\" -ArgumentList $$pnpArgs -Wait -PassThru -NoNewWindow$\r$\n'
    FileWrite $2 'if ($$proc.ExitCode -ne 0) { exit 3 }$\r$\n'
    FileWrite $2 'exit 0$\r$\n'
    FileClose $2

    nsExec::ExecToLog '"${TINTA_PS64}" -NoProfile -ExecutionPolicy Bypass -File "${TINTA_DP_DRIVER_TEMP_PS1}" "${TINTA_DP_DRIVER_URL}" "${TINTA_DP_DRIVER_TEMP_ZIP}" "${TINTA_DP_DRIVER_TEMP_DIR}" "${TINTA_DP_DRIVER_SHA256}"'
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
    StrCmp $0 "4" tinta_drv_hash_fail
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

  tinta_drv_hash_fail:
    ; Mismatch contra el pin: MITM, objeto rotado en R2 sin actualizar el
    ; define, o descarga corrupta. No usamos ese ZIP; instalación manual.
    MessageBox MB_OK|MB_ICONEXCLAMATION "El driver del lector que descargue no coincide con la firma esperada — no lo voy a usar por seguridad. Tinta queda instalada. Descarga el driver manualmente desde:$\r$\n${TINTA_DP_DRIVER_HELP_URL}"
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
