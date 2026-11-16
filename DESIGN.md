# Tinta Desktop — recepción

La identidad aprobada vive en BRAND.md. Esta migración sustituye el terracota,
Fraunces y el logo tipográfico anteriores. No cambia los contratos de datos,
validaciones, permisos, atajos, sincronización ni persistencia local.

## Base visual

- Azul de marca #183e55 para acción primaria y énfasis; blanco #ffffff para fondo.
- Superficie secundaria #edf4f3, separadores #cedbdc y texto secundario #4b626e.
- Los equivalentes HSL en `src/styles/globals.css` permiten opacidad en Tailwind.
  Las escalas `brick` y `paper` conservan sus nombres por compatibilidad interna,
  pero ya representan azul Tinta y superficies neutras, respectivamente.
- Tema oscuro derivado de la tinta (tono 203°), no de un slate genérico: fondo
  `204 45% 9%`, tarjetas `204 38% 13%`, popover `204 36% 15%`, texto papel frío
  `195 30% 96%`. Acción azul claro con texto de tinta. Logo en variante blanca.
- Navegación lateral como campo de tinta en ambos temas (#183e55 en claro, tinta
  profunda en oscuro) con símbolo y nombre blancos: «tinta sobre papel».
- Verde lima (#d9edaa) solo para selección de texto y para el icono de la sección
  activa en la navegación. Es acento de ubicación: nunca significa «pagado».
- Resaltado de opciones (menús, selects, búsqueda): superficie `--accent` más
  anillo interior de 1px en `--ring` (≥3:1 contra el popover en ambos temas).
- Éxito verde, advertencia ámbar y error rojo conservan su significado operativo;
  siempre se acompañan de texto o icono. No usar marca como estado de vigencia.
- Dinero siempre con centavos ($20.00) en toda la app.

## Vigencia, objeto firma

- «¿Puede pasar?» se responde con `VigenciaBadge` (`src/components/members/`) en
  búsqueda, lista, ficha, cobro y entradas, siempre igual: icono + palabra +
  precisión («Vigente · hasta 3 dic», «Por vencer · vence en 5 días», «Vencido ·
  hace 39 días», «Sin primer pago», «Sin membresía», «Inactivo»).
- Se deriva de `access_status` del backend (`src/lib/vigencia.ts`), nunca del
  `membership.status` crudo. Un socio que no puede entrar no tiene «Registrar
  entrada» como acción principal: cobrar es la única acción rellena.

## Permisos visibles

- Lo restringido se explica con `RestrictedNote`, que nombra el permiso exacto
  («Requiere el permiso «Ver totales de dinero». Pídeselo al dueño.»). Nunca un
  panel vacío, un cero que parezca dato ni una redirección muda.

## Ayuda en contexto

- Las pantallas de recepción (Socios, Ingresos, Entradas, Caja, Venta rápida)
  llevan `HelpHint` junto al título: «Cómo funciona», discreto, que abre
  `/help#<tema>` con ese tema desplegado y enfocado. Un solo patrón y una sola
  etiqueta; el nombre accesible dice la tarea («Cómo funciona: contar y cerrar
  caja»). Ayuda funciona sin internet.
- Las acciones que no deben competir con la principal van detrás de una
  pregunta que dice cuándo se usan (Caja sin abrir: «¿Entró o salió efectivo
  antes de abrir la caja?»), no como botones al lado del primario.
- Desplegables: un solo chevron (derecha cerrado, abajo abierto) definido en
  `globals.css`; enlaces internos con chevron, la flecha diagonal sólo para lo
  que abre fuera de Tinta. Los signos van como icono, nunca como «+ » en el texto.

## Atajos (una letra, un significado)

Ctrl/⌘+K Buscar · P Cobrar · C Entradas · K Abrir kiosco (también Ctrl+Alt+K) ·
V Venta rápida · N Nuevo socio · I Inicio. En la ficha: P cobrar a este socio,
C prepara su entrada (Enter confirma; una tecla nunca escribe), E editar, Esc
vuelve a donde venías. Los diálogos devuelven el foco al control que los abrió.

## Tipografía e identidad

- Títulos y `font-display`: Manrope local, exclusivamente peso 700, sin síntesis.
- Lectura, formularios y cifras: Inter si está instalada, después sans del sistema.
  No se descargan fuentes de Google: el arranque no depende de internet.
- Datos monetarios y fechas con cifras tabulares. Base 16px; controles operativos
  grandes y cantidades destacadas conservan su escala existente.
- Logo y símbolo: SVG oficiales de `public/brand/`, proporciones intactas.
  Iconos de distribución generados con `pnpm tauri icon public/brand/tinta-app-icon.svg`.

## Operación

Modo Operate: la identidad acompaña el trabajo, no compite con él. Sin hero,
ilustraciones, patrones de fondo ni adornos de landing. Español mexicano directo,
profesional y cercano, sin referencias de clase ni lenguaje infantil.

Se conservan los flujos: acceso por operador/PIN y recuperación por correo;
búsqueda de socios y ficha con vigencia; cobro y nuevo vencimiento; entradas por
huella, número o búsqueda; apertura, movimientos, conteo y cierre de caja.

- Botones e inputs compartidos: 44px; acciones principales de recepción: 48–56px.
- Foco visible también en controles nativos; filtros exponen `aria-pressed`.
- Acciones de filas de socios visibles sin hover, accesibles desde teclado.
- Diálogos limitados al alto disponible con scroll interior: el cierre y los
  campos siguen alcanzables en la ventana mínima de 1024 × 640.
- Tamaño inicial de escritorio: 1280 × 800. Conservar las ventanas independientes
  de entrada y kiosco, sus mínimos y sus atajos.
- Vacío con explicación y acción cuando exista; carga y error conservan sus
  estados reales. Deshabilitado visible, sin ocultar la razón en formularios.
- Respetar reducción de movimiento. Las transiciones no retrasan la operación.

## Convenciones de recepción

- Navegación con etiquetas visibles por defecto (220px). Se puede contraer a
  70px y la preferencia se conserva localmente. En modo contraído, tanto el
  puntero como el foco de teclado muestran las etiquetas completas. El foco
  dejado por un clic no fija el menú: al retirar el puntero se contrae. Solo la
  navegación por teclado conserva la expansión hasta que el foco sale; «Fijar
  navegación» mantiene la preferencia de ancho permanente.
- La barra superior mantiene las mismas herramientas y el mismo orden en todos
  los módulos: Buscar, Cobrar, Pantallas, Montos, Tema, Ayuda, sincronización y
  Cuenta. Buscar abre siempre el mismo diálogo, también donde hay búsqueda local.
  Montos, Tema y Ayuda son botones directos con etiquetas visibles; Cuenta reserva
  perfil, configuración y cerrar sesión. Pantallas agrupa kiosco y ventana de
  entradas, conservando exclusión mutua y atajos. No repetir sus lanzadores en
  Entradas. Las acciones específicas del módulo viven junto a su título.
- La barra cabe a 1024px con navegación abierta. En ancho compacto las utilidades
  combinan icono y etiqueta breve; ninguna herramienta desaparece por la ruta.
  Los avisos de solo lectura y lector se colocan en una franja independiente sin
  desplazar el orden de herramientas. La búsqueda devuelve el foco a su origen.
- En Socios, la búsqueda antecede a los filtros. Todos, Activos, Por vencer,
  Vencidos y Sin membresía son inmediatos, cada vista con su orden por defecto;
  Sin primer pago, «Sin vigencia» (la suma de los tres casos), Inactivos, Sin
  renovar y Con saldo viven en «Más filtros». Cada vista sin vigencia dice en
  una línea qué agrupa y qué acción le toca. La búsqueda encuentra por el
  inicio de cualquier palabra del nombre (apellidos incluidos), por folio o
  número de socio exactos y por teléfono; los resultados que empiezan con el
  término van primero. «Cobrar» en una
  fila abre el cobro del socio; el nombre enlazado abre su ficha. Un socio activo
  sin membresía ofrece «Activar membresía», usando el mismo formulario de cobro.
  Inactivos no reciben esa acción. Estado y vencimiento comparten «Vigencia»;
  no repetir «Sin plan» en varias columnas. Tres puntos se reserva para menús.
- La búsqueda compartida muestra resultados dentro del flujo del diálogo,
  con flechas, Enter y Escape. El primer Escape cierra las sugerencias; el
  siguiente puede cerrar el diálogo. Un error ofrece reintento y nunca se
  presenta como «sin resultados».
- En el cobro, el contenido largo tiene scroll y el pie permanece visible con
  importe, método, nueva vigencia, saldo pendiente y confirmación. Promoción,
  descuento y pago parcial se despliegan cuando hacen falta.
- Entradas muestra instrucciones del método elegido, con selección accesible.
  La espera usa texto; el resultado conserva icono, nombre y explicación en un
  anuncio accesible, a escala compacta. La señal grande permanece en kiosco.
  El historial vacío es una línea, sin reservar una columna; con contenido se
  coloca a la derecha desde 1280px y debajo en ventanas menores.
- Carga con texto; error con una vía de recuperación. Los errores de cobro no
  exponen excepciones técnicas. Advertencia usa fondo suave y texto contrastado;
  acciones destructivas conservan contraste también en oscuro.

## Composición de trabajo

- Inicio abre con búsqueda para atender a un socio. La actividad del día es
  una franja compacta; «Por revisar» y «Últimos cobros» son listas abiertas con
  divisores. El resumen mensual del dueño se despliega bajo demanda. No repetir
  en el contenido la navegación y las acciones que ya ofrece el shell.
- Cada zona tiene una función: sidebar para destinos, barra para herramientas
  comunes y estado, contenido para la tarea actual. Los buscadores locales de
  Inicio, Socios y Entradas conservan su propósito. Buscar y Ctrl/Cmd+K mantienen
  disponible la consulta global en un diálogo, separado de registrar una entrada.
  Consultar no produce una entrada.
- Secciones abiertas para lectura y listas; borde para tablas y grupos que
  necesitan contención. `SectionCard` admite `appearance="plain"`; no combinar
  borde y sombra como decoración por defecto.
- Fotos para reconocer personas; iniciales con fondo neutro del tema cuando no
  hay foto. El avatar no codifica estados ni usa colores de la marca anterior.
- Texto adulto y concreto: «Dueño», «Operador», «Cobrar», «Activar membresía».
  Eliminar explicaciones redundantes cuando la acción y el contexto bastan.

## Accesibilidad y ayuda operativa

- El teclado numérico muestra cifras para números de socio. Solo los PIN de
  acceso y perfil se enmascaran explícitamente con `masked`. Un estado accesible
  informa la cantidad introducida (de cuatro dígitos) sin revelar credenciales.
- Enter y Espacio activan el botón enfocado; el atajo de envío no intercepta
  botones, enlaces, otros campos ni diálogos superpuestos. Escape/cancelación
  del acceso devuelve el foco al operador que abrió el diálogo.
- Los grupos de opciones tienen nombre accesible, incluido Método de pago.
- `success-text` y `destructive-text` son tokens locales para texto sobre sus
  fondos `*-soft`; no reutilizar el color de relleno de botones como texto
  pequeño sobre tintes. Pares calculados claro/oscuro: éxito 7.12/11.17:1 y
  error 6.85/8.04:1. Conservar icono o texto además del color.
- La barra superior y Configuración enlazan a Ayuda para recepción, disponible para dueño
  y operador. Las instrucciones de búsqueda, cobro, entrada, caja y conexión
  están incluidas en la app y no necesitan red. El contacto reutiliza el canal
  de soporte existente; abrir WhatsApp requiere conexión y no envía mensajes
  automáticamente. No prometer tiempos de respuesta.

## Verificación

Revisar en claro y oscuro: acceso, búsqueda y vigencia, cobro, entrada y caja.
Usar únicamente datos ficticios y nunca disparar mensajes a clientes reales.
La revisión web no sustituye probar lector, impresión, almacenamiento seguro,
actualizaciones y reconexión en el ejecutable Tauri.

<!-- tinta-brand:begin -->
## Referencia de identidad compartida

Lee [BRAND.md](BRAND.md) para la identidad aprobada, colores, tipografía de marca y
variantes oficiales del logo en `public/brand/`. Esta referencia rige la marca;
las reglas operativas de este documento se conservan.
La sincronización distribuye archivos, pero no cambia los componentes ni el tema.
Los colores y fuentes anteriores descritos aquí representan la interfaz existente,
no una alternativa a la nueva marca. Su migración requiere un cambio visual explícito.
<!-- tinta-brand:end -->

## Confirmación y recuperación en recepción

- Un cobro confirmado se cierra automáticamente. La ficha presenta importe,
  folio, vigencia y «Ver comprobante»; el historial conserva el acceso después.
  No abrir un segundo modal de comprobante sin una acción explícita. La carga
  de una membresía actualizada no reinicia el intento de cobro abierto.
- Durante una escritura financiera, usar `Dialog busy` y deshabilitar cancelar
  y confirmar. X, Escape y fondo no descartan el resultado pendiente. Un error
  incierto conserva la llave del intento para reintentar sin generar otro cobro.
- Una caja única se omite visualmente solo después de confirmar el catálogo.
  Carga, catálogo vacío y error tienen estado propio; no equivalen a caja
  principal. El formulario espera `onReadyChange` antes de registrar efectivo.
- «Solo lectura» se conserva con la sesión y rige botones, atajos y acciones por
  URL de la ficha. Consultar un historial o comprobante no modifica datos.
- Los errores operativos de entrada se distinguen de un socio inexistente.
  Nunca convertir fallos de consulta en cero destinatarios o cupos inventados.
- Importación se presenta como CSV: preparar, asociar columnas, revisar y
  confirmar. Usar nombres de campos en español y ejemplos de fecha explicados;
  conservar el contrato de columnas de la API. Diferenciar filas recibidas,
  candidatos y duplicados; el servidor mantiene la validación final.
- Mensajes tiene una sola cabecera, tareas en pestañas y el canal explicado.
  Número propio pendiente no se ofrece como conexión disponible. Los permisos
  técnicos se conservan, sin vender un plan futuro para resolver un bloqueo.
- En ajustes, identidad y operación permanecen visibles; fiscal, imagen y
  hardware avanzado se despliegan. Etiquetas accesibles llegan al control,
  incluido el pulgar de cada deslizador. El selector de prefijo se llama
  «Código de país».
- El kiosco se adapta también a la altura de ventana; teclado y confirmación
  deben estar completos a 1024 × 640. Los pies fijos respetan el ancho real de
  navegación. Las métricas monetarias se redistribuyen antes de truncarse.

## Consistencia de tareas y estados

- Catálogo de Productos: búsqueda y filtros antes de una franja de existencias;
  la primera fila debe ser visible a 1024 × 640 con navegación abierta. Valor
  de venta y ganancia potencial se consultan en un resumen desplegable del dueño,
  conservando los permisos de márgenes. La ganancia potencial no es ingreso.
- Un fallo de catálogo no muestra cero, «todo en orden» ni un vacío de primera
  utilización. Ofrece reintento; si hay datos anteriores, los identifica como
  información que puede haber cambiado.
- Configuración agrupa enlaces en Operación del gimnasio, Cuenta y equipo,
  y Ayuda y aplicación. Las descripciones respetan el rol. Las cuotas generales
  de membresías se despliegan después del catálogo, sin desplazar la tarea.
- Reportes distingue un selector de períodos predefinidos de fechas exactas;
  no repite «Más períodos» junto a otro control equivalente.
- Inscripción conserva un solo formulario. El final repite nombre, importe,
  método y vigencia. La confirmación dice «Inscribir y cobrar [importe]» o
  «Inscribir sin cobro», según la decisión real.
- Solo lectura bloquea alta, importación, cambio de número y envío de
  comprobantes tanto en sus controles como en la capa de solicitudes. Lecturas,
  descarga/impresión, recuperación de sesión y sincronización siguen disponibles.
  Las consultas no materializan pagos programados bajo solo lectura. Esta
  protección de interfaz complementa los permisos autoritativos del servidor.
- Los atajos de página no actúan bajo diálogos ni después de un evento ya
  atendido. En la ficha, P y C pertenecen al socio, no a la barra global. P y la
  acción de cobro por URL requieren socio activo. Escape cierra primero el
  comprobante y conserva la ficha; se devuelve foco al botón que lo abrió.
- Una ficha inactiva prioriza Reactivar y llama «Verificar acceso» a la revisión
  de entrada, dejando claro que no autoriza acceso. Los atajos anunciados deben
  corresponder a acciones disponibles.
- Selectores y menús tienen nombre accesible; la vista de Productos expone su
  selección. Texto pequeño de vigencia, importes favorables y sincronización
  usa success-text; las insignias de éxito usan success-soft como superficie.
- Errores de número, estado, edición, vigencia, catálogos, promociones y cajas
  muestran el mensaje normalizado de ApiError; sus detalles técnicos se conservan
  para diagnóstico y nunca sustituyen el mensaje operativo. Una entrada fallida
  por servicio no se presenta como socio inexistente.


## Márgenes y densidad entre módulos

- `PageContainer` define el marco común: 24px de margen interior en los cuatro
  lados y un ancho máximo de 1280px, centrado en el espacio disponible junto a
  la navegación. Catálogos, ingresos, caja, gastos, reportes y ajustes comparten
  este origen; no elegir un margen exterior distinto en cada página.
- Formularios (`contentWidth="form"`, hasta 768px) y lectura
  (`contentWidth="reading"`, hasta 896px) limitan el contenido dentro del mismo
  marco, alineado a la izquierda por defecto. Nuevo socio es la excepción: su
  cabecera y formulario de hasta 768px quedan centrados en el área de trabajo,
  también durante la confirmación de duplicados y el paso de huella. Los módulos
  incrustados usan `embedded` para heredar márgenes.
- Venta rápida y Entradas son superficies de trabajo de ancho completo: sus
  cabeceras conservan 24px de separación y los paneles reparten el espacio. Venta
  mantiene el cobro fijo; el teclado de Entradas adapta las cuatro filas a la
  altura disponible con teclas de al menos 44px. Acceso, kiosco y ventana flotante
  conservan sus composiciones independientes.
- El pie fijo de compra usa el mismo marco que su formulario. Tablas con `flush`
  no añaden un margen superior vacío. En Ingresos, filtros, resumen compacto y
  movimientos sustituyen la fila de cinco tarjetas. En ventana compacta, la hora
  acompaña a la fecha y las acciones de corrección/devolución conservan nombres
  accesibles al mostrar solo su icono; el comprobante conserva todo el detalle.

## Dependencias de cobro y solo lectura

- La ausencia de configuración de cuotas no significa que inscripción y
  mantenimiento sean gratis. Cobro e inscripción con pago esperan datos conocidos,
  muestran «Total por confirmar» y permiten reintentar una consulta fallida. Una
  configuración vacía confirmada es válida. Los datos locales ya conocidos siguen
  disponibles si falla su actualización; no exigir conexión a internet para cobrar.
  Inscribir sin cobro permanece disponible sin esa dependencia.
- Los catálogos y el historial de ingresos distinguen carga, error y vacío.
  No presentar totales en cero ni una invitación de primera utilización cuando la
  consulta falló. Si quedan datos de una consulta anterior, identificarlos como tales.
- `requiresWrite` en botones, confirmaciones e interruptores indica operaciones
  que necesitan escritura. La sesión de solo lectura bloquea esos controles y
  conserva cancelar, consultar, copiar y descargar. La protección de solicitudes
  sigue siendo la última barrera. No usar este indicador para filtros de consulta.
- «Solo lectura» abre una explicación y enlaza a Ayuda. No atribuir el bloqueo a
  una causa que la sesión no informa. La búsqueda global conserva su botón visible
  y su atajo, incluso en anchura compacta y solo lectura.
- Promociones vigentes y membresías activas comparten el estado de éxito con texto.
  Acciones de promoción y selectores de Bitácora tienen nombres accesibles. El pie
  de kiosco y la hora de la ventana de entradas no reducen la opacidad del texto.
  La zona horaria presenta nombres de ciudad; conserva el identificador IANA al guardar.


## Recuperación y acciones disponibles

- Con menos de 1024 px disponibles (incluido zoom), navegación contraída de
  70 px y expansión superpuesta con puntero, teclado o fijación temporal. No
  sobrescribir la preferencia de navegación del tamaño normal. La barra superior
  permite varias filas, conserva etiquetas y muestra el estado de sincronización
  también con palabras.
- Entradas, kiosco y autorización manual explican solo lectura antes de pedir
  datos. Sus controles y envíos quedan bloqueados; consultar historiales sigue
  disponible. El error tipado de permisos conserva su causa y los fallos de
  servicio nunca se atribuyen al número o identidad del socio.
- Operadores muestra cupos sólo después de conocer el catálogo. Carga anuncia
  «Consultando operadores»; error ofrece reintento, sin habilitar alta con cupo
  desconocido. Si hay caché, conserva los datos y señala que no se actualizaron.
- Paginación de Socios tiene etiqueta visible «Por página» y nombre accesible
  «Socios por página». Los estados de botón y las preferencias no dependen de
  iconos sin nombre ni exclusivamente del color.
- Ayuda comienza con «Resolver ahora»: cobro incierto, pérdida de internet y
  entrada bloqueada. Tareas habituales y soporte siguen después, en ese orden.
  Las instrucciones locales y la prevención de cobros duplicados se conservan.
- Mensajes y Alertas describen las capacidades del canal actual. Textos aprobados
  se muestran como contenido legible; el editor aparece sólo si se puede editar.
- Devolución y Corte mantienen cabecera y acciones visibles; sus campos largos
  se desplazan en el cuerpo del diálogo. Conteo conserva instrucciones críticas
  visibles y despliega el detalle sobre sincronización y cambios concurrentes.
