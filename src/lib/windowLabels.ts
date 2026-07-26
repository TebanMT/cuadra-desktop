// Labels canónicos de las ventanas Tauri. Viven en su propio módulo (sin
// dependencias) porque los necesitan tanto kioskWindow.ts como
// floatWindow.ts para sus guards de exclusión mutua — si cada uno
// importara el label del otro tendríamos un import circular.
//
// Mapa de ventanas:
//   main          → app de recepción (DashboardLayout + GlobalCheckinScanner).
//   kiosk         → pantalla dedicada al socio (segundo monitor).
//   checkin-float → mini-ventana always-on-top para gyms con UNA pantalla:
//                   el socio ve el resultado del check-in mientras el
//                   operador sigue trabajando en la main.
//
// kiosk y checkin-float son mutuamente excluyentes (configuraciones
// físicas distintas): ambos son superficies del socio que pintan y suenan
// los resultados de check-in que llegan por SSE del sidecar.
export const MAIN_WINDOW_LABEL = "main";
export const KIOSK_WINDOW_LABEL = "kiosk";
export const CHECKIN_FLOAT_WINDOW_LABEL = "checkin-float";
