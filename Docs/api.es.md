# Contratos HTTP

[English](api.md)

Base pública: `https://api.matiasgaleano.dev/api`. Las rutas no distinguen mayúsculas y aceptan barra final. HEAD comparte health y starters, con cuerpo vacío y cuota correspondiente. Métodos o rutas no admitidos devuelven 404.

## Operaciones

| Método y ruta           | Entrada                                        | Éxito                                         | Cuota por IP            |
| ----------------------- | ---------------------------------------------- | --------------------------------------------- | ----------------------- |
| `GET /health`           | Sin body                                       | 200, `{ "status": "ok" }`                     | Sin cuota de aplicación |
| `POST /contact`         | `name`, `email`, `message`, `company` opcional | 204 sin body                                  | 5/h                     |
| `GET /chat/starters`    | Sin body                                       | 200, `suggestedQuestions`                     | 20/min                  |
| `POST /chat`            | `message`, `sessionId` e `history` opcionales  | 201, `answer`, `suggestedQuestions`, `source` | 20/min                  |
| `POST /subscriptions`   | `email`                                        | 200, `message` y `email` opcional             | 10/h                    |
| `DELETE /subscriptions` | `email` en body JSON                           | 200, mismo esquema del alta                   | 10/h                    |

Alta, baja, chat y starters tienen cuotas independientes. Health comprueba liveness; no certifica proveedores ni readiness.

## Validación

- Contacto: name de 2–100 caracteres, email válido de hasta 150 y message de 10–5000. No normaliza email. Company permite ausencia, null o string de hasta 200; un string no vacío activa honeypot y devuelve 204 sin envío, después de validar el DTO.
- Suscripciones: email string con trim y minúsculas. El DTO limita a 320 caracteres; `IsEmail` conserva restricciones adicionales.
- Chat: message no blanco de hasta 500 unidades UTF-16; sessionId opcional/null de hasta 100. History opcional/null admite seis entradas con role user/assistant y content no blanco de hasta 1500. No recorta texto.
- Se rechazan campos desconocidos, también anidados. Arrays raíz reciben 400 con `body must be an object`; prototype extra se rechaza. Las diferencias frente a Nest quedan declaradas en pruebas de referencia.

## Transporte, cuotas y errores

El parser admite JSON, formularios, base64, charsets y compresión compatibles con body-parser. El límite es **16 KiB decodificados o descomprimidos**. Parsing precede CORS, seguridad y cuota: sus errores no consumen cuota ni incluyen esos headers. Preflight habilitado devuelve 204; errores de DTO/proveedor sí consumen cuota.

DTO inválido devuelve 400 con message array, error y statusCode; JSON inválido, 400; cuerpo excesivo, 413. Cuotas incluyen `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` y `Retry-After` según corresponda. Reset expresa segundos restantes. La ventana empieza en el primer intento; excederla bloquea durante su duración, sin extenderse por reintentos.

El 429 conserva `message: "ThrottlerException: Too Many Requests"`. Rechazo de entrada administrada devuelve 403; configuración común o control compartido no disponibles, 503. Contacto espera al proveedor y devuelve 500 controlado si falla. HEAD y 204 no llevan cuerpo; 204 omite Content-Type.

## Suscripciones y chat

Suscripciones conserva solo message string y email opcional del upstream. Un 2xx válido se presenta como 200; un 2xx sin JSON/esquema válido da 502. Un 4xx upstream, incluido 429, se mapea a 400; otros estados fallidos a 502 y conexión/cancelación a 503. Un error upstream vacío omite el campo error. Una lectura JSON fallida tras 2xx da 502 si no fue cancelada; el deadline puede terminarla con 503. POST y DELETE no se reintentan.

Chat devuelve source `faq`, `ai` o `fallback`. La FAQ no genera IA. El historial viaja en la request; sessionId no autentica ni crea persistencia. La IA admite cinco respuestas por sesión y cinco por origen/día argentino, además de cuota HTTP y presupuesto global. IA cacheada consume cupo con reserva monetaria cero. Personas detrás de una IP comparten cupo de origen. Sin admisión se ofrece FAQ/contacto; consultas editoriales sin conocimiento válido conservan 503.

[Implementación HTTP](../src/application.ts) · [Pruebas](../test) · [Operación](operations.es.md)
