# Seguimiento de la revisión de recepción

Implementación del 11 de noviembre de 2026. Referencia: [crítica previa](../.impeccable/critique/2026-11-11T23-05-48Z__src-routes-index-tsx.md). Se conserva la identidad aprobada y los cambios locales anteriores. Esta pasada no modifica BRAND.md ni public/brand/.

## Cinco prioridades resueltas

| Hallazgo | Implementación | Verificación |
|---|---|---|
| Solo lectura incompleto | Regla común para solicitudes de escritura, incluido multipart y URL directa; controles y manejadores de alta, importación, número y envío de comprobante bloqueados. Se mantienen consulta, impresión, descarga, autenticación y sincronización. Las consultas no materializan gastos ni migran cuotas en este modo. | Pruebas de API, alta, ficha y comprobante; capturas 05 y 15. La autorización del servidor sigue siendo necesaria. |
| Fallo de Productos presentado como inventario vacío | Carga, error, vacío y datos anteriores separados. Reintento explícito, sin totales inventados. | Pruebas de catálogo; captura final 18. |
| Atajos, etiquetas y contraste | Los diálogos aíslan atajos; P/C de ficha no disparan la barra global. P requiere socio activo y escritura. Escape conserva la ficha y devuelve el foco. Selectores nombrados, vista seleccionada expuesta y tokens semánticos de texto corregidos. | Pruebas de ficha y visor real; Escape comprobado en navegador; árbol accesible de promoción; capturas 06, 15 y 20. |
| Composición administrativa | Catálogo y filtros primero, existencias en franja compacta y finanzas desplegables. Ajustes agrupados por tarea. | Capturas 01, 03 y 09; primera fila visible a 1024 × 640. |
| Alta que no explicaba el cobro | Resumen final con nombre, importe, método y vigencia; «Inscribir y cobrar [importe]» o «Inscribir sin cobro». Un solo formulario. | Pruebas de MemberForm y captura 04. |

## Ajustes adicionales

| ID | Resultado |
|---|---|
| M1 | «Importar socios» conserva la explicación y el contrato CSV. |
| M2 | Placeholder global breve «Buscar…», sin perder nombre accesible. |
| M3 | El visor recibe el folio; si falta, muestra «Comprobante de pago». |
| M4 | Descripción de Ajustes según rol. |
| M5 | Error de servicio al registrar entrada diferenciado de socio desconocido. |
| M6 | Mensajes normalizados de ApiError; no se presentan excepciones técnicas en los formularios señalados. La detección interna de duplicados se conserva. |
| M7 | Menú de acciones de operador con nombre contextual. |
| M8 | Eliminadas las referencias comerciales «Plus» señaladas, conservando las restricciones existentes. |
| M9 | Filtros del catálogo de 44 px y nombres accesibles. |
| M10 | Ficha inactiva prioriza Reactivar y explica qué hace Verificar acceso. |
| M11 | Catálogo de membresías antes de cuotas desplegables; un selector de períodos predefinidos junto a fechas personalizadas. |
| M12 | Sincronización usa success-text y acciones de 44 px. |

Las convenciones quedan en [DESIGN.md](../DESIGN.md#consistencia-de-tareas-y-estados).

## Evidencia visual

[Capturas y árboles accesibles](../.impeccable/review/implementation-followup/). Componentes reales con API ficticia y red bloqueada; no se enviaron mensajes ni se escribieron datos reales. El arnés queda archivado como texto y se retiró de las entradas ejecutables.

| Ventana | Pantallas y estados observados |
|---|---|
| 1024 × 640 | Productos claro y error oscuro; Ajustes e inscripción claros; ficha en solo lectura oscura; cobro confirmado, comprobante y Escape; comprobante de solo lectura; ficha inactiva; Reportes claro; promoción oscura, incluido el pie del diálogo. |
| 1280 × 800 | Productos oscuro, membresías claro, Reportes oscuro, Entradas claro, Caja oscuro y acceso claro. |

Las capturas 02 y 03 preceden ajustes menores: 18 sustituye a 02 como evidencia del error de Productos; después de 03 se retiró el redondeo de las filas de Ajustes. Se desactivaron animaciones únicamente en el arnés para evitar el reloj de animación congelado del entorno Safari. Esto verifica composición, no movimiento nativo. El regreso de foco final está cubierto por prueba del visor real; la captura de Escape comprueba permanencia en la ficha.

## Comprobaciones y límites

- `pnpm typecheck`: correcto.
- `pnpm lint`: 0 errores, 24 advertencias existentes.
- `pnpm build`: correcto; persiste el aviso de fragmento JavaScript mayor de 500 kB.
- `git diff --check`: correcto.
- `pnpm test`: 521 pruebas correctas en 92 archivos, incluida la protección de escritura, atajos, retorno de foco, error de catálogo y confirmación de inscripción.

La cobertura no equivale a todas las combinaciones de pantalla, tema, permiso y estado. Quedan para un entorno nativo de pruebas Windows/Tauri: recorrido con NVDA y zoom al 200 %, impresión, biometría, ventana flotante, reconexión/sincronización real y permisos del servidor. La revisión usa comprobantes ficticios; no certifica su PDF final ni envíos reales. No se cambió el transporte de sincronización ni la lógica de persistencia sin conexión.
