# Arquitectura propuesta y elección de herramienta

[English](architecture.md) · Propuesta al 24/10/2026. Fuentes oficiales: [registro](sources.es.md).

## Recomendación

Usar **AWS CDK v2 con TypeScript** para el repo nuevo. Conservar contratos, dominio, contenido y proveedores. El runtime se elige comparando NestJS/Express adaptado y handlers Node.js livianos según [el protocolo de evaluación](runtime-evaluation.es.md). Candidata de infraestructura común: **una Lambda Event Function**, fuera de VPC, detrás de **API Gateway HTTP API regional**, sin dominio productivo durante pruebas. El tamaño real (seis rutas, sin DB ni workers) no justifica repartir por endpoint.

Para la candidata Nest, separar bootstrap HTTP de `listen`, reutilizar una inicialización Nest por entorno y probar un adaptador Express→Lambda compatible con Express 5. El adaptador aún no está elegido ni instalado; la guía [Nest serverless](https://docs.nestjs.com/faq/serverless) orienta la prueba. Empezar con tsc y metadata de decoradores; bundling/minificación solo después de probar ZIP, imports opcionales y cold start. Node 22/x86_64 da una comparación inicial con Docker; comparar 512/1024 MiB y ARM después, sin provisioned concurrency inicial.

API Gateway conserva rutas `/api/*`, códigos, body DELETE y errores. CORS en una sola capa, explicitando origen test/frontend, Content-Type y GET/POST/DELETE/OPTIONS. Validar también headers en errores de plataforma. El adapter debe preservar rawPath y evitar doble prefijo de stage. No publicar Function URL paralela que eluda las protecciones.

## Protección y runtime necesarios

- Un storage compartido para Throttler (Nest) o un limiter equivalente (handlers) es necesario para preservar cuotas por IP al distribuir ejecución. Candidato proporcional: una tabla DynamoDB on-demand para contadores efímeros, operaciones atómicas y TTL. No es una DB de aplicación. Definir vencimiento lógico sin depender de la eliminación eventual TTL; preservar 5/h contacto, 10/h suscripciones y 20/min chat. El backend debe recibir la IP confiable del evento, sin confiar en X-Forwarded-For arbitrario. Guardar identificadores derivados y limitar retención.
- Rate/burst por ruta de API Gateway y concurrencia reservada conservadora (propuesta 5 para test, a medir) limitan presión global. No reemplazan el límite por IP ni son un tope monetario. Presupuesto/alertas tampoco cortan el gasto automáticamente. Proponer una cuota diaria global de llamadas IA y corte operativo; acordar el umbral antes de habilitar público.
- Deadline total propuesto ≤25 s, Lambda ≤28 s, integración HTTP ≤30 s. OpenAI ya corta a 15 s y upstream a 8 s; falta cancelación real R2/body/retries y timeout Resend. El presupuesto incluye cold start, carga de secretos y knowledge. Si no alcanza con margen, revisar entrada/arquitectura, no esconder timeouts.
- Cachear cliente SDK/Resend/config en el entorno; ninguna corrección funcional puede depender de que siga caliente. Empaquetar fallback de knowledge inmutable y con trazabilidad; acordar edad máxima stale. Mantener historial en la request y navegador.
- Config no secreta por stage. Proponer un secreto JSON por ambiente en Secrets Manager, recuperado por rol runtime y cacheado con refresh acotado; nunca en Git, synth, outputs ni payloads de CI. La creación y carga de secretos forma parte de la configuración de cada ambiente. R2 usa credencial propia de lectura del artifact, no permisos AWS S3 sobre ese proveedor externo.
- Logs CloudWatch de 14 días en test, métricas nativas, correlación por requestId y eventos chat ya acotados. Alarmas de errores, duración, throttling y consumo. No registrar cuerpos, emails ni prompts. Sin exporter/Loki nuevo para Lambda.

## Comparación de ejecución y entrada

| Alternativa | Beneficio concreto | Costo/compromiso | Decisión propuesta |
| --- | --- | --- | --- |
| Nest completo + Event Function + HTTP API | reutiliza casi todo, entrada económica, rutas y throttles globales, IAM conocido | cold start, coste de espera externa y adaptador; timeout 30 s | baseline comparativo condicionado a prueba de paquete/latencia/abuso |
| Handlers Node.js livianos agrupados | menos imports/DI/servidor y posible menor startup | trasladar validación, errores, cuotas y composición preservando contratos | candidata fuerte; decidir con mediciones, sin cambiar dominio |
| 2 funciones: chat y resto | concurrencia/memoria/secretos separados; chat no ocupa cupos de contacto | dos paquetes/cold starts, limiter sigue compartido | separar solo si prueba demuestra contención o necesidad de permisos |
| Una función por endpoint | aislamiento fino | seis despliegues sin dominios independientes ni carga demostrada | descartar de inicio |
| REST API regional + Lambda | integración AWS WAF, controles adicionales y streaming de respuesta actual | entrada de mayor costo; cuotas/timeout distintos | preferir si WAF nativo o streaming pasan a requisito; hoy no existen |
| Function URL clásica | sin tarifa adicional de gateway; streaming disponible | entrada/protección/ruteo menos completos; construir límites de todas formas | no primera elección pública para endpoints que gastan dinero |
| Lambda Web Functions nativas | servidor HTTP sin adapter, concurrencia por entorno, CPU activa | Node 24, modelo de memoria/costo y recursos distintos; validar herramientas/IAM/región | alternativa real a medir antes de cerrar implementación |
| App Runner con contenedor | reutiliza servidor y empaquetado, menos administración que EC2 | memoria provisionada y CPU activa; piso aun con poco tráfico | alternativa si adaptación/cold starts fallan; verificar elegibilidad actual antes de elegir |
| ECS Fargate + ALB | control del contenedor/red | mínimo continuo, ALB/red y más operación | desproporcionado con requisitos presentes |
| Solución mixta | aislamiento puntual | dos modelos operativos | solo si se comprueba una incompatibilidad concreta |

HTTP API: máximo 30 s y payload 10 MB; invocación Lambda síncrona bufferizada 6 MB. Los 16 KiB de la API deben seguir siendo el límite real. Lambda Event Function puede ejecutar hasta 15 min, pero eso no amplía HTTP API. REST API **sí** soporta hoy streaming de respuesta; HTTP API no. No trasladar reglas viejas de streaming a toda API Gateway. [Límites HTTP](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html), [Lambda](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html), [streaming REST](https://docs.aws.amazon.com/apigateway/latest/developerguide/response-transfer-mode.html).

Lambda Web Functions aparece en documentación oficial actual, con servidor Node 24 y HTTPS administrado, y CloudFormation expone WebFunction. No confundirlo con Lambda Web Adapter ni Function URLs. Su tarifa cobra CPU activa y memoria durante la vida del entorno; falta medir residencia, soporte de CDK seleccionado, control por IP y elegibilidad de la cuenta/región. No se usa la tarifa GB-s de Event Functions para prometer su costo. [Servicio](https://docs.aws.amazon.com/lambda/latest/dg/web-functions.html), [runtime](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-runtimes.html), [precios](https://aws.amazon.com/lambda/pricing/).

No hay DB privada ni servicio interno que justifique VPC. La salida pública necesaria es Resend, OpenAI, R2 y API cloud. Una Lambda fuera de VPC evita introducir NAT Gateway. Si aparece un requisito privado, recalcular red y endpoints; no asignar NAT por plantilla.

## CDK, SAM, Serverless Framework y SST

| Aspecto | CDK TypeScript | SAM | Serverless Framework v4 | SST actual |
| --- | --- | --- | --- | --- |
| Infra/estado | TypeScript→CloudFormation; sin archivo de estado separado | YAML transformado→CloudFormation | serverless.yml→CloudFormation | TypeScript con motor/proveedores Pulumi; estado en bucket propio |
| NestJS | empaqueta/adapta runtime; no cambia Nest | mismo runtime y pruebas | mismo runtime; revisar plugins y versión | soporte de servidor; no elimina validación |
| Local | tests + synth sin lookups; SAM local cuando template/artifacts sean compatibles | sam build/local integrados; Docker | invoke local/plugins/offline, sin paridad total | live dev útil, pero puede usar recursos cloud reales |
| CI/OIDC | GitHub OIDC; roles bootstrap/publicación/ejecución/runtime explícitos | patrón ya existente en portfolio-cloud | OIDC viable; autenticación/licencia CLI adicional | OIDC viable; rol backend/estado y bootstrap distintos |
| IAM/config | constructs y assertions; no usar defaults admin; secretos separados | roles/boundaries explícitos ya conocidos | IAM generado/plugins requieren revisión | revisar permisos de componentes y backend |
| Ambientes/restore | stacks y nombres por ambiente; change sets/versions; drift soportado por recurso | stacks separados y change sets | stages y stacks; plugins/dashboard opcionales | stages, state/lock/secreto de cifrado y refresh |
| Observabilidad | servicios AWS elegidos, sin SaaS obligatorio | misma base AWS | Dashboard opcional con costo separado | Console opcional y facturación propia |
| Licencia/costo herramienta | Apache-2.0; sin licencia de pago del framework | Apache-2.0; sin licencia de pago del framework | v4 sujeto a términos; gratis bajo umbral de USD 2 M, suscripción encima; login/license en CI | MIT; no requiere cuenta Pulumi; Console tiene free tier y precio por recurso activo |
| Ajuste personal | experiencia operativa con CDK; control IAM y TypeScript | menos toolchains para el ecosistema existente | no aporta ventaja suficiente sobre finalistas | nuevo estado/modelo operativo para una API pequeña |

Los cuatro pueden definir recursos cuyo costo AWS es el mismo. CDK no vuelve gratis Lambda, logs, secrets o red. Tampoco es una emulación local. CloudFormation drift no cubre todo recurso/propiedad ni valida datos externos R2; una reversión del stack no recupera datos borrados.

**Finalistas: CDK y SAM. Opción preferida: CDK.** Motivos: experiencia práctica del mantenedor, TypeScript compartido con Nest, policies explícitas y tests de infraestructura sin sumar SaaS. Permite dejar SAM existente independiente. La infraestructura se define de forma independiente y reproducible en este repositorio.

**Desventajas:** bootstrap S3/ECR/roles requiere diseño de permisos y recursos; CLI/library/constructs suman versiones; bundling Nest no es automático; nuevos roles deben respetar boundaries y restricciones de acceso de la cuenta. La boundary del ejecutor no se aplica sola a los roles runtime.

**Elegir SAM en cambio** si se prioriza una única herramienta para los repos cloud, se quiere el template mínimo sin constructs o el costo operativo del bootstrap CDK no se justifica. No migrar portfolio-cloud a CDK para uniformar. Serverless v4 no compensa sus requisitos/licencia adicionales; no elegir v3 sin mantenimiento para evitarlos. SST no es CDK actual ni requiere Pulumi Cloud, pero sí un modelo de estado distinto que hoy no resuelve una necesidad comprobada.

Serverless CLI gratis y Dashboard gratis no son lo mismo. SST Console también es opcional: referencia actual, hasta 350 recursos activos gratis, luego tarifa por recursos; validar términos al adoptar. [Serverless](https://www.serverless.com/pricing), [SST Console](https://sst.dev/docs/console/), [estado SST](https://sst.dev/docs/state/).
