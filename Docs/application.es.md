# Aplicación local con handlers

[English](application.md) · 25/10/2026.

**Incremento vigente:** [primera instalación con dobles y circuito Actions](managed-validation.es.md), implementados localmente. main/v0.1.0 ya existen; provisioning, ejecución y validación administrada siguen pendientes.

**Estado vigente de fase 4:** [controles del runtime](runtime-hardening.es.md), implementados y probados localmente: cuota compartida, presupuesto GLOBAL de IA, sesión/origen, cancelación, fallback versionado, configuración y observabilidad. Las referencias al traslado inicial conservan su evidencia histórica; no implican validación AWS.

## Estructura y configuración

- src/shared-control.ts: CAS de cuotas y reserva transaccional GLOBAL/sesión/origen en DynamoDB.
- src/runtime-config.ts: secreto JSON validado, revisión de tarifas y refresco limitado.
- src/request-scope.ts: contexto por request, deadline, cancelación y métricas filtradas.

- src/handler.ts: entrada Lambda; lee CORS al inicializar, contacto al enviar y la URL cloud al usar suscripciones. Nunca carga .env.
- src/config.ts: mapas explícitos, CORS congelado y configuración de contacto/suscripciones.
- src/application.ts: composición asíncrona, rawPath, CORS/headers, health, cuota/validación/contacto/suscripciones y errores controlados.
- src/health.ts: estado del proceso, sin proveedores ni cuotas.
- src/body.ts: adaptación del evento completo a body-parser, sin servidor ni sockets conectados.
- src/contact.dto.ts: DTO propio del proyecto y uso directo de class-transformer/class-validator; diferencias explícitas frente a ValidationPipe.
- src/contact.ts: mensaje/fecha/envío esperado y uso directo del SDK oficial Resend.
- src/subscriptions.dto.ts: DTO y normalización del correo de alta/baja.
- src/subscriptions.ts: proveedor HTTP nativo, validación del JSON upstream y errores propios.
- src/quota.ts: cuota local con rate-limiter-flexible: contacto 5/h/IP, alta y baja 10/h/IP y starters/chat 20/min/IP independientes; ventana fija y expiración por IP.

`GET /api/health` → 200 {status:ok}; `POST /api/contact` → 204 vacío. POST y DELETE /api/subscriptions devuelven 200; starters devuelve 200 y chat 201. Health no comprueba disponibilidad de proveedores. La validación completa de startup del origen sigue pendiente: health permanece disponible sin credenciales y faltantes de contacto producen 500 al intentar enviar.

CORS conserva lista, deshabilitado por ausencia y wildcard que refleja origen. Un origen no listado no recibe Allow-Origin; no es autenticación. Parser antes de CORS/seguridad y preflight antes de seguridad respetan el bootstrap. 204 no incluye Content-Type. [Contrato, límites y diferencias de contacto](contact.es.md).

## Toolchain y paquete

Node objetivo **24.22.1 LTS**, Linux x64/WSL2, última LTS verificada al 25/10/2026 en el [índice oficial](https://nodejs.org/dist/index.json); Node 26 sigue en Current. Se ejecutó el binario aislado ya disponible, comprobando process.version, sin instalaciones globales. .nvmrc, engines y workflows conservan esa versión. El experimento histórico conserva Node 24.19.0.

TypeScript 6.0.3, @types/node 24.19.2, @types/aws-lambda 8.10.164 y @types/body-parser 1.19.6 son de desarrollo. Runtime: body-parser 2.4.0, class-validator 0.15.1, class-transformer 0.5.1, rate-limiter-flexible 11.2.3 y resend 6.34.1. Son utilidades de parsing/validación necesarias para conservar contratos; no se agrega framework HTTP ni bundler. Resend se usa como SDK instalado, no como código adaptado. Versiones directas fijadas y lock nuevo auditado. [Revisión y procedencia](contact.es.md).

Build tsc ESM/ES2023, con decoradores de validación y sin metadata de DI. Tipos estrictos incluyen fuentes/tests, exactOptionalPropertyTypes y noUncheckedIndexedAccess, sin skipLibCheck. Los scripts de verificación no modifican fuentes; `npm run format` aplica el formato explícitamente.

El paquete necesita dist/, package.json con type:module, LICENSE y **node_modules de producción** según package-lock.json. Ya no alcanza con dist/manifiesto solamente. test:package copia únicamente dependencias no dev del lock fuera del checkout y comprueba health/contacto y suscripciones con mocks, ausencia de Nest/Express/React/TypeScript, .env sintético ignorado y red bloqueada. Las dependencias conservan sus licencias. La misma función prepara el asset de la [stack CDK local](infrastructure.es.md).

El SDK requiere @types/react 19.3.0 solo en desarrollo. src/resend-types.d.ts aporta HeadersInit desde los tipos fetch de Node, sin agregar DOM, React de runtime ni skipLibCheck.

## Comprobaciones locales

```bash
npm ci --ignore-scripts
npm run check
python3 scripts/ci_scope.py
actionlint
npm audit
```

**513 pruebas de aplicación aprobadas**, incluidas 82 nuevas pruebas de suscripciones (36 referencias DTO, 28 upstream y 18 adicionales), 69 referencias DTO/controlador (66 coincidentes, 3 diferencias explícitas al usar validadores directos) y 36 de parser; 49 de tooling (5 scope CI, 7 workflow de merge, 2 preparación y 13 bundle, 7 de fundación y 15 de recuperación). Tipos, build, smoke ESM separado, pares/enlaces documentales y actionlint aprobados en Node 24.22.1. npm audit del lock actual: **0 vulnerabilidades reportadas**, incluido desarrollo; no garantiza ausencia de problemas futuros.

La suite limpia el ambiente heredado y carga el cerco de red antes de importar la aplicación. Bloquea fetch/WebSocket, HTTP(S), conexión de sockets/TLS/UDP, DNS y procesos hijos. Se crean streams en memoria para parsing, sin escuchar puertos. Los proveedores son funciones explícitas simuladas; no se envían emails. El cerco evita llamadas accidentales, no constituye sandbox de código hostil.

Se reproduce npm ci y la validación desde un árbol temporal de archivos públicos, sin .git, privados, .tmp, dist ni node_modules previos. La suite no necesita el repo original ni los paquetes de referencia Nest. Los fixtures sintéticos se conservan públicamente. No se ejecutaron workflows remotos ni se midieron cold starts/costos.

## Cobertura contractual parcial

| Cubierto            | Evidencia                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Health              | JSON/status exactos, HEAD, rawPath/stage/query, barra/mayúsculas, sin proveedores/cuota                                        |
| Contacto            | reglas DTO originales y tres diferencias explícitas; desconocidos/nulls/opcionales/Unicode, honeypot, 204 y envío esperado     |
| Proveedor           | payload/texto/fecha/destinos, errores resueltos/rechazados/JSON, 500 controlado, sin retries                                   |
| Parsing             | JSON/form extended, base64/UTF-8/UTF-16/Latin1/BOM, compresión y errores, 16 KiB decodificados                                 |
| Cuota local         | 5/h/IP, sourceIp frente a XFF, reserva concurrente, ventana fija/bloqueo, vencimiento lógico y expiración independiente por IP |
| Headers             | CORS y seguridad según orden original, rate-limit/Retry-After, Content-Type ausente en 204                                     |
| Pendientes          | seis contratos locales; integración administrada pendiente                                                                     |
| Aislamiento/paquete | configuración ficticia, red bloqueada, .env ignorado y producción sin dependencias dev                                         |

El alcance diferencial es finito; no declara paridad completa de la API. Falta validar framing/proxies/gateway reales, cuotas distribuidas, deadline/cancelación, startup completo, secrets/IAM y recuperación. La cuota local se pierde al reiniciar y no se comparte entre entornos; no habilita exposición pública. [Detalle de límites y procedencia nueva](contact.es.md).

## Procedencia y propiedad

Referencia: [portfolio-api](https://github.com/matigaleanodev/portfolio-api/tree/a0ef80fa9f82d1cea5a31425a63ab0a344338c56), commit `a0ef80fa9f82d1cea5a31425a63ab0a344338c56`. Solo se leyeron blobs fijados; no se recuperó el prototipo ni se modificó el origen.

| Blob consultado              | SHA-256                                                          | Uso                                                |
| ---------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| src/app.controller.ts        | 4c590447c3a5451e12ee62392ed42f3858fb9d551a330032f99d36448ff8c59a | contrato health; función sin decoradores           |
| src/main.ts                  | c8aff3128c62d1c6c4925d34d494aac053748f10d68e7d8b0cb41c04424ca1f7 | rutas, límite, CORS y headers; adaptación a evento |
| src/config/runtime.config.ts | 366b7c532275fda3aaee639db60884999e3a0ee8f268b4a983124f6f6f672890 | semántica CORS; configuración explícita mínima     |
| package.json                 | 38599e23e6b9910f24f157ae19a55c30dcbf5e9e3d179d9dcdb4ab2f275e3961 | licencia y comparación de dependencias             |

Ambos repos son mantenidos por matigaleanodev. El origen declara UNLICENSED y no tiene LICENSE/ LICENSE.md en ese SHA. Esta implementación se distribuye bajo [MIT](../LICENSE) por decisión de su titular; eso no modifica la licencia del repositorio original. Repositorio público no implica concesión de licencia a terceros. TypeScript declara Apache-2.0; los paquetes de tipos declaran MIT. No se copia toda la API; chat traslada únicamente su contenido curado fijado, sin renovación editorial.

El incremento de contacto agrega [procedencia por blob y paquetes de referencia](contact.es.md). El incremento de [suscripciones](subscriptions.es.md) agrega alta/baja, 82 pruebas y procedencia por blob. El incremento de [chat](chat.es.md) completa los seis contratos con proveedores simulados; la renovación del bot continúa reservada para inmediatamente antes de producción.

## Vitest e infraestructura local

La suite completa usa Vitest 5.0.5: 513 casos de aplicación, 49 de tooling y 18 de infraestructura, **580 aprobados**. El smoke de paquete es un verificador Node sin devDependencies. Títulos en español Dado/Cuando/Entonces y [formato de casos de prueba](testing.es.md). CDK v2 está instalado y la stack de test se sintetiza sin lookups; [recursos y límites](infrastructure.es.md). El typecheck de infraestructura desactiva solo exactOptionalPropertyTypes por incompatibilidad de declaraciones CDK; aplicación conserva esa opción. Sin despliegue.

## Formato de código

Prettier 3.9.10 de desarrollo, fijado en manifiesto/lock y con reglas explícitas para legibilidad: 100 columnas orientativas, 2 espacios y comillas simples. Se formatean fuentes, tests, infraestructura, scripts JavaScript, configuración y documentación compatibles. `format` aplica cambios; `format:check` solo verifica y forma parte de `check` y CI. No se modifica el fixture histórico ni su hash. Python queda fuera del alcance de Prettier.

[Contratos, configuración, timeout, diferencias y hashes de suscripciones](subscriptions.es.md). src/subscriptions.dto.ts valida y normaliza; src/subscriptions.ts compone el proveedor HTTP sin dependencias nuevas. El paquete conserva las respuestas y cuotas de ambos métodos; la validación AWS sigue pendiente.

src/chat/ compone DTO, FAQ, contexto, IA y repositorio R2/local del SHA fijado. SDK S3 3.1156.0 y reflect-metadata 0.2.2 son dependencias directas nuevas; métricas JSON acotadas sin Nest. handler.ts conserva la composición desde el primer POST válido. El smoke ahora ejercita 201/503, cuotas y conocimiento sintético local/remoto. [Los 223 casos nuevos, diferencias y hashes](chat.es.md).

La ubicación profesional del chat se corrige puntualmente a Posadas, Misiones, Argentina, con diferencia explícita frente al SHA fijado. FAQ y contexto también incluyen el correo profesional contacto@matiasgaleano.dev desde un único dato compartido. El resto del contenido conserva su alcance anterior y la renovación editorial general sigue inmediatamente antes de producción. [Detalle y referencias históricas](chat.es.md).

## Actualización de fase 4

El handler administrado usa cuotas compartidas, configuración de Secrets Manager validada antes de negocio, deadline total y cancelación de proveedores. Las descripciones de memoria local, configuración lazy/500 y timeouts parciales corresponden al traslado inicial o al adaptador de composición local. Los controles actuales y diferencias están en [endurecimiento](runtime-hardening.es.md); permisos/proxies/proveedores reales siguen pendientes de validación administrada.
