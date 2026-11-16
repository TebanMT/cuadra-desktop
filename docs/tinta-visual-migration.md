# Migración visual de recepción — 2026-11-11

## Alcance

Marca aprobada de cuadra-landing aplicada a tokens, títulos, logos, componentes
compartidos y sus consumidores existentes. SVG oficiales y exportaciones de iconos
para distribución. Se conservaron API, stores, permisos, validaciones, atajos y
sincronización. BRAND.md y public/brand/ coinciden con todos los hashes originales
de .brand-sync.json; se preservaron los cambios locales previos.

## Comprobaciones

- Suite existente: 82 archivos, 474 pruebas aprobadas.
- Después del ajuste de diálogos: 23 pruebas de cobro/caja aprobadas.
- Typecheck y build aprobados. Build advierte sobre chunks mayores a 500 kB.
- ESLint: 0 errores, 25 advertencias.
- Detector Impeccable: sin hallazgos en los objetivos examinados.
- Revisión de código independiente corrigió logo residual en Sidebar y contraste
  de etiquetas neutras oscuras. No sustituye revisión visual independiente.

## Inspección visual realizada

Safari con componentes reales y un arnés temporal de respuestas ficticias,
posteriormente retirado. No se conectó el arnés al sidecar ni se permitieron
escrituras; no hubo cobros ni mensajes reales.

- 1024 × 640: acceso claro (operador y error), socios claros con vigencia y
  controles de paginación deshabilitados, diálogo de cobro oscuro con nueva
  vigencia, método, importe y foco visible.
- 1280 × 800: caja oscura sin movimientos y entrada manual clara sin entradas.
- Los formularios largos permiten scroll interior en el diálogo.

## Pendientes de validación

La revisión no cubrió cada combinación de pantalla/tema/estado, ni el shell
completo con todos los roles. Faltan pruebas visuales de ventanas auxiliares de
entrada (300 × 190 mínimo) y kiosco, operación completa dentro de Tauri, lector,
impresora, instalación de iconos, desconexión y resincronización reales. Las pruebas
automatizadas existentes siguen cubriendo los contratos que ejercitaban antes.

## Ajustes posteriores a la crítica

Se implementaron las cuatro prioridades: búsqueda compartida con recuperación de
errores y teclado completo; Socios centrado en buscar con filtros secundarios
desplegables; navegación expandida por defecto y preferencia persistente; cobro
con resumen y confirmación permanentes mientras se desplazan sus campos.

También se aplicaron controles de 44px, acceso directo al cobro desde la fila,
agrupación de acciones superiores sin perder atajos, rutas legibles, instrucciones
de entrada según el método, anuncios accesibles completos, carga con texto,
reintentos, mensajes de cobro sin excepciones técnicas y contraste semántico.
Las convenciones resultantes se incorporaron a DESIGN.md.

### Verificación final de esta iteración

- 83 archivos de pruebas y 479 pruebas aprobadas. Incluyen búsqueda, reintento,
  flechas, Enter y Escape dentro de un diálogo; los tests de cobro ejercitan
  también la sección desplegable de ajustes.
- Typecheck, build y `git diff --check` aprobados.
- ESLint: 0 errores, 25 advertencias. Build conserva aviso de chunk >500 kB;
  algunas pruebas conservan avisos de descripción faltante de Radix.
- Detector Impeccable: sin hallazgos en los componentes y pantallas examinados.
- Revisor independiente: los cuatro hallazgos de su revisión de código quedaron
  resueltos (advertencia, Escape, ArrowUp/scroll y conservación del foco).
  Este veredicto no constituye una aprobación visual independiente.
- Safari, datos ficticios, shell completo: Socios y cobro en claro a 1024 × 640;
  búsqueda dentro del diálogo y Escape; entrada manual y búsqueda con error y
  reintento en oscuro a 1280 × 800. Confirmados etiquetas laterales sin recorte,
  selección visible, resultados dentro del diálogo y pie de cobro alcanzable.
- Arnés temporal retirado y servidor propio detenido. Sin mensajes ni cobros
  reales. BRAND.md y recursos oficiales permanecen intactos.

Los pendientes nativos y las combinaciones no inspeccionadas descritos arriba
siguen pendientes; no se afirma una validación exhaustiva de todos los estados.

## Composición, acciones y textos de recepción

Implementación de las cinco prioridades de la segunda crítica:

- Inicio prioriza la consulta de socios; actividad compacta, pendientes y cobros
  en listas abiertas. El resumen mensual del dueño queda desplegable.
- Las secciones compartidas admiten composición abierta. Tablas con divisores;
  se elimina la combinación decorativa de borde y sombra en SectionCard.
- Se retira la fila de acciones repetidas de Inicio. La barra superior concentra
  cobro, sincronización y cuenta. Preferencias y lanzadores auxiliares siguen
  disponibles en Cuenta, con los atajos existentes.
- Socios reúne estado y fecha en Vigencia. El nombre abre la ficha; Cobrar y
  Activar membresía abren el flujo de pago existente. La activación se ofrece
  únicamente a socios activos y se deshabilita en solo lectura.
- Entradas concentra captura y resultado, sin segunda búsqueda global visible.
  Consulta global disponible mediante Ctrl/Cmd+K o Cuenta. Historial vacío en
  una línea; con contenido, lateral desde 1280px y apilado en tamaños menores.
- Métodos de entrada con selección accesible, resultados compactos para el
  operador, avatares neutros y roles traducidos. Kiosco conserva su escala.

La revisión independiente detectó un diálogo que permanecía abierto al navegar
desde una búsqueda sin coincidencias; se corrigieron ambas rutas de Enter y se
añadieron pruebas. El atajo P respeta ahora el mismo bloqueo de solo lectura que
el botón Cobrar.

Verificación automatizada: 84 archivos y 487 pruebas aprobadas. Las nuevas
pruebas cubren activación, ficha, inactivos, solo lectura, selección por teclado,
reintento, Escape y navegación desde búsquedas sin coincidencias. Detector sin
hallazgos en los objetivos de esta iteración. Hashes compartidos intactos.

Revisión visual con datos ficticios: Inicio claro y oscuro a 1280 × 800; Socios
claro a 1024 × 640; Entradas clara a 1024 × 640 y oscura en ambos tamaños. La
revisión oscura independiente comprobó que el teclado numérico es alcanzable
mediante scroll en la ventana mínima. No se ejecutaron cobros ni mensajes reales.

La revisión independiente final emitió `ship` para su muestra: añadió Socios
oscuro a 1024 × 640, Cuenta abierto y Ctrl/Cmd+K con navegación a una búsqueda
filtrada. Verificó en fuente el bloqueo del atajo P en solo lectura. Capturas
inspeccionadas directamente mediante CUA, sin archivos de imagen exportados.

Cierre: typecheck, build y diff-check aprobados; ESLint con 0 errores y las
25 advertencias existentes. Build conserva el aviso de chunk >500 kB. Fixture
retirado y servidor de revisión detenido. Se conservan los pendientes de prueba
nativa y hardware indicados anteriormente.
