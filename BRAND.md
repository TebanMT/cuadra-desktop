# Tinta — Identidad compartida

Fuente de esta versión: `cuadra-landing/BRAND.md` y `cuadra-landing/public/brand/`.
Los repositorios conservan copias locales para funcionar y compilar por separado.
Para actualizar, edita la fuente y ejecuta desde cuadra-landing:

```sh
python3 scripts/sync-brand.py --apply
python3 scripts/sync-brand.py --check
```

Sin argumentos el comando muestra los cambios previstos. La sincronización incluye
solo identidad, recursos e instrucciones; no migra componentes ni temas existentes.
No editar las copias de BRAND.md o public/brand en desktop/dashboard: el comando
detecta modificaciones locales y se detiene antes de sobrescribirlas.

## Intención

Calidad profesional accesible. Tinta ayuda a llevar un gimnasio con orden y claridad.
Trato adulto, cercano y directo; sin estereotipos de clase, ostentación ni infantilización.
El nombre del producto es Tinta, aunque los repositorios conserven el prefijo cuadra.

## Logo

La dirección aprobada es A: nombre de contornos propios y T de trazo fluido.
El símbolo comparte la misma T. Los SVG son geometría vectorial, sin dependencia
de una tipografía instalada. No reconstruirlos con texto ni deformar sus proporciones.

| Recurso en public/brand | Uso |
| --- | --- |
| tinta-wordmark-ink.svg | Nombre azul sobre fondo claro |
| tinta-wordmark-white.svg | Nombre blanco sobre fondo oscuro |
| tinta-wordmark-black.svg | Nombre en monocromía negra |
| tinta-symbol-ink.svg | Símbolo azul |
| tinta-symbol-white.svg | Símbolo blanco |
| tinta-symbol-black.svg | Símbolo negro |
| tinta-app-icon.svg | T blanca sobre campo azul, base para iconos |

Logotipo: proporción 410:128. Símbolo: 128:128. Icono: 64:64.
Mantener altura automática al ajustar el ancho. Los iconos se revisaron a 16, 32,
48 y 128px; esos son tamaños comprobados, no una especificación de mínimos.
Usar SVG como fuente para futuras exportaciones PNG/ICO de Windows o PWA.
Las imágenes antiguas de las aplicaciones no se sustituyen automáticamente.

## Colores de marca

| Token compartido | Valor | Función |
| --- | --- | --- |
| --tinta-brand-ink | #183e55 | Identidad y énfasis |
| --tinta-brand-muted | #4b626e | Texto secundario en superficies claras |
| --tinta-brand-line | #cedbdc | Separadores |
| --tinta-brand-paper | #ffffff | Fondo claro |
| --tinta-brand-wash | #edf4f3 | Superficie clara secundaria |
| --tinta-brand-accent | #d9edaa | Acento suave, no estado semántico |

Disponibles en `public/brand/tokens.css`. Los tokens tienen prefijo para evitar
colisiones. No importar este archivo como una migración automática de --primary,
--success o --destructive. Los estados operativos y el tema oscuro se diseñan y
validan en cada app, con contraste AA y texto o icono además del color.

## Tipografía

Manrope Bold (700) para expresión de marca y títulos donde proceda; archivo local
`public/brand/fonts/manrope-bold.ttf` y licencia `OFL-Manrope.txt` junto a él.
`tokens.css` registra la familia `Tinta Manrope` sin aplicarla globalmente.
El logo es un dibujo propio: Manrope no lo reemplaza. En interfaces existentes se
conservan las fuentes de lectura actuales hasta una migración visual explícita.
No sintetizar otros pesos a partir de este archivo Bold.

## Marca común, interfaz específica

Leer también el DESIGN.md del repositorio. BRAND.md define identidad; DESIGN.md
rige densidad, navegación, tamaños de controles, estados y flujos de esa superficie.
Ante una discrepancia de marca, usar esta referencia para trabajo nuevo y señalar
la migración pendiente; no cambiar toda una interfaz como efecto secundario.

- Landing: ayudar a entender el producto y crear una cuenta de prueba.
- Recepción: cobrar, buscar socios y registrar acceso con rapidez, incluso sin conexión.
- Dashboard: consultar y administrar con claridad, especialmente desde el celular.

La consulta remota y WhatsApp requieren conexión. No prometer ingresos garantizados,
instalación instantánea ni capacidades que el producto todavía no implemente.
