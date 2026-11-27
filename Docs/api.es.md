# Contratos HTTP y editoriales

[English](api.md)

Base pública: `https://api.matiasgaleano.dev/api`. Las rutas no distinguen mayúsculas y admiten slash final; las rutas canónicas de chat las atiende la función `chat` y las variantes (por ejemplo `/api/Chat/`) la función `api`, con el mismo contrato y la misma cuota. HEAD comparte health y starters, con body vacío y la cuota correspondiente. Métodos o rutas no soportados devuelven 404.

## Operaciones

| Método y ruta                      | Entrada                                        | Éxito                                         | Cuota por IP        |
| ---------------------------------- | ---------------------------------------------- | --------------------------------------------- | ------------------- |
| `GET /health`                      | Sin body                                       | 200, `{ "status": "ok" }`                     | Sin cuota de la app |
| `POST /contact`                    | `name`, `email`, `message`, `company` opcional | 204, sin body                                 | 5/h                 |
| `GET /chat/starters`               | Sin body                                       | 200, `suggestedQuestions`                     | 20/min              |
| `POST /chat`                       | `message`, `sessionId` y `history` opcionales  | 201, `answer`, `suggestedQuestions`, `source` | 20/min              |
| `POST /subscriptions`              | `email`                                        | 200, `message` y `email` opcional             | 10/h                |
| `DELETE /subscriptions`            | `email` en body JSON                           | 200, mismo esquema que el alta                | 10/h                |
| `POST /subscriptions/one-click?t=` | Formulario `List-Unsubscribe=One-Click`        | 200, `{ "message": "Unsubscribed" }`          | 60/min              |

Alta, baja, baja en un clic, chat y starters tienen cuotas independientes, definidas en [quotas.ts](../packages/contracts/src/quotas.ts). Health comprueba vida; no certifica proveedores ni readiness.

## Validación

- Contacto: nombre de 2 a 100 caracteres, email válido de hasta 150 y mensaje de 10 a 5000. El email no se normaliza. Company admite omisión, null o string de hasta 200; un string no vacío activa el honeypot y devuelve 204 sin enviar, después de validar el DTO.
- Suscripciones: email string con trim y minúsculas. El DTO limita la longitud a 320; `IsEmail` mantiene restricciones adicionales.
- Chat: mensaje no vacío de hasta 500 unidades UTF-16; sessionId opcional/null de hasta 100. History opcional/null admite seis entradas con rol user/assistant y contenido no vacío de hasta 1500. Los textos no se recortan.
- Campos desconocidos, incluso anidados, se rechazan. Arrays raíz reciben 400 con `body must be an object`; un campo prototype extra se rechaza. Las diferencias frente a Nest se declaran en tests de referencia.

## Transporte, cuotas y errores

El parser acepta JSON, formularios, base64, charsets y compresión compatibles con body-parser. El límite es de **16 KiB después de decodificar o descomprimir**. El parsing precede a CORS, seguridad y cuotas: sus errores no consumen cuota ni llevan esos headers. El preflight habilitado devuelve 204; los errores de DTO o proveedor consumen cuota.

Un DTO inválido devuelve 400 con message en array, error y statusCode; JSON inválido devuelve 400 y body excedido 413. Las cuotas incluyen `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` y `Retry-After` según corresponda. Reset expresa segundos restantes. La ventana empieza en el primer intento; al excederla bloquea durante su duración sin extenderse con reintentos.

El 429 conserva `message: "ThrottlerException: Too Many Requests"`. El rechazo de ingress administrado devuelve 403; configuración común o control compartido no disponibles devuelven 503. Contacto espera al proveedor y devuelve 500 controlado si falla. HEAD y 204 no llevan body; 204 omite Content-Type.

Toda respuesta generada dentro del request scope lleva `x-request-id`, incluidos el 403 por secreto de origen inválido y el 503 por deadline. Los 403 de ingress previos al scope (versión, IP, API ID, dominio, stage o visitante inválidos) no lo llevan.

## Suscripciones y chat

Alta y baja escriben o borran `subscribers/<email>.json` en el bucket R2 privado, con un límite total de 8 segundos. Respuestas: `Subscribed successfully` o `Unsubscribed successfully` con `email`; `Already subscribed` o `Already unsubscribed` sin `email`. Email inválido para el almacenamiento devuelve 400, un fallo de R2 devuelve 502 y la cancelación o el deadline 503. No se registran correos.

Chat devuelve source `faq`, `ai` o `fallback`. Las FAQ no generan IA. El historial viaja en la request; sessionId no autentica ni crea persistencia. La IA admite cinco respuestas por sesión y cinco por origen y día argentino, además de la cuota HTTP y el presupuesto global. La IA cacheada consume cupo con reserva monetaria cero. Personas que comparten IP comparten el cupo por origen. Sin admisión, chat ofrece FAQ/contacto; preguntas editoriales sin conocimiento válido conservan 503.

## Baja en un clic

`/subscriptions/one-click?t=<identificador>` es el destino de `List-Unsubscribe` ([RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.txt)). El identificador es opaco, aleatorio (32 bytes en base64url), propio de cada suscripción y no vence: deja de tener efecto cuando la suscripción se elimina, y una suscripción nueva recibe otro.

- `POST` acepta `application/x-www-form-urlencoded` o `multipart/form-data` con `List-Unsubscribe=One-Click`, sin cookies, sesión ni redirecciones. Con forma válida responde 200 exista o no la suscripción; repetirlo no tiene efectos. Un identificador mal formado o repetido, otro valor u otro tipo de contenido responden 400. Un fallo de almacenamiento responde 502 o 503.
- `GET` y `HEAD` nunca modifican datos: responden 303 hacia la página manual `https://matiasgaleano.dev/blog/unsubscribe`.

El aviso enlaza la baja manual como `/blog/unsubscribe#email=<dirección>`: el fragmento no viaja al servidor y la página lo usa para precompletar. El frontend que lo lee tiene que estar publicado antes de enviar avisos con esta plantilla. Quien reciba un mail reenviado puede usar su enlace de baja. Los enlaces anteriores con `?email=` y `DELETE /subscriptions` se conservan.

## Eventos editoriales

Las funciones editoriales no tienen rutas HTTP. El workflow de publicación de `portfolio` invoca `process-release` y `publish-chat-knowledge` con `aws lambda invoke` (resource policy limitada a su rol de release); `process-release` invoca `generate-og` y `notify-post`. Los tipos viven en [editorial.ts](../packages/contracts/src/editorial.ts) y las claves R2 en [storage.ts](../packages/contracts/src/storage.ts).

Cada función responde `{ statusCode, body }` con body JSON. Las validaciones de evento ocurren antes de leer configuración: un 400 no tiene efectos. Un fallo de configuración, R2 o proveedor que no se traduce en respuesta termina como error de función de Lambda.

| Función                  | Evento                                                                                                                                                                     | Respuestas                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `process-release`        | `{ manifest }` o el manifiesto crudo: `generatedAt`, `siteUrl`, `content.posts[]` con `slug`, `title`, `date`, `canonicalPath` y `excerpt` opcional (pasa a `notify-post`) | 400 manifiesto inválido o con fechas futuras (hora argentina); 200 `No new posts`; 200 `processedPosts`; 500 parcial con `processedPosts` y `failedPosts`                   |
| `generate-og`            | `slug`, `title`, opcionales `excerpt`, `date`, `tags`                                                                                                                      | 400 sin título o slug; 200 con `url` pública de `og/<slug>.png`                                                                                                             |
| `notify-post`            | `title`, `url`, opcionales `excerpt`, `date`, `tags`                                                                                                                       | 400 sin título o URL, o fecha futura; 200 con `recipients` (aceptados por el proveedor); si queda alguno sin aceptar, la invocación falla con `NotificationIncompleteError` |
| `publish-chat-knowledge` | `{ artifact, release?, source? }` o el artifact crudo: `generatedAt`, `projects?`, `posts?`                                                                                | 400 artifact inválido o con fechas futuras; 200 con `key`, `generatedAt` y `contentHash`                                                                                    |

`publish-chat-knowledge` escribe en `artifacts/chat/knowledge.json` el envelope v1: `version`, `generatedAt`, `source` (por defecto `portfolio` y `.generated/chat/knowledge.json`), `release` opcional, `contentHash` (`sha256:`) y `knowledge`. Reescribe la misma clave.

### Idempotencia y limitaciones

`process-release` guarda por post `ogGeneratedAt`, `notifiedAt` y `lastFailure` en `state/posts.json`. Un post con `notifiedAt` no se reprocesa; una etapa con marca se omite, así que reinvocar retoma la etapa pendiente. Cada etapa se reintenta hasta `RELEASE_STAGE_MAX_ATTEMPTS` (2 por defecto), salvo un aviso incompleto: no se repite en la misma invocación; hay que reinvocar para continuar. Cada invocación, incluida la primera, solo ocurre si el tiempo restante de `process-release` cubre el timeout de la etapa, 2 s de arranque y transporte y 11 s para guardar el estado; la espera de la respuesta se corta al llegar a esa reserva (`AbortError`), sin cancelar la función invocada ni marcar la etapa. Una etapa que no entra se informa con `attempts: 0` e `insufficient_time`, igual que los posts siguientes (en el estado solo se anota la primera), y se retoma reinvocando. `ogGeneratedAt` se guarda apenas termina `generate-og`, antes del aviso. `lastFailure` guarda etapa, fecha, intentos y un código saneado, nunca texto libre del proveedor. El formato legado (lista de slugs) se lee como procesado.

#### Envío por destinatario

`notify-post` registra cada par post y destinatario en la tabla de control (sin direcciones: HMAC del email; sin vencimiento) y envía de a uno con `Idempotency-Key` de Resend. El post se identifica por host y ruta de su URL.

| Estado      | Significado                                                                                    | Siguiente invocación                                  |
| ----------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `sent`      | El proveedor aceptó el envío                                                                   | No se reenvía                                         |
| `rejected`  | Rechazo definitivo (4xx) sin dudas previas, o reserva liberada sin envío (`insufficient_time`) | Reintenta con una clave nueva                         |
| `sending`   | Reserva de una ejecución (60 s)                                                                | Espera; vencida, se trata como `uncertain`            |
| `uncertain` | Timeout, error de red, 5xx, 408, 409 o sin `id`                                                | Dentro de 23 h repite la misma clave y el mismo envío |
| `review`    | Duda sin resolver tras 23 h, o clave en conflicto                                              | No se reenvía; requiere revisión manual               |

Límites de la garantía:

- No es entrega exactamente una vez. La deduplicación de un intento ambiguo depende de la ventana de 24 h de las [claves de idempotencia](https://resend.com/docs/dashboard/emails/idempotency-keys); fuera de ella el sistema prefiere no reenviar.
- `sent` significa aceptación, no entrega: rebotes, supresiones y filtros ocurren después.
- Si entre intentos de un envío dudoso cambia el mensaje (título, extracto, fecha o la plantilla desplegada), el proveedor rechaza la clave y el registro pasa a `review`.
- Restaurar la tabla a un punto anterior puede perder marcas y permitir reenvíos.
- Una dirección rechazada de forma permanente o en `review` impide completar el post hasta resolverla. Mientras tanto cada release responde 500, el post se sigue enviando a quienes se suscriban después y los pasos posteriores del workflow invocador dependen de cómo trate ese fallo.
- La baja elimina el registro; el índice del identificador se limpia sin garantía y puede quedar un objeto huérfano con la dirección en el bucket privado. El borrado del almacenamiento no es condicional: una baja en un clic simultánea con una baja y alta de la misma dirección podría borrar la nueva.
- Cada invocación envía como máximo lo que entra en su timeout (a 5 envíos por segundo como techo) y corta ante cuotas del proveedor o credenciales rechazadas; las siguientes continúan con lo pendiente. Solo reserva un envío con 16 s restantes y solo llama al proveedor con 14 s (8 s de espera y 6 s para registrar el resultado). Si el presupuesto se agota tras reservar, libera la reserva sin enviar; si había una duda previa, el registro sigue `uncertain` y conserva su ventana de 23 h.

- `state/posts.json` se actualiza con lectura-modificación-escritura sin lock: invocaciones concurrentes de `process-release` pueden pisarse. El workflow invocador debe serializar publicaciones.

[Implementación HTTP](../packages/runtime/src/http/router.ts) · [Tests](../test) · [Operación](operations.es.md)
