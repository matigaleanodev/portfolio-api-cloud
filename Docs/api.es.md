# Contratos HTTP y editoriales

[English](api.md)

Base pública: `https://api.matiasgaleano.dev/api`. Las rutas no distinguen mayúsculas y admiten slash final; las rutas canónicas de chat las atiende la función `chat` y las variantes (por ejemplo `/api/Chat/`) la función `api`, con el mismo contrato y la misma cuota. HEAD comparte health y starters, con body vacío y la cuota correspondiente. Métodos o rutas no soportados devuelven 404.

## Operaciones

| Método y ruta           | Entrada                                        | Éxito                                         | Cuota por IP        |
| ----------------------- | ---------------------------------------------- | --------------------------------------------- | ------------------- |
| `GET /health`           | Sin body                                       | 200, `{ "status": "ok" }`                     | Sin cuota de la app |
| `POST /contact`         | `name`, `email`, `message`, `company` opcional | 204, sin body                                 | 5/h                 |
| `GET /chat/starters`    | Sin body                                       | 200, `suggestedQuestions`                     | 20/min              |
| `POST /chat`            | `message`, `sessionId` y `history` opcionales  | 201, `answer`, `suggestedQuestions`, `source` | 20/min              |
| `POST /subscriptions`   | `email`                                        | 200, `message` y `email` opcional             | 10/h                |
| `DELETE /subscriptions` | `email` en body JSON                           | 200, mismo esquema que el alta                | 10/h                |

Alta, baja, chat y starters tienen cuotas independientes, definidas en [quotas.ts](../packages/contracts/src/quotas.ts). Health comprueba vida; no certifica proveedores ni readiness.

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

Alta y baja escriben o borran `subscribers/<email>.json` en el bucket R2 privado, con un límite de 8 segundos y sin reintentos. Respuestas: `Subscribed successfully` o `Unsubscribed successfully` con `email`; `Already subscribed` o `Already unsubscribed` sin `email`. Email inválido para el almacenamiento devuelve 400, un fallo de R2 devuelve 502 y la cancelación o el deadline 503. No se registran correos.

Chat devuelve source `faq`, `ai` o `fallback`. Las FAQ no generan IA. El historial viaja en la request; sessionId no autentica ni crea persistencia. La IA admite cinco respuestas por sesión y cinco por origen y día argentino, además de la cuota HTTP y el presupuesto global. La IA cacheada consume cupo con reserva monetaria cero. Personas que comparten IP comparten el cupo por origen. Sin admisión, chat ofrece FAQ/contacto; preguntas editoriales sin conocimiento válido conservan 503.

## Eventos editoriales

Las funciones editoriales no tienen rutas HTTP. El workflow de publicación de `portfolio` invoca `process-release` y `publish-chat-knowledge` con `aws lambda invoke` (resource policy limitada a su rol de release); `process-release` invoca `generate-og` y `notify-post`. Los tipos viven en [editorial.ts](../packages/contracts/src/editorial.ts) y las claves R2 en [storage.ts](../packages/contracts/src/storage.ts).

Cada función responde `{ statusCode, body }` con body JSON. Las validaciones de evento ocurren antes de leer configuración: un 400 no tiene efectos. Un fallo de configuración, R2 o proveedor que no se traduce en respuesta termina como error de función de Lambda.

| Función                  | Evento                                                                                                                         | Respuestas                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `process-release`        | `{ manifest }` o el manifiesto crudo: `generatedAt`, `siteUrl`, `content.posts[]` con `slug`, `title`, `date`, `canonicalPath` | 400 manifiesto inválido o con fechas futuras (hora argentina); 200 `No new posts`; 200 `processedPosts`; 500 parcial con `processedPosts` y `failedPosts` |
| `generate-og`            | `slug`, `title`, opcionales `excerpt`, `date`, `tags`                                                                          | 400 sin título o slug; 200 con `url` pública de `og/<slug>.png`                                                                                           |
| `notify-post`            | `title`, `url`, opcionales `excerpt`, `date`, `tags`                                                                           | 400 sin título o URL, o fecha futura; 200 con `recipients`; un rechazo del proveedor falla la invocación                                                  |
| `publish-chat-knowledge` | `{ artifact, release?, source? }` o el artifact crudo: `generatedAt`, `projects?`, `posts?`                                    | 400 artifact inválido o con fechas futuras; 200 con `key`, `generatedAt` y `contentHash`                                                                  |

`publish-chat-knowledge` escribe en `artifacts/chat/knowledge.json` el envelope v1: `version`, `generatedAt`, `source` (por defecto `portfolio` y `.generated/chat/knowledge.json`), `release` opcional, `contentHash` (`sha256:`) y `knowledge`. Reescribe la misma clave.

### Idempotencia y limitaciones

`process-release` guarda por post `ogGeneratedAt`, `notifiedAt` y `lastFailure` en `state/posts.json`. Un post con `notifiedAt` no se reprocesa; una etapa con marca se omite, así que reinvocar retoma la etapa pendiente. Cada etapa se reintenta hasta `RELEASE_STAGE_MAX_ATTEMPTS` (2 por defecto). `lastFailure` guarda etapa, fecha, intentos y un código saneado, nunca texto libre del proveedor. El formato legado (lista de slugs) se lee como procesado.

- `notify-post` no deduplica por destinatario: si un envío falla después de otros exitosos, el post queda sin `notifiedAt` y un reintento (incluido el reintento interno) reenvía a todos.
- `state/posts.json` se actualiza con lectura-modificación-escritura sin lock: invocaciones concurrentes de `process-release` pueden pisarse. El workflow invocador debe serializar publicaciones.

[Implementación HTTP](../packages/runtime/src/http/router.ts) · [Tests](../test) · [Operación](operations.es.md)
