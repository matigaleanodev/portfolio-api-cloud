# Decisiones técnicas

[English](decisions.md)

## Paquetes con límites verificados

Elegí npm workspaces con contratos, runtime e infraestructura separados y un lock único: rutas, cuotas, catálogo de funciones, nombres de configuración y eventos editoriales tienen una sola definición que consumen runtime, CDK y tests. `contracts` no depende de nada; infraestructura no puede importar runtime. Un script verifica esos límites porque el hoisting de npm los volvería implícitos.

## Funciones separadas por permisos

Seis funciones en lugar de una: cada artifact contiene solo lo que su handler importa y cada rol lee solo su parámetro, de modo que contacto no carga OpenAI y chat no puede leer credenciales de suscriptores ni de medios. La separación no busca capacidad, porque todas comparten la cuota regional de concurrencia. `generate-og` conserva x86_64 para mantener el mismo binario de resvg y un render idéntico.

Las variantes no canónicas de chat las atiende `api`, que incluye el router de chat y lee el parámetro de chat de forma diferida. Es una excepción acotada para preservar el contrato completo sin rutas proxy adicionales: API Gateway elige por ruta exacta. El costo es un artifact `api` con código de chat y un rol que puede leer ese parámetro.

## Middy solo con core

Middy ordena la cadena HTTP con middlewares propios en lugar de un servidor o contenedor. Uso solo `@middy/core`: los paquetes `@middy/http-*` cambian detalles observables (orden de parsing, límites, forma de errores, CORS y headers) que los contratos heredados fijan, y adaptarlos costaría más que mantener middlewares chicos. El request scope queda fuera de Middy para que ingress, deadline y `x-request-id` cubran también los cortes.

## Publicación editorial integrada

La publicación editorial (OG, avisos y conocimiento del chat) y las suscripciones viven en este repositorio y comparten store, contratos y entrega con la API. Las suscripciones operan en proceso sobre R2, sin un salto HTTP a otro servicio, conservando mensajes y mapeo de errores. Los nombres de eventos y variables heredados se mantienen para que el workflow de `portfolio` cambie solo nombres de función. Las funciones no tienen schedules ni event sources: las dispara la publicación.

## Configuración sensible en SSM

Las claves sensibles viven en parámetros SSM `SecureString` estándar, segmentados por responsabilidad, con la clave administrada `aws/ssm`: sin costo mensual y con IAM por parámetro exacto. Se acepta que cualquier rol de la cuenta con `ssm:GetParameter` sobre el parámetro pueda descifrarlo. La configuración no sensible queda en variables de entorno desde parámetros de CloudFormation, revisables en el changeset.

GitHub Actions Secrets son la única fuente: un workflow manual publica siempre los payloads completos y su rol no lee valores. Así no hay edición manual que derive ni lecturas desde CI, y rotar una credencial no exige desplegar. El secreto anterior se retira manualmente cuando deja de servir como rollback.

## CDK e infraestructura separada

CDK en TypeScript define IAM y permite probar recursos antes de desplegar. Foundation, roles de entrega y boundaries se revisan por separado de la aplicación. Los logical IDs y nombres físicos existentes se conservan para no reemplazar la función, la tabla ni los log groups.

## Compatibilidad por aplicación

Lambda y NestJS conservan HTTP y comportamiento para poder cambiar la API desde la configuración del frontend. Las diferencias de validación y de ventanas de cuota se declaran en tests. El objetivo no es intercambiar dominios entre APIs ni garantizar equivalencia entre nubes.

## Controles compartidos

DynamoDB evita que el escalado de Lambda o la separación de funciones multipliquen cupos: `api` y `chat` comparten tabla y claves HMAC. Las ventanas expiran por lógica de aplicación y las reservas de IA preceden al consumo. Deadlines y cancelación acotan esperas; no reintentar evita repetir efectos ambiguos.

## FAQ y un solo modelo

Las FAQ responden directo y dan continuidad sin IA. GPT-6 Luna es el único modelo: Responses, `reasoning.effort=none`, `store=false`, sin herramientas ni generación alternativa. Las reservas son conservadoras sin depender de descuentos por cache; fallos ambiguos no devuelven presupuesto. Tarifas vencidas desactivan solo la generación paga.

## Conocimiento verificable

`publish-chat-knowledge` publica el envelope y `chat` lo consume con esquema, checksum y antigüedad máxima; el fallback empaquetado no refresca su fecha automáticamente. El estado editorial vive en un bucket público, por eso solo guarda códigos de error saneados. Las conversaciones no se persisten y `store=false` por sí solo no establece ausencia de retención del proveedor.

## Observabilidad mínima

Tres alarmas dentro de la capa gratuita: 5xx HTTP con una sola métrica personalizada, y throttles y errores de Lambda a nivel cuenta, que cubren también a otros proyectos y detectan el agotamiento de la cuota compartida. No hay alarmas por función, de duración ni access logs: se diagnostica con métricas gratuitas y logs estructurados.

## Entrega y recuperación

PR, CI y merges por workflow conservan identidad humana verificable. Los artifacts se promueven y recuperan sin recompilar; planificación, publicación, ejecución, sincronización de parámetros y runtime tienen roles separados. Una instalación conserva nombres físicos y datos. La API original y EC2 permiten recuperación independiente mientras estén disponibles.

## Pruebas y licencia

Vitest unifica suites con proveedores simulados y red bloqueada; CDK usa assertions y síntesis sin lookups. El proyecto usa MIT con autoría propia; las licencias de dependencias quedan en sus paquetes sin catálogo manual.

[Arquitectura](architecture.es.md) · [Contratos](api.es.md) · [Operación](operations.es.md)
