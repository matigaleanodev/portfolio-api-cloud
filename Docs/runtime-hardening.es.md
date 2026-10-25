# Endurecimiento del runtime

[English](runtime-hardening.md) · 25/10/2026.

## Alcance

Implementé los controles de la fase 4 para el handler administrado. La comprobación es local: proveedores y almacenamiento simulados, paquete aislado, assertions y síntesis CDK sin lookups. No demuestra despliegue, permisos efectivos, identidad detrás de proxies reales ni disponibilidad del modelo. La API original conserva su funcionamiento independiente.

Los seis contratos permanecen. Las diferencias deliberadas son FAQ sin IA, continuidad amable con contacto, cuotas compartidas, startup de negocio con error 503 cuando su configuración no es válida, timeouts que cubren cuerpos y `x-request-id` generado por el servidor. `createApplication` conserva un adaptador en memoria para composición local; el handler desplegable siempre inyecta el control compartido y no tiene fallback a memoria.

## Entrada y cuotas

El handler exige evento HTTP API v2, IP válida, API configurada, dominio execute-api de us-east-1 y stage $default. Normaliza IPv6 y usa exclusivamente sourceIp del evento; X-Forwarded-For no modifica la identidad. La stack mantiene IAM y carece de Function URL. Validar la cadena administrada y las rutas de bypass en AWS test sigue siendo un criterio de la etapa 9.

Los contadores se guardan en una tabla DynamoDB de control, sin datos de aplicación. Conservé contacto 5/h/IP, alta y baja independientes 10/h/IP y starters/chat independientes 20/min/IP. La ventana empieza en el primer intento; el primero que excede el límite inicia una sanción por la misma duración. Los reintentos bloqueados no extienden esa sanción.

Cada actualización usa lectura consistente y escritura condicionada por una versión aleatoria; ante conflicto conocido se relee, hasta 32 intentos y dentro del deadline. El TTL lógico se comprueba con expiresAt; no depende del borrado físico eventual de DynamoDB. La clave usa HMAC-SHA256 de la IP con un secreto estable. Una falla del almacenamiento o contención persistente produce 503 antes de efectos. El SDK no reintenta operaciones ambiguas. [Concurrencia DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/BestPractices_ImplementingVersionControl.html).

## Presupuesto GLOBAL de IA y sesiones

El presupuesto diario pertenece al bot completo: todas las personas, sesiones y Lambdas de esta implementación consumen la misma clave `ai:budget:<día>`. No existe un presupuesto monetario por visitante. La tabla debe seguir siendo compartida por todas las revisiones activas del bot; no crear contadores independientes para ampliar el presupuesto accidentalmente. La ventana es el día civil argentino, con cambio a las 03:00 UTC.

Antes de generar, se consulta la disponibilidad y el conteo exacto de entrada de `/v1/responses/input_tokens`, con el mismo modelo, input y formato de texto. Una transacción atómica reserva sesión, origen y costo máximo de entrada más 300 tokens de salida. El cálculo usa nanodólares enteros y tarifas estándar sin aplicar descuentos de caché. No hay herramientas, Batch ni tier Priority. Las reservas no se reembolsan, incluso si el proveedor falla, devuelve JSON inválido o queda un resultado ambiguo. Es un tope conservador sobre generación admitida por este runtime con las tarifas verificadas; no controla impuestos, infraestructura, otras aplicaciones ni llamadas hechas por la API original. [Conteo](https://developers.openai.com/api/docs/guides/token-counting), [tarifas y snapshots](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

El límite es de cinco respuestas de IA por sesión y, adicionalmente, cinco por origen y día para impedir que cambiar u omitir sessionId renueve libremente el acceso. sessionId e history no acreditan identidad ni consumo: el servidor deriva claves de origen/día y sesión con HMAC. Personas detrás de una misma IP comparten ese cupo adicional; una IP distinta sigue sujeta al presupuesto GLOBAL. Es una protección conservadora sin cookies, login ni cambios del frontend, y su impacto sobre NAT/proxies debe comprobarse en test.

Una respuesta de IA cacheada consume un punto de sesión/origen, con reserva monetaria cero. FAQ se resuelve directamente, incluso con historial, sin consultar OpenAI ni conocimiento editorial. Si no hay admisión de IA, el chat sigue con FAQ pertinente o responde: «Para seguir con una consulta más específica, podés escribirme a contacto@matiasgaleano.dev o usar el formulario del portfolio en matiasgaleano.dev». No muestra presupuestos al visitante.

La configuración privada fija el presupuesto mediante AI_DAILY_BUDGET_MICROUSD. Solo se admiten gpt-4.1-mini y el snapshot gpt-4.1-mini-2025-04-14, con tarifa de entrada/salida de 0,40/1,60 USD por millón de tokens verificada el 25/10/2026. AI_PRICING_VALID_UNTIL exige revisión en un máximo de 31 días. La documentación oficial marca esta familia como deprecada: disponibilidad y elección de modelo deben revisarse antes del uso real; no se probó el proveedor ni se migró a otra familia. Las alertas no sustituyen la reserva atómica.

## Deadline y efectos

El deadline total es de hasta 25 s, reducido si Lambda tiene menos tiempo disponible, y abarca startup, lectura de secretos, parsing, cuotas y proveedores. AsyncLocalStorage propaga un AbortSignal por request y un requestId generado internamente. Se cierran listeners y señales al terminar.

- Control DynamoDB: 1,5 s por operación, SDK maxAttempts 1.
- Secrets Manager: 3 s, SDK maxAttempts 1.
- R2: 5 s para send y lectura completa, con abort al SDK, destrucción del stream y máximo de 512 KiB.
- IA: 15 s para conteo, reserva, generación y lectura JSON.
- Contacto y suscripciones: 8 s; el SDK Resend recibe signal y el timeout de suscripciones cubre body.

No se reintentan POST, DELETE, envíos ni reservas de resultado ambiguo. El fetch de suscripciones y OpenAI rechaza redirecciones. Cancelar no revierte una escritura aceptada, un email enviado ni trabajo ya iniciado por un proveedor; por eso se conserva la reserva y no se reproduce la operación.

## Fallback, integridad y retención

El paquete incluye fallback/chat-knowledge.v1.json y provenance.json. Es un subconjunto real de hechos curados ya trasladados desde portfolio-api@a0ef80fa: Foodly Notes, Modo Playa y Portfolio. No contiene posts ficticios ni reemplaza la publicación editorial de portfolio-cloud. generatedAt fecha este snapshot de empaquetado; no afirma una nueva verificación de los hechos históricos. La renovación general sigue inmediatamente antes de producción.

El modo administrado exige envelope v1, checksum SHA-256, fecha coherente y colecciones válidas. Solo carga su archivo empaquetado: no depende de .generated ni del checkout hermano. El build copia el artifact versionado y no renueva automáticamente su fecha. La edad máxima es 30 días desde generatedAt; se toleran hasta cinco minutos de diferencia futura de reloj. La misma regla se aplica al remoto, stale y caché local aunque el mtime no cambie. Sin conocimiento editorial válido, se mantiene 503; perfil y FAQ no necesitan R2 después del startup válido.

La caché IA tiene expiración lógica de cinco minutos y máximo 200 entradas, sin persistencia de conversaciones. Las respuestas usan store:false y tier default. Esto desactiva almacenamiento de Responses para recuperación; no acredita Zero Data Retention: OpenAI documenta retención de monitoreo de abuso que depende de sus políticas y del acceso de la cuenta. No se verificó esa configuración privada. [Retención del proveedor](https://developers.openai.com/api/docs/guides/your-data).

## Configuración y observabilidad

El ambiente de Lambda solo contiene configuración no secreta: CORS_ORIGIN, TRUSTED_API_ID, QUOTA_TABLE_NAME y RUNTIME_SECRET_ARN. El secreto JSON por ambiente se recibe mediante Secrets Manager y se valida antes de admitir negocio. No se carga .env.

| Campo del secreto                                              | Validación                                                              |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| RESEND_API_KEY, CONTACT_FROM_EMAIL, CONTACT_TO_EMAIL           | presencia según el contrato de contacto                                 |
| PORTFOLIO_CLOUD_API_URL                                        | HTTPS sin credenciales                                                  |
| QUOTA_KEY_SECRET                                               | al menos 32 caracteres; mantener estable durante ventanas activas       |
| R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY | todos o ninguno; endpoint HTTPS                                         |
| OPENAI_API_KEY                                                 | opcional; sin ella no se genera IA                                      |
| OPENAI_CHAT_MODEL                                              | familia con tarifa conocida; snapshot por defecto en modo administrado  |
| AI_DAILY_BUDGET_MICROUSD                                       | entero positivo, requerido si IA está habilitada; configuración privada |
| AI_PRICING_VALID_UNTIL                                         | fecha futura revisada, requerida si IA está habilitada                  |

Los secretos se cachean hasta cinco minutos; si falla la renovación no se sirve el snapshot vencido. Health sigue siendo liveness y responde sin secretos; no certifica readiness. Un negocio sin configuración válida devuelve 503 genérico.

Los logs JSON solo incluyen eventos acotados, requestId propio, resultado, estado HTTP, latencias y tokens. No registran IP, sessionId, mensajes, historial, emails, prompts, secretos ni errores libres. La stack retiene logs 14 días y define alarmas de errores, throttling y duración, sin acciones ni notificaciones. IAM permite solo sus logs, GetItem/PutItem/UpdateItem de su tabla y GetSecretValue del ARN concreto. La boundary externa y el secreto no se crean automáticamente.

## Validación y límites de cierre

Las pruebas simulan concurrencia entre composiciones, expiración sin limpieza física, rotación de sesión/IP, presupuesto global entre personas, reserva previa, caché, fallos de almacenamiento/startup, cuerpos pendientes, cancelación y privacidad de logs. Las assertions verifican el contenido de los comandos DynamoDB; el doble de almacenamiento no reemplaza pruebas contra DynamoDB administrado. El paquete se verifica fuera del checkout con red bloqueada y fallback real.

Antes de exposición faltan la etapa 9 y la preparación AWS: boundary/roles/secreto efectivos, proveedor y conteo real, IP/proxies, concurrencia de DynamoDB, políticas de retención de la cuenta, alarmas operativas y recuperación. El presupuesto personal queda fuera de la documentación pública. La fase 4 tiene implementación local; no se declara validación administrada ni producción.
