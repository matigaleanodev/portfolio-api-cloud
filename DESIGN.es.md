# Adaptación visual: correo y Open Graph

[English](DESIGN.md)

Este documento adapta la **revisión 1** del [sistema de diseño del portfolio](https://github.com/matigaleanodev/portfolio/blob/main/DESIGN.md) (SHA-256 del `DESIGN.md` de origen: `8d7145d29b373d2ec7533641507b211d6217f39325d3c50e9650d20e8c3c88cd`). No es una segunda fuente de decisiones visuales: sólo indica cómo se aplica ese sistema donde los clientes de correo y un render determinista lo limitan. Ante una diferencia no listada aquí, gana el origen. Una revisión nueva del origen se adopta editando este documento; no hay paquete compartido ni sincronización automática.

Las reglas **DEBE** son criterios de aceptación; las reglas **CONVIENE** admiten un desvío registrado.

## Principios

- DEBE conservar la identidad Índigo de taller: acento índigo, jerarquía sobria, sin degradados, vidrio, brillos ni sombras.
- DEBE firmar como “Matias Galeano · Blog técnico” y escribir el texto visible en español.
- CONVIENE limitar la composición a firma, título, texto de apoyo y una acción.

## Color

| Token        | Claro   | Oscuro  |
| ------------ | ------- | ------- |
| `canvas`     | #F3F4F7 | #141A24 |
| `surface`    | #FCFCFE | #1F2937 |
| `text`       | #1F2937 | #EAECF2 |
| `text-muted` | #4B5563 | #AEB7C9 |
| `accent`     | #5B5F8F | #B7B8EE |
| `on-accent`  | #FCFCFE | #141A24 |
| `divider`    | #C8CCD7 | #394355 |

| Par                      | Claro | Oscuro |
| ------------------------ | ----- | ------ |
| `text` / `canvas`        | 13.35 | 14.78  |
| `text` / `surface`       | 14.33 | 12.43  |
| `text-muted` / `canvas`  | 6.87  | 8.66   |
| `text-muted` / `surface` | 7.38  | 7.28   |
| `accent` / `canvas`      | 5.49  | 9.23   |
| `on-accent` / `accent`   | 5.89  | 9.23   |

Todos los pares anteriores cumplen 4,5:1. `divider` es decorativo.

## Tipografía

| Salida           | Principal                                                   | Respaldo                                  |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------- |
| Correo           | `'Segoe UI'`, Arial                                         | Sans-serif del cliente; sin fuentes web.  |
| Firma del correo | Consolas, `'Courier New'`                                   | monospace                                 |
| Open Graph       | Archivos empaquetados IBM Plex Sans SemiBold y Mono Regular | Ninguno: una fuente faltante es un error. |

Las fuentes empaquetadas usan la SIL Open Font License 1.1 y DEBEN distribuirse con el texto de la licencia.

## Composición

### Correo

- Tablas de maquetación con `role="presentation"`, estilos en línea, una columna, `width: 100%` con `max-width: 600px` y contenedor fijo de 600px para Outlook.
- Fondo exterior `surface`; fondo de la carta `canvas` con filete superior `accent` de 4px; relleno 32px, 16px en clientes angostos; bloques separados por 16–24px.
- Orden: preheader oculto, firma (14px mono, `accent`), título (28px, 24px angosto, 600, interlineado 1,2), fecha calendario (14px sans, `text-muted`, es-AR con mes corto, p. ej. “26 nov 2026”), resumen opcional (16px/1,6), una acción, `divider`, pie.
- Asunto: “Nuevo post en el blog — {title}”. Preheader: el resumen, o el título si no hay. Rótulo de la acción: “Leer artículo”.
- Acción: una celda de tabla con fondo `accent` y relleno 14px 24px alrededor de un enlace con texto `on-accent` de 16px 600, radio 5px. Usar una construcción segura para Outlook; los 44px de alto DEBEN verificarse por cliente. Los clientes que ignoran el radio muestran un rectángulo.
- Pie (14px o más, `text-muted`): “Recibís este aviso porque te suscribiste al blog.” seguido de un enlace subrayado “Darme de baja” en `accent`. Declarar `lang="es"`.
- Ninguna imagen es necesaria para entender. Sin imágenes de fondo ni degradados.

### Open Graph

- Lienzo exacto de 1200×630, una versión por artículo, tema claro fijo: fondo `canvas`, título `text`.
- Los tamaños de título (84, 75 y 62px), el peso 600, el interlineado 1,08 y el máximo de cuatro líneas son la referencia inicial aprobada; DEBEN validarse visualmente al actualizar el generador y todo cambio requiere aprobación.
- Filete superior: 36px `accent`, ancho completo. Relleno lateral 96px. Todo el texto dentro de x 96–1104 e y 84–546.
- Contenido alineado a la izquierda, con el bloque centrado entre y 84 y 546 (centro y 315): firma (Mono 38px, `accent`), 48px de separación, título (SemiBold, tracking -0,03em, interlineado 1,08).
- Sin resumen, etiquetas, columna secundaria, degradados ni decoración.

## Elevación

Plano. La jerarquía sale del contraste de fondos, los filetes y la tipografía.

## Formas

Sólo la acción del correo tiene radio de 5px. Los filetes son rectos.

## Componentes

### Contenido variable

| Caso                             | Correo                                                                                 | Open Graph                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Título largo                     | Título completo, con salto de línea.                                                   | Primer ajuste que entra sin partir palabras: 84px (≤2 líneas), 75px (≤3), 62px (≤4). Si ninguno entra, quedarse en 62px, partir toda palabra más ancha que la línea y cortar en límite de palabra con “…” en la línea 4. Último recurso: si no hay un límite de palabra donde cortar (la primera palabra sola supera las cuatro líneas), cortar entre grafemas, nunca dentro de uno, de modo que “…” quede dentro de la línea 4. |
| Palabra o URL indivisible        | `overflow-wrap: anywhere` y `word-break: break-word`.                                  | Sólo a 62px, corte entre grafemas.                                                                                                                                                                                                                                                                                                                                                                                               |
| Tildes y caracteres especiales   | UTF-8; escapar todo HTML y valor de atributo.                                          | Normalización NFC; segmentar por grafemas (`Intl.Segmenter`); escapar XML.                                                                                                                                                                                                                                                                                                                                                       |
| Glifo no cubierto (p. ej. emoji) | Queda a cargo del cliente.                                                             | Tratamiento no fijado por esta revisión. Un grafema está cubierto si la fuente empaquetada mapea todos sus code points (salvo unificadores y selectores de variación). La solución DEBE ser determinista y preservar el significado del título; omitir glifos en silencio no se acepta como definitiva. DEBEN evaluarse alternativas y aprobarse una antes de cambiar el generador.                                              |
| Sin resumen o fecha              | Quitar el bloque con su espacio.                                                       | No se muestran.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Etiquetas                        | No se muestran.                                                                        | No se muestran.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Fecha                            | Formatear la fecha calendario en UTC para que el día no se corra; omitir una inválida. | —                                                                                                                                                                                                                                                                                                                                                                                                                                |

### Estados interactivos

El único control es la acción del correo, que es un enlace y no un botón. Sigue la semántica de enlaces del origen; el correo no ofrece CSS interactivo confiable.

| Estado        | Aplica | Motivo o tratamiento                                                                            |
| ------------- | ------ | ----------------------------------------------------------------------------------------------- |
| Default       | sí     | `accent` / `on-accent` (claro #5B5F8F / #FCFCFE, oscuro #B7B8EE / #141A24), sin borde ni icono. |
| Hover         | n/a    | No es confiable entre clientes; el cliente puede agregar el suyo.                               |
| Focus-visible | nativo | Queda en el foco nativo del enlace, que NO DEBE suprimirse.                                     |
| Active        | n/a    | Misma limitación.                                                                               |
| Disabled      | n/a    | Un mensaje enviado siempre ofrece su enlace.                                                    |
| Loading       | n/a    | En el correo no se ejecuta código.                                                              |
| Selected      | n/a    | Navegar no tiene selección persistente.                                                         |

### Versión de texto y otros mensajes

- DEBE enviar una parte de texto plano con el mismo título, fecha, resumen, URL del artículo y URL de baja.
- El aviso interno de contacto se mantiene en texto plano.

### Limitaciones de clientes

- El diseño base es claro. DEBE declarar `color-scheme`; PUEDE sumar un bloque `prefers-color-scheme: dark` con los tokens oscuros. Los clientes pueden ignorarlo o recolorear el mensaje, así que la lectura NO DEBE depender de ninguno.
- Sin flexbox, grid, `clamp`, container queries, variables CSS ni CSS externo.
- CONVIENE mantener el HTML por debajo de 100KB para evitar recortes.
- DEBE mantener funcionando los enlaces de baja existentes.
- Una previsualización no prueba compatibilidad; verificar en Gmail y Outlook reales antes de afirmarla.

### Render determinista

- La misma entrada DEBE producir la misma imagen con el renderizador fijado y las fuentes empaquetadas: sin fuentes del sistema, red, reloj, configuración regional implícita ni azar.
- El ajuste de líneas DEBE medir con las métricas de las fuentes empaquetadas, no contando caracteres.
- DEBE conservar las claves de objeto y URLs públicas vigentes. El texto alternativo de la imagen corresponde al frontend.
- DEBE revisarse cada referencia a 1200×630, 300×157 (líneas del título legibles, firma reconocible) y 160×84 (líneas del título diferenciadas y filete visible; la firma puede no leerse).
- Un cambio visual DEBE actualizar las referencias de render a conciencia y registrar las diferencias aceptadas.

## Diferencias con el origen

| Diferencia                                                             | Motivo                                                                                  |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Firma “Matias Galeano · Blog técnico”                                  | Se define aquí para correo e imagen; el origen no la define.                            |
| Fecha del correo en sans (web: Mono recomendada para fechas)           | Decisión aprobada.                                                                      |
| Fuentes del sistema en correo                                          | Las fuentes web no son confiables en los clientes.                                      |
| Filetes de 4px en correo y 36px en imagen (web: 3px)                   | Adaptación por medio; la imagen debe leerse como miniatura.                             |
| Exterior `surface` alrededor de una carta `canvas`                     | Enmarca la carta donde el cliente controla la página.                                   |
| Base clara en correo; imagen clara fija                                | El cliente y las redes controlan el tema.                                               |
| Truncado sólo en la imagen                                             | Lienzo fijo; el título completo queda en la página.                                     |
| La acción del correo no tiene estilos propios de Hover, Active ni foco | Los clientes no los soportan de forma confiable; el origen los define para enlaces web. |
| Sin etiquetas                                                          | Derivado: no suman acción y compiten con el título.                                     |

## Origen de los valores

Colores y tipografías vienen del origen. La firma es propia de esta adaptación y viene de la composición aprobada. Aprobado: imagen clara fija, fecha del correo en sans, preheader tomado del resumen y, como referencia inicial, los tamaños de título 84/75/62px, peso 600, interlineado 1,08 y límite de cuatro líneas. De la composición aprobada: filete y marco del correo, título de 28px, acción de 5px, filete de la imagen y relleno de 96px. Derivados por robustez: tracking -0,03em, zona segura, ancho de 600px, demás tamaños y espacios del correo, título como preheader cuando no hay resumen, redacción de la fecha y omisión de etiquetas.

## Qué hacer y qué evitar

- **Hacer:** actualizar primero el sistema de origen cuando cambie una decisión visual.
- **Evitar:** definir aquí colores, tipografías o elementos de identidad nuevos.
- **Evitar:** sumar dependencias o un paquete compartido de diseño para aplicar este documento.
