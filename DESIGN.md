# Cuadra — Principios de diseño

Sobrio y confiable, no startup-trendy. Cerca de Banorte/Santander en seriedad, lejos de Revolut. Tipografía grande, alto contraste. Density baja en pantallas operativas, density media en dashboard. Iconografía clara, no ilustraciones. Español mexicano. Sin emojis decorativos en UI.

## Tokens

| Token | Valor (HSL) | Uso |
|---|---|---|
| `--primary` | `224 76% 33%` (deep navy) | acentos, CTAs, brand. |
| `--background` | `0 0% 100%` | superficies. |
| `--foreground` | `222 47% 11%` | texto principal, alto contraste. |
| `--muted-foreground` | `215 14% 40%` | texto secundario, sin colores grises tan claros que lastimen. |
| `--success` | `142 72% 32%` | verde saturado, no pastel. |
| `--warning` | `38 92% 50%` | ámbar de alerta. |
| `--destructive` | `0 78% 48%` | rojo saturado para errores y borrados. |
| `--border` | `215 20% 88%` | bordes sutiles. |

Tokens completos en `src/styles/globals.css`.

## Tipografía

- Sans: **Inter** (fallback al sistema).
- Tamaño base: 16px. Pantallas operativas (check-in, cobro): 18-20px y números grandes.
- Headings con `font-semibold tracking-tight` (definidos en `globals.css`).
- Las pantallas tipo kiosko (sesiones futuras) usarán `text-xl` / `text-2xl` para legibilidad a 3 metros.

## Density

- **Operativo (check-in, cobro):** botones grandes (`size="lg"` o `xl`), padding generoso, una sola acción primaria por pantalla.
- **Dashboard / configuración:** density media; tablas con filas de 48-56px.

## Componentes

- Inputs: alto 44px (`h-11`), focus ring visible (`ring-2 ring-ring`).
- Botones primarios: `bg-primary` deep navy.
- Cards: bordes finos (1px) y sombras suaves, no flat extremo.
- No utilizar gradients animados, glass morphism, ni "glows" — esto es un sistema operativo, no un launcher.

## Color y contraste

- Cumplir WCAG AA mínimo. Textos `--foreground` sobre `--background` están en >12:1.
- Estados de sync (UC-044): verde discreto (no chillón), ámbar para offline, rojo para error.
- No usar color como única señal: siempre acompañar con icono o texto.

## Voz

- Español mexicano directo. Tutear al operador.
- "Tu prueba terminó" mejor que "Tu período de prueba ha expirado".
- Errores en lenguaje llano. No mostrar códigos técnicos al usuario.
- "Sin internet, todo guardado en esta laptop" > "Modo offline activo".

## Qué evitar

- Ilustraciones decorativas (aplica preferentemente a UI operativa; el AuthShell lateral es el único lugar con un mensaje "marca").
- Emojis dentro de botones, labels, errores. (Excepción: 🎉 controlado en Step 5 del wizard como celebración puntual — y solo usando el icono `PartyPopper` de lucide, no emoji unicode.)
- Toasts decorativos para acciones triviales.
- Animaciones de >250ms.
- Scroll horizontal.
