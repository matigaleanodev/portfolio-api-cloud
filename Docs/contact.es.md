# Contacto: sección vertical local

[English](contact.md) · 24/10/2026.

**Estado vigente de fase 4:** [controles del runtime](runtime-hardening.es.md), implementados y probados localmente: cuota compartida, presupuesto GLOBAL de IA, sesión/origen, cancelación, fallback versionado, configuración y observabilidad. Las referencias al traslado inicial conservan su evidencia histórica; no implican validación AWS.

`POST /api/contact` devuelve **204 con body vacío** después de esperar al proveedor. Un honeypot válido con company truthy devuelve el mismo 204 sin envío. Alta/baja de suscripciones también están implementadas; [starters/chat](chat.es.md) completan ahora los seis contratos locales. Esta sección tiene pruebas locales; no demuestra paridad completa ni funcionamiento en AWS.

## Validadores usados directamente

ContactDto conserva decoradores y orden del SHA auditado. Se usan las APIs públicas plainToInstance de class-transformer y validateSync de class-validator con whitelist, forbidNonWhitelisted, stopAtFirstError y forbidUnknownValues:false. No hay copia de ValidationPipe, limpieza recursiva tomada de Nest ni manipulación del constructor de arrays.

- name: string no vacío, entre 2 y 100 caracteres; message: string no vacío, entre 10 y 5000. Se conserva el conteo Unicode de class-validator.
- email: IsEmail y máximo 150, sin trim/lowercase ni conversión implícita. Los espacios conservan el comportamiento de las reglas originales.
- company: ausente/null/string vacío permite envío; cualquier string no vacío, incluso espacios, activa honeypot. Máximo 200. Campos extra y tipos inválidos se rechazan antes del honeypot.
- Los arrays raíz se rechazan con 400 y mensaje `body must be an object`.
- class-transformer maneja directamente constructor y **proto**. Un campo extra prototype se rechaza por whitelist; ya no se elimina silenciosamente.

Los últimos dos puntos son diferencias explícitas frente al origen: cambian los mensajes de dos fixtures de arrays y el resultado de un fixture con prototype (204→400). Los otros 66 fixtures del DTO/controlador conservan los resultados originales. El fixture histórico no se modifica para esconder diferencias; las expectativas actuales se declaran en las pruebas.

## Parsing y transporte

JSON/formularios extended, arrays/duplicados/anidados, base64, BOM, UTF-16 y Latin1 cuando corresponda, gzip/deflate/br y errores de charset/encoding usan body-parser. El límite es **16 KiB después de decodificar/descomprimir** para MIME reconocidos. MIME no reconocido no genera un DTO válido por sí solo.

Parsing precede CORS/seguridad/routing, como el bootstrap fuente. Sus errores no consumen cuota ni reciben esos headers. El mapper propio usa status/type/message documentados por body-parser: entity.parse.failed conserva el 400 con error Bad Request; otros errores conservan {statusCode,message}. Se comparan 36 referencias de parsing. Errores del DTO reciben CORS/seguridad y headers de cuota. 204 omite Content-Type; preflight habilitado termina antes de seguridad. CORS no autentica.

El evento HTTP API v2 ya contiene el cuerpo completo: se reconstruye su longitud, sin reproducir framing por sockets. Content-Length incorrecto, requests truncadas, transferencia chunked, límites del gateway y bytes no representables sin base64 requieren pruebas de transporte administrado. No hay servidor HTTP ni Express.

## SDK oficial de Resend

createContactSender conserva asunto, texto indentado y fecha es-AR / America/Argentina/Buenos_Aires según Intl, sin imponer hourCycle nuevo. createResendProvider instancia **resend 6.34.1** y delega en emails.send; no mantiene un cliente REST ni una copia del SDK. Base URL y User-Agent son explícitos y no toman overrides del ambiente. [Uso oficial](https://resend.com/docs/send-with-nodejs).

Se conservan envío esperado antes de responder, error resuelto/rechazado → 500 controlado y ausencia de reintentos en los casos comprobados. No se expone el detalle del proveedor en la respuesta. El SDK conserva su envelope, incluido el éxito anómalo de una respuesta HTTP fallida con JSON null; queda probado, no se agrega una validación de data/id.

Claves: RESEND_API_KEY, CONTACT_FROM_EMAIL y CONTACT_TO_EMAIL. Presencia mediante trim, valores originales al enviar. Sin requisitos de chat/upstream y sin cargar .env. Solo la entrada Lambda lee la configuración. Health sigue disponible sin credenciales; faltantes de contacto producen 500 al intentar enviar. La validación completa de startup del original sigue pendiente.

El SDK registra detalles de errores fuera de production; la configuración productiva deberá fijar NODE_ENV=production, cuyo silencio de logs se comprueba con un error ficticio. Los tests de transporte sustituyen fetch explícitamente tras cargar el cerco de red. No hay envíos reales ni deadline/cancelación total todavía.

## Cuota con rate-limiter-flexible

Se usa **rate-limiter-flexible 11.2.3**, sin Nest, mediante RateLimiterMemory.consume. Configuración: points=5, duration=3600, blockDuration=3600, keyPrefix=contact. La identidad es sourceIp del evento; X-Forwarded-For no altera la clave. Validaciones fallidas, honeypots y fallos de envío cuentan; parsing inválido, health, preflight y métodos pendientes no.

La ventana fija empieza con el primer intento de cada IP. El sexto intento bloquea una hora desde ese instante; nuevos intentos bloqueados no extienden el bloqueo. Al vencer una ventana sin bloqueo se liberan todos sus puntos, en lugar del decremento por hit de Throttler. Una IP no cancela vencimientos de otra. Esta decisión reemplaza explícitamente la conservación del bug de timers de Throttler 6.5.0 y su algoritmo local anterior.

X-RateLimit-Limit/Remaining y Retry-After se conservan. X-RateLimit-Reset sigue expresado en segundos restantes, no epoch. El 429 conserva su JSON histórico (`ThrottlerException: Too Many Requests`) por compatibilidad; no implica usar Nest. Las pruebas cubren reserva concurrente en una composición, límites temporales, vencimiento lógico aun sin ejecutar el timer y expiración independiente entre IP.

El storage sigue siendo **por proceso/composición** y se pierde al reiniciar. No es un control distribuido para Lambda: el almacenamiento compartido/atómico y la cadena real de proxies siguen en la etapa 4. No se agrega infraestructura ahora.

## Selección y revisión de dependencias

Consulta: 24/10/2026. El registro npm publicó rate-limiter-flexible 11.2.3 el 17/10/2026. GitHub muestra actividad reciente, repositorio no archivado y 3.596 estrellas; npm informa **11.332.225 descargas entre 24/9 y 23/10/2026**. Son señales de mantenimiento/adopción, no usuarios únicos ni garantía de ausencia de fallos. No tiene dependencias de producción y expone tipos propios. [Repositorio](https://github.com/animir/node-rate-limiter-flexible), [publicación](https://registry.npmjs.org/rate-limiter-flexible/11.2.3), [descargas](https://api.npmjs.org/downloads/point/2026-09-24:2026-10-23/rate-limiter-flexible).

Runtime: body-parser 2.4.0, class-validator 0.15.1, class-transformer 0.5.1, rate-limiter-flexible 11.2.3 y resend 6.34.1, con versiones directas fijadas y transitivas en el lock. Resend requiere Node >=20 e incorpora postal-mime y standardwebhooks; no se instala su renderer React opcional. @types/react 19.3.0 es solo desarrollo porque el SDK referencia esos tipos. src/resend-types.d.ts define HeadersInit desde RequestInit de Node para comprobar sus declaraciones sin agregar DOM ni skipLibCheck. Se revisaron metadata/licencias/engines y npm audit: 0 vulnerabilidades reportadas en el lock actual.

## Evidencia contractual

155 pruebas de aplicación aprobadas y 12 de tooling. test/contact-reference.json conserva 69 referencias DTO/controlador y 36 de parser generadas desde blobs fijados y dependencias originales verificadas. La suite compara los resultados actuales y declara las tres diferencias de validación anteriores. Cuota y proveedor tienen pruebas actuales independientes. No es una nueva ejecución de los 92 escenarios históricos.

Fixtures públicos/sintéticos, ambiente limpio y cerco cargado antes de importar. No se necesitan repo original, paquetes Nest, archivos privados ni red para ejecutar las pruebas. El paquete se comprueba fuera del checkout con dependencias de producción, SDK simulado y licencias originales dentro de cada dependencia.

SHA-256 del fixture: `732287cc4aec10c9b49562e76b157cd45664dc3a2574fcd10728fc3de4edc144`.

## Procedencia del código de aplicación

Repositorio: [portfolio-api](https://github.com/matigaleanodev/portfolio-api/tree/a0ef80fa9f82d1cea5a31425a63ab0a344338c56). Commit: `a0ef80fa9f82d1cea5a31425a63ab0a344338c56`. Se leyeron blobs Git, no fuentes del working tree. No se modifica el origen.

| Blob consultado                        | SHA-256                                                          | Adaptación                                                      |
| -------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| src/contact/contact.dto.ts             | ca372034218ec6be2ae93404b76a947a49b96a6e72bf7f00438c42574c7e75e7 | DTO/decoradores; null explícito y validación sin ValidationPipe |
| src/contact/contact.service.ts         | c60972fc6eb3415d082e6f660634e42be6ba8424be2a4a545d2a61bf1f1091ef | texto/fecha/envío esperado; DI reemplazada por funciones        |
| src/contact/contact.controller.ts      | 128f2594d7f8f56ae74383a3720f6a55412c619ac93927f49ed9b93b6c315ff2 | routing/204/honeypot/cuota; composición explícita               |
| src/contact/contact.module.ts          | 394e5cefd5f7018021006c33cdba51449ef36c33260c6b07f3f1297490cecccb | responsabilidades de composición; sin módulo Nest               |
| src/contact/contact.controller.spec.ts | 76f18d6e0bcb5d0112d4986efeedfcb1c0528628b20b4b4b055a13fb7ae6270c | casos de honeypot/envío migrados a Vitest                       |
| src/contact/contact.service.spec.ts    | 37d751eefb508f9002d61d51740c69dee93bf655d497133b931491974dc786f4 | casos de envío/error/configuración adaptados con mocks          |
| test/contact.e2e-spec.ts               | 4c7c3273a6e8bcee950ca20e3b7bac135108759539111669dd8845ba405e7d90 | escenarios HTTP de contacto adaptados                           |
| src/config/runtime.config.ts           | 366b7c532275fda3aaee639db60884999e3a0ee8f268b4a983124f6f6f672890 | presencia y valores de configuración de contacto/CORS           |
| src/config/runtime.config.spec.ts      | 58563eaa8cefe638730012b3b2da9199d7bac226cfbf0a912470178c3d693845 | casos de configuración pertinentes; sin requisitos de chat      |
| src/main.ts                            | c8aff3128c62d1c6c4925d34d494aac053748f10d68e7d8b0cb41c04424ca1f7 | orden de parser/CORS/headers, límite y validación               |
| src/app.module.ts                      | 7016d793fb8f0ac2a76c3b1b06d8f23d1755142ccc2f0b935b2e9f8e8d0201df | guard y cuota por método; sin bootstrap Nest                    |
| package.json                           | 38599e23e6b9910f24f157ae19a55c30dcbf5e9e3d179d9dcdb4ab2f275e3961 | propiedad/licencia y revisión de dependencias                   |
| package-lock.json                      | 1c8e0e7a8a82d944d61a4f6fe77c47c77bc48890ce5040e2a276010e8b7cbbd7 | versiones/integridad de la referencia; no copiado               |

El origen declara UNLICENSED y no concede licencia de terceros por ser público. Ambos repos son mantenidos por matigaleanodev. Esta implementación adopta [MIT](../LICENSE) por decisión de su titular; el origen fijado conserva su estado UNLICENSED. No se copia la API completa ni contenido editorial.

## Paquetes consultados para la referencia histórica

Los tarballs se verificaron contra su integridad sha512 del lock fuente y los siguientes archivos contra SHA-256. Se consultaron para generar fixtures o comprender el comportamiento anterior; no se copian sus implementaciones al runtime actual. Nest no es dependencia; Resend se utiliza ahora mediante su SDK instalado.

| Package                 | File                                | SHA-256                                                          |
| ----------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| @nestjs/throttler@6.5.0 | dist/throttler.service.js           | 5850f253b1a2719c7ed0a38597552d050e0e9accd24a33fd475bc9d52bf7680b |
| @nestjs/throttler@6.5.0 | dist/throttler.guard.js             | f96d6921052ace949a5643d9e0787ac63088fbc2972bc7a55abb1b5a829b1d72 |
| resend@6.9.1            | dist/index.mjs                      | 346deced8e40b3c2d34b97999492389b880c66f26e918c884c05069ae13181d8 |
| @nestjs/common@11.1.13  | pipes/validation.pipe.js            | 5be8f691616ebb89f6289783d7323208bbca2f36fdb9015f53e0caf65c42a94c |
| @nestjs/core@11.1.13    | exceptions/base-exception-filter.js | 6aa1a71265bd693c1ab3f7c35ba98a670793c3beb3c5605df7e970088c0569fe |
| @nestjs/core@11.1.13    | router/routes-resolver.js           | 8b4b2444d27be7997398edcd4162a3d3dd8c546571bf8b53a2e99b57ae8a035d |

La implementación propia se distribuye bajo [MIT](../LICENSE), con autoría de Matias Galeano. Se retiraron las copias/adaptaciones de terceros que motivaron atribuciones en el archivo del proyecto. Las dependencias se usan mediante sus APIs y conservan sus licencias dentro de sus paquetes; no se mantiene un archivo de atribuciones separado.

## Pendientes reales

Cuotas distribuidas, proxies/IP administrados, deadline/cancelación, políticas de secretos/startup, pruebas API Gateway/IAM y recuperación. La corrección local del bug de timers está resuelta mediante el cambio de librería; la etapa 4 sigue abierta para distribución. La renovación editorial continúa inmediatamente antes de producción. [Aplicación y verificaciones](application.es.md).

Suite migrada íntegramente a Vitest; se agregan 11 casos de infraestructura sin cambiar los 155 de aplicación. [Formato de casos QA](testing.es.md).

Al 25/10/2026 la suite actual tiene 456 pruebas de aplicación, 12 tooling y 11 infraestructura (479). El conteo 155 anterior corresponde al incremento de contacto; dos expectativas de 404 se reemplazan y se agregan 82 pruebas de [suscripciones](subscriptions.es.md). El módulo de cuota ahora es src/quota.ts, sin cambiar la semántica de contacto.

## Actualización de fase 4

El handler administrado usa cuotas compartidas, configuración de Secrets Manager validada antes de negocio, deadline total y cancelación de proveedores. Las descripciones de memoria local, configuración lazy/500 y timeouts parciales corresponden al traslado inicial o al adaptador de composición local. Los controles actuales y diferencias están en [endurecimiento](runtime-hardening.es.md); permisos/proxies/proveedores reales siguen pendientes de validación administrada.
