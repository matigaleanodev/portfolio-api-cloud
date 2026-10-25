# Suscripciones: alta y baja locales

[English](subscriptions.md) · 25/10/2026.

POST y DELETE /api/subscriptions devuelven **200** con el JSON validado del upstream: message string y email string opcional. DELETE conserva el correo en el body JSON; no lo obtiene del query. El proveedor se espera antes de responder. Health y contacto siguen disponibles; [starters/chat](chat.es.md) completan los seis contratos locales.

## Validación y transporte

SubscriptionEmailDto conserva el orden de los decoradores originales: MaxLength(320), IsEmail e IsString al validar, y Transform aplica trim().toLowerCase() únicamente a strings. No hay coerción de números, booleanos, objetos, null o arreglos. IsEmail impone además sus propios límites: el fixture de 254 caracteres se acepta y el de 255 se rechaza; el límite 320 del DTO no amplía la regla de email. La longitud se comprueba después de normalizar.

Se usan class-transformer y class-validator ya instalados, con whitelist, forbidNonWhitelisted, stopAtFirstError y forbidUnknownValues:false. Las 36 referencias del DTO original dan 33 resultados coincidentes y tres diferencias declaradas, iguales a la política aceptada para contacto:

- Dos arrays raíz reciben 400 con message: ["body must be an object"], en lugar de los mensajes de ValidationPipe.
- Una clave extra prototype se rechaza con 400; el origen la elimina silenciosamente y acepta.
- constructor y **proto** conservan el tratamiento directo de class-transformer en los casos comprobados. No se copian helpers de Nest ni se altera el fixture para ocultar diferencias.

Parser compartido antes de CORS/seguridad/cuota. JSON y formularios extended, base64, charsets y compresión conservan el límite de **16 KiB decodificados o expandidos**. Las pruebas de suscripciones ejercitan ambos métodos con JSON directo/base64/gzip, límite exacto y +1 byte, null/primitivos, MIME incorrecto, campos repetidos/anidados y URL encoded. La cobertura de parser existente conserva sus 36 referencias. Parsing inválido no consume cuota ni recibe CORS/seguridad; errores del DTO sí. Se conserva rawPath, mayúsculas/barra final y CORS/headers funcionales. CORS no autentica.

## Configuración y proveedor HTTP

readSubscriptionConfiguration recibe un mapa explícito: PORTFOLIO_CLOUD_API_URL es obligatorio, se aplica trim y se quitan todas las barras finales. El endpoint es baseUrl + /subscriptions. Como el origen, no se agrega validación de URL, autenticación, normalización de paths ni headers propios.

createSubscriptionSender recibe configuración y fetch nativo explícitos. Envía método POST/DELETE, Content-Type: application/json, JSON.stringify(dto) y AbortSignal.timeout(8000). No se incorpora dependencia nueva ni se copia un cliente HTTP de terceros. No hay reintentos de aplicación; no se declara idempotencia del upstream.

| Situación upstream                                                     | Respuesta HTTP local                                                 |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 2xx con message string y email ausente/string                          | 200 y solo message/email; no se normalizan los valores devueltos     |
| 2xx con JSON inválido, null, message incorrecto o email null/no string | 502, "El servicio de suscripciones devolvio una respuesta invalida." |
| 4xx, incluido 429, con error string no vacío                           | 400, mismo message y error: "Bad Request"                            |
| 4xx con error string vacío                                             | 400, {"message":"Bad Request","statusCode":400}, sin campo error     |
| 4xx sin error string o sin JSON válido                                 | 400, "No se pudo validar la solicitud de suscripcion."               |
| Otros estados fallidos, incluidos 5xx                                  | 502, "No se pudo procesar la suscripcion en este momento."           |
| Rechazo de fetch/red/abort                                             | 503, "No se pudo conectar con el servicio de suscripciones."         |

Salvo el borde de error vacío, los errores del proveedor tienen message, error ("Bad Request", "Bad Gateway" o "Service Unavailable") y statusCode. Se conservan strings vacíos de éxito, email opcional y descarte de campos extra. Un upstream 201 válido se presenta como 200. Un 204 sin JSON es un éxito inválido y da 502.

parseJson captura cualquier rechazo de lectura. Por eso un timeout durante fetch devuelve 503, pero un rechazo durante response.json después de un 2xx devuelve 502. Una prueba con el AbortSignal.timeout real de ocho segundos comprueba ambas ramas sin red. Esto conserva el origen; no es un deadline total de la aplicación ni cancela otros proveedores.

La entrada Lambda lee process.env solo al usar suscripciones y no carga .env. Como en el incremento de contacto, faltantes producen **500 controlado al invocar la ruta**, mientras health funciona. Es una diferencia explícita frente al startup obligatorio del original. Sin proveedor configurado no se simula éxito.

Los logs libres originales con endpoint/detalle de red no se trasladan: pueden contener configuración o datos sensibles. Las respuestas HTTP mantienen sus mapeos; observabilidad estructurada sin PII y correlación siguen en la etapa 4. No se usan datos de suscriptores ni logs reales.

## Cuotas independientes

src/quota.ts reutiliza la composición con RateLimiterMemory: contacto 5/h/IP, POST suscripciones 10/h/IP y DELETE suscripciones 10/h/IP, cada uno con instancia/clave propia. Se generaliza únicamente límite y prefijo; contacto conserva sus cinco pruebas de cuota.

Ventana fija desde el primer intento; el intento 11 bloquea una hora desde ese instante, sin extenderse por reintentos. Vencimiento lógico y timers por IP independientes. Se mantiene la decisión previa de reemplazar el algoritmo Throttler, sin sus decrementos por hit ni su bug entre claves. La identidad es requestContext.http.sourceIp; X-Forwarded-For no altera la clave.

Errores de validación/upstream consumen cuota. Health, parsing inválido, métodos no admitidos y preflight no la consumen. Se comprueban headers X-RateLimit-Limit/Remaining/Reset, Retry-After y JSON 429, reserva concurrente, métodos/IP independientes, reinicio de composición y vencimiento. Sigue siendo memoria local: se pierde al reiniciar y no se comparte entre Lambdas.

## Evidencia y procedencia

Repositorio: [portfolio-api](https://github.com/matigaleanodev/portfolio-api/tree/a0ef80fa9f82d1cea5a31425a63ab0a344338c56). Commit: a0ef80fa9f82d1cea5a31425a63ab0a344338c56. Solo se extrajeron blobs fijados; no se leyó la implementación de su working tree, recuperó el experimento ni modificó el origen.

| Blob consultado                                    | SHA-256                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| src/subscriptions/subscriptions.dto.ts             | 1517296d2736d996e84af9002b7ca008809050b4c7376b686a9fb24c785deabd |
| src/subscriptions/subscriptions.types.ts           | d8a8304c02e36f965fdf93a830646dfd46e5b6e23ec3b217586fc38330c3b2a0 |
| src/subscriptions/subscriptions.controller.ts      | 877cbe9be95ece5b04ec4b538a11c58ed1f73ea91c0b0a54572548484a47c998 |
| src/subscriptions/subscriptions.service.ts         | d15b1c681ccb440dc819bcdeb1946ae41c5a5de7c6b5caec8985e56b05c42be9 |
| src/subscriptions/subscriptions.module.ts          | ad73c1783e0c39cd17460f1f11acb5b371468b9d8e0691c3081293f3880be0ac |
| src/subscriptions/subscriptions.controller.spec.ts | b13b230f889779f7426547b76ebc0fc15606a6ed6b11a8b55dc51f776ad5d3d7 |
| src/subscriptions/subscriptions.service.spec.ts    | 0d5a7dcacf30daa144cb0ffe49fd3309a8ef1eb8296b29cbb31a24c921c41f0e |
| test/subscriptions.e2e-spec.ts                     | b591279a031a2e4614a4e0221269a135025b6eeda1ffe46e810b2616d32640fc |
| src/config/runtime.config.ts                       | 366b7c532275fda3aaee639db60884999e3a0ee8f268b4a983124f6f6f672890 |
| src/config/runtime.config.spec.ts                  | 58563eaa8cefe638730012b3b2da9199d7bac226cfbf0a912470178c3d693845 |
| src/main.ts                                        | c8aff3128c62d1c6c4925d34d494aac053748f10d68e7d8b0cb41c04424ca1f7 |
| src/app.module.ts                                  | 7016d793fb8f0ac2a76c3b1b06d8f23d1755142ccc2f0b935b2e9f8e8d0201df |
| package.json                                       | 38599e23e6b9910f24f157ae19a55c30dcbf5e9e3d179d9dcdb4ab2f275e3961 |
| package-lock.json                                  | 1c8e0e7a8a82d944d61a4f6fe77c47c77bc48890ce5040e2a276010e8b7cbbd7 |

DTO/tipos, reglas HTTP, configuración y servicio propios se adaptan a funciones y errores propios, sin decoradores de DI/controlador ni imports Nest/Express. Los specs unitarios/e2e originales guían casos de delegación, configuración y mapeos; Vitest ejecuta las pruebas nuevas.

test/subscriptions-reference.json contiene 36 referencias DTO y 28 respuestas de upstream, generadas ejecutando los blobs originales con red bloqueada. Solo para generar la referencia se usaron paquetes locales cuyas versiones coincidían con el lock fuente: @nestjs/common 11.1.13, class-validator 0.14.3, class-transformer 0.5.1, reflect-metadata 0.2.2 y rxjs 7.8.2. Es una referencia de comportamiento con versiones comprobadas, no una nueva verificación de integridad de tarballs. Ninguno se incorpora al runtime por este trabajo. El fixture público incluye las versiones y hashes; las pruebas normales no necesitan el origen, Nest ni herramientas privadas.

SHA-256 del fixture: 40b7462405ca79185a9787cb92bee7455bb8c62859f70508e84ac6eff1ec707f. Se excluye de Prettier como evidencia fijada. El fixture histórico de contacto conserva su hash.

Ambos repos son mantenidos por matigaleanodev. El origen declara UNLICENSED; ser público no concede licencia a terceros. Esta implementación propia conserva MIT y autoría Matias Galeano, sin cambiar la licencia del origen, agregar NOTICE ni inventario manual. Las dependencias conservan sus licencias dentro de sus paquetes.

## Verificaciones locales y límites

**82 pruebas nuevas** de suscripciones: 36 de DTO/controlador, 28 de respuestas upstream y 18 de transporte/configuración/timeout/cuota/composición; cada familia de referencia cubre alta y baja. Las tres diferencias de validación se declaran sin cambiar los resultados de origen. Dos tests previos que exigían 404 para suscripciones se reemplazan por los contratos reales.

Al cierre de este incremento de suscripciones: **258 pruebas aprobadas** (235 aplicación, 12 tooling, 11 infraestructura), con ambiente aislado y red bloqueada. Tipos estrictos, build ESM, formato, smoke fuera del checkout, documentación bilingüe, workflows y synth sin lookups se comprueban localmente. El smoke empaquetado ejercita alta/baja, normalización, body DELETE, ausencia de configuración y cuotas, sin devDependencies. Node ejecutado: 24.22.1 LTS; [registro oficial consultado el 25/10/2026](https://nodejs.org/en/blog/release). No se cambió el lock ni se agregó dependencia.

Esto no demuestra integración AWS, permisos efectivos, disponibilidad upstream o transporte administrado. Faltan cuota compartida/atómica, validación de proxies/IP administrados, deadline total, secretos/startup y recuperación. La stack sigue sin desplegar; no se habilita exposición pública. La renovación editorial permanece inmediatamente antes de producción.

[Estado actual y suite de 479 casos](chat.es.md). Los 258 anteriores son el cierre histórico de suscripciones; el lock nuevo del incremento de chat se audita por separado.
