# Operación y validación del entorno test

> Registro de diseño y validación inicial. El circuito productivo vigente, sus nombres y recuperación histórica están en [Integración y entrega](ci-cd.es.md).

[English](test-operations.md) · 25/10/2026.

**Incremento vigente:** [primera instalación con dobles y circuito Actions](managed-validation.es.md), desplegada y comprobada en AWS con proveedores simulados. [Resultado del primer deploy privado](first-private-deploy.es.md). Las secciones de diseño y auditoría conservan su contexto previo.

## Estado y orden

La entrega protegida está operativa en dev. La actualización local fija Ubuntu 24.04 y actions/checkout 7.0.1, setup-node 7.1.0 y upload-artifact 7.0.2; sus manifests oficiales usan Node 24 y requieren runner 2.327.1 o posterior. Node de la aplicación permanece en 24.22.1. La transición de ubuntu-latest hacia 26.04 está en curso entre el 19/10 y el 19/11/2026. La imagen fijada evita depender de esa transición; la ejecución remota de este incremento sigue pendiente. [Checkout](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node](https://github.com/actions/setup-node/releases/tag/v7.1.0), [artifact](https://github.com/actions/upload-artifact/releases/tag/v7.0.2), [runner](https://github.com/actions/runner-images/issues/14748).

Las etapas 7–10 tienen preparación local revisable. No equivalen a bootstrap instalado, despliegue, pruebas administradas ni recuperación remota comprobados. El [diseño](deployment-design.es.md) conserva la separación entre GitHub OIDC, deploy CDK, publicación S3, CloudFormation y runtime.

## Promoción a main

La auditoría previa a v0.1.0 registró dev en 832be8883aaae40b660d7605bf87cd8bb1ff82df y ausencia de main. El cierre posterior creó main y publicó v0.1.0 en 6f993417a0a9785b7ee3dbf120a9493a99e23c22; ambas ramas/remotos se revalidaron al iniciar este incremento. Los rulesets activos siguen aplicando a ambas ramas: updates solo permite al usuario 99203645 integrar por PR; calidad exige verify de GitHub Actions, base actualizada, conversaciones resueltas y merge commit, sin bypass. No aparece una regla de creación; eso no demuestra por sí solo que una futura operación vaya a ser aceptada.

El camino preparado es integrar primero el incremento en dev, inicializar main exactamente en un SHA integrado de dev con CI aprobada, volver a comprobar sus reglas efectivas y usar después PR dev→main con merge por workflow. La inicialización no modifica los rulesets ni crea una excepción permanente. Registrar SHA, actor y CI de creación. Si la creación es rechazada, detener esa operación y revisar el motivo. No relajar reglas ni cambiar el plan a dev.

Antes de activar el plan deben existir test-plan restringido exclusivamente a main y las variables de roles/secreto documentadas. TEST_PLAN_ENABLED es una variable del repositorio porque la condición del job se evalúa antes de entrar al environment. El sub OIDC del environment no demuestra la rama. El workflow comprueba main y el environment debe comprobarla también. La revisión humana del environment debe ser viable para los revisores reales; no configurar una prohibición de autoaprobación con un único revisor que también inicia todas las ejecuciones.

## Fundación externa revisable

[infra/test-foundation.template.json](../infra/production-foundation.template.json) materializa el bucket, parámetro bootstrap, cuatro roles externos y cinco boundaries. El runtime sigue perteneciendo a la stack CDK de aplicación. No crea secretos, proveedor OIDC, ECR, lookup role, CMK ni recursos de aplicación. El proveedor GitHub OIDC debe existir y revisarse por separado.

La plantilla comprueba cuenta 650387442642 y us-east-1. RuntimeSecretArn es obligatorio y exacto; no admite valores de secretos. La boundary runtime autoriza únicamente sus streams de logs, GetItem/PutItem/UpdateItem de la tabla de control y GetSecretValue de esa referencia. Usar una clave administrada propia para Secrets Manager exigiría revisar además kms:Decrypt; la propuesta actual no lo concede.

Las policies de identidad y sus boundaries tienen el mismo techo para cada rol. GitHub solo asume deploy/publicador. Deploy prepara changesets de la stack test, exige el ejecutor y nombre de changeset previstos, lee versión bootstrap/assets y pasa exclusivamente ese ejecutor a CloudFormation. El publicador solo lee/escribe el bucket dedicado, sin borrado. El ejecutor solo administra los recursos test y crea/pasa RuntimeRole con la boundary runtime exacta. No modifica las boundaries ni los roles de entrega.

La CLI 2.1146.1 instalada consulta GetBucketEncryption al publicar; agregué s3:GetEncryptionConfiguration sobre el bucket exacto. Deploy y CloudFormation pueden necesitar GetParameters para resolver BootstrapVersion. El assembly actual exige versión 6 y CLI mínima 2.1146.1; el parámetro propuesto vale 6 y se conservan BucketName, BucketDomainName y BootstrapVersion. La metadata lookup del synthesizer no implica que exista un lookup role: este flujo no ejecuta lookups. La compatibilidad efectiva con el servicio sigue pendiente.

Solo logs:DescribeLogGroups necesita Resource * en esta propuesta, limitado por región. La bucket policy tiene Deny s3:* con Principal * para transporte sin TLS; no concede acceso público. Los demás comodines son sufijos de recursos test o el alcance API explícito siguiente. La ausencia de ExecuteChangeSet/CreateStack/UpdateStack/DeleteStack en deploy mantiene la separación de ejecución.

### API Gateway con ID generado

AllowRegionalApiBootstrap=false y TestApiId=unassigned son los defaults: no conceden administración de API Gateway. No constituyen una fundación lista para desplegar la aplicación.

Para una API test ya identificada, TestApiId permite acotar /apis/ID y sus hijos; comprobar propietario/stack antes de usarlo. Para crear la primera API de la stack actual, la variante AllowRegionalApiBootstrap=true permite POST /apis solo con ApiName=portfolio-api-cloud-test, pero la administración /apis/* permanece regional. Afectaría otras HTTP/WebSocket APIs de us-east-1 si se utilizara fuera del template revisado. No representa aislamiento fuerte por nombre o tags.

La referencia de API Gateway documenta herencia de tags para recursos V1; no demuestra esa herencia para rutas/integraciones V2. No agregar condiciones que parezcan aislar sin demostrar que AWS las evalúa. La decisión para la primera instalación es usar la variante regional, considerando que la cuenta es personal y tiene un único operador. Se conserva la limitación de nombre al crear la API; los permisos sobre APIs existentes siguen siendo regionales y no aíslan la API productiva actual. La operación queda restringida al template revisado de esta aplicación. Registrar el ID generado; una reducción posterior a TestApiId exacto es posible sin crear otra instalación. No hay elevación automática ante denegaciones. [Autorización V2](https://docs.aws.amazon.com/service-authorization/latest/reference/list_apigatewayv2.html), [herencia de tags](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-tagging-supported-resources.html).

El bucket conserva cifrado SSE-S3, versionado, propiedad BucketOwnerEnforced, bloqueo público y TLS. No expira objetos automáticamente: inventariar las referencias activas y la revisión de recuperación antes de limpiar; conservar al menos 90 días las versiones necesarias. Retain y versionado no sustituyen un procedimiento de recuperación.

## Preparar un changeset del artifact elegido

El plan sigue siendo manual, main-only y deshabilitado mientras falten sus prerrequisitos. Pide run ID, artifact ID, SHA completo y digest sha256 revisados. Descarga metadata/ZIP del repositorio exacto con token GitHub de lectura, antes de autenticar AWS.

recover_bundle.py exige CI terminada y aprobada por push en main/dev, workflow ci.yml, repositorio, revisión, run e intento coincidentes, artifact no vencido y nombre test-assembly esperado. Comprueba digest contra GitHub y bytes del ZIP, rechaza rutas externas/absolutas, enlaces, duplicados y exceso de tamaño; después comprueba el inventario existente. Rechaza artifacts de synthetic merge de PR. No autentica una procedencia externa a GitHub ni reemplaza la revisión humana del digest.

El SHA recuperado debe ser ancestro del main que ejecuta el control: un artifact de dev sin promoción no pasa. El lock retenido debe ser idéntico al del workflow; Node, CLI mínima, cuenta/región, stack, roles y bucket de assets se comprueban antes de OIDC. No recompila ni sintetiza la revisión recuperada. La CI de origen ya ejecutó las pruebas y synth; recuperar un bundle no renueva las fechas de su fallback.

El artifact de control test-plan usa el SHA del workflow en su nombre; review.json conserva el SHA real de la aplicación recuperada. Registrar ambos. La publicación S3 y CreateChangeSet son mutaciones aunque prepare-change-set no ejecute la aplicación.

Antes de preparar: conservar SHA/digest/run, inventario de assets, SHA del workflow, identidad STS, parámetros no secretos y ARNs exactos. Después: obtener ChangeSetId y StackId completos; guardar privadamente DescribeChangeSet, cambios, reemplazos y roles; esperar CREATE_COMPLETE/AVAILABLE. No ejecutar si falla la preparación, cambia el alcance o se reemplaza la tabla de control. No interpretar un changeset vacío como despliegue exitoso.

## Ejecución separada

El rol deploy no puede ejecutar. El siguiente paso debe usar una identidad de ejecución revisada y una policy temporal que permita ExecuteChangeSet únicamente sobre el ARN de stack observado y cloudformation:ChangeSetName exacto. Revalidar identidad, región, cuenta, changeset, estado AVAILABLE, ejecutor, parámetros, hashes de assets y revisión inmediatamente antes de ejecutarlo. La policy no debe conceder CreateChangeSet, UpdateStack ni PassRole nuevo como atajo. No se crea esa identidad en la fundación actual.

Registrar comando, token de idempotencia cuando corresponda, actor, hora, ARN y eventos/resultados sin cuerpos ni secretos. CREATE_COMPLETE/UPDATE_COMPLETE, endpoint IAM y configuración efectiva son evidencia posterior; una respuesta aceptada de ExecuteChangeSet no demuestra despliegue completo. Revisar drift mediante operaciones identificadas antes de usarlas: cdk diff puede preparar un changeset y no se usa como lectura inocua.

## Dobles para validación administrada

Variante implementada localmente: un entrypoint exclusivo de validación empaquetado como asset separado, con su propio digest y handler, desplegado únicamente en la stack test. Reutiliza createManagedHandler con Secrets Manager y DynamoDB reales y dobles explícitos de contacto, suscripciones e IA. No agrega un servicio simulador ni un selector público de proveedores.

El entrypoint y el empaquetador ya están implementados y comprobados localmente; el detalle vigente está en [primera instalación](managed-validation.es.md). Deben exigir nombre de función/tabla y referencia de secreto test, rechazar destinos distintos de dominios .invalid y credenciales ficticias, e impedir fallback a transportes reales. Contacto necesita una dependencia SendEmail explícita en la composición administrada; suscripciones/IA ya tienen request inyectable. En el primer pase se omite R2 remoto y se usa fallback empaquetado. Los casos R2 posteriores deben inyectar su lector explícito, sin credenciales R2 reales. El paquete normal debe excluir el entrypoint, escenarios y dobles; probar ambos paquetes con red bloqueada.

Los dobles cubren éxito, error, cuerpo pendiente y resultado ambiguo sin llamadas externas. La selección de escenario pertenece a un paquete/configuración test revisados, nunca a headers, query o sessionId del visitante. Registrar que ese asset permite comprobar gateway/IAM/Secrets/Dynamo y comportamiento con proveedores simulados; no prueba disponibilidad de Resend, R2 u OpenAI ni el transporte real de esos SDK.

### Matriz de ejecución y evidencia

| Grupo       | Casos y evidencia administrada requerida                                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entrada/IAM | SigV4 válida; anónimo rechazado; identidad sin execute-api:Invoke rechazada; seis rutas; OPTIONS anónimo; sin Function URL; CORS permitido/denegado y errores del gateway           |
| Contratos   | health 200, contacto 204 sin body, starters 200, chat 201, alta/baja 200 con body DELETE; validación y 400/413/429/500/502/503; un efecto simulado por operación                    |
| IP/cuotas   | sourceIp frente a XFF falsificado, IPv6 y origen compartido; concurrencia real desde clientes controlados; cuotas por método; CAS/contención; TTL lógico sin esperar borrado físico |
| IA          | FAQ sin IA; cinco respuestas por sesión y origen; rotación de sesión; reserva global entre instancias; reserva conservada tras ambigüedad; presupuesto solo en secreto privado      |
| Fallos      | secreto inválido y refresh vencido en fixture aislado; almacenamiento denegado/timeout; cuerpos pendientes/cancelación; fallback corrupto o vencido en paquete separado; no replay  |
| Observación | logs sin IP/email/prompt/history/secretos; correlación propia; estados y métricas de las tres alarmas; acciones actualmente vacías; ninguna notificación operativa afirmada         |
| Rendimiento | muestras frías con INIT demostrado, warm separado, latencias por ruta, billed duration, memoria, errores/throttling, requests auxiliares, S3/Secrets/Dynamo/logs y costos           |

Para cada escenario conservar versión de fixture, SHA/digest, cliente/identidad, origen controlado, configuración no secreta, hora, tamaño/muestra, resultado esperado y observado. No guardar payloads personales. Las cuotas reales por IP pueden requerir varios orígenes controlados y ventanas separadas; no falsificar sourceIp con headers. Las fallas de almacenamiento y secreto necesitan fixtures/permisos temporales revisados, no alterar el control compartido activo.

Definir umbrales de latencia/error/costo después de la muestra inicial y antes de aceptar el ambiente. Mantenerlos sin completar mientras no haya datos. Las tres alarmas existentes son señales técnicas con umbrales locales, no un acuerdo de aceptación ni alertas con destinatario. Verificar estados sin enviar notificaciones. Proveedores reales, tarifas/modelo y retención privada de la cuenta requieren un pase posterior específico.

## Recuperación de test y preparación del retorno

Ensayo test: elegir una revisión anterior compatible y aún retenida; recuperar su ZIP por run/digest, verificar bytes y promoción; comparar parámetros y changeset; mantener tabla de control, QUOTA_KEY_SECRET y secreto compatibles; preparar y ejecutar por pasos separados. No restaurar snapshots de contadores ni liberar reservas ambiguas. Si el código anterior no soporta el control/secreto actual o su fallback superó 30 días, no declararlo recuperable para negocio. Health puede seguir siendo liveness sin demostrar recuperación de los seis contratos.

Después del retorno repetir contratos simulados, concurrencia/cuotas, privacidad y observación; registrar tiempos reales desde la decisión hasta disponibilidad y cualquier pérdida/efecto. No hay RTO/RPO comprometidos ni ensayo remoto completado en esta entrega. La recuperación local por hashes no reemplaza ese ensayo.

Antes de un corte productivo, completar este registro privado con inventario verificado del owner:

| Dato          | Estado requerido                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Entrada       | URL del frontend y API, mecanismo exacto de selección, cachés/TTL y comprobación del destino efectivo                  |
| EC2           | instancia/región, contenedores operativos, referencia y digest de cada imagen retenida, Compose/scripts y dependencias |
| Configuración | ubicación privada y mecanismo de recuperación; secretos fuera de Git y de artifacts públicos                           |
| Acceso        | SSM disponible, Tunnel/Traefik y certificados comprobados por su owner                                                 |
| Retorno       | criterio, responsable, ruta de vuelta, solicitudes en vuelo y prueba de health/contratos                               |

Esta entrega no inventaría ni modifica producción. El runbook de corte conserva EC2 operativa, un solo destino por request de escritura y ninguna reproducción de POST/DELETE. Detener la conmutación ante un resultado ambiguo y resolverlo con el owner; volver a EC2 no deshace emails ni suscripciones aceptadas. No usar shadow traffic con efectos. El apagado de EC2 sigue después de las tres migraciones, estabilización y backup recuperable; la renovación editorial general sigue en etapa 11 inmediatamente antes de producción.

## Auditoría efectiva del 25/10/2026

Identidad STS comprobada con Observer en la cuenta personal y us-east-1, antes de consultar recursos. El proveedor OIDC token.actions.githubusercontent.com existe y admite sts.amazonaws.com. No se le atribuye por eso trust de un rol inexistente.

| Recurso esperado                               | Resultado observado                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Cinco roles test y cinco boundaries            | NoSuchEntity                                                                 |
| Stack de aplicación y fundación test           | No existen                                                                   |
| Bucket dedicado y versión SSM papiatest        | NoSuchBucket / ParameterNotFound                                             |
| Lambda y tabla de control test                 | No encontradas                                                               |
| Secretos con prefijo portfolio-api-cloud/test/ | Lista vacía de metadatos activos; no se leyeron valores                      |
| Alarmas portfolio-api-cloud-test-*             | Lista vacía                                                                  |
| Inventario HTTP API V2 regional                | Existe una API productiva de portfolio-cloud; no existe la API test prevista |

No hubo AccessDenied ni cambio de perfil en esta auditoría. Las ausencias son resultados de consultas, no permisos efectivos probados del diseño nuevo. La API productiva existente forma parte del alcance regional aceptado; la propuesta no la modifica ni demuestra aislamiento por nombre para operaciones sobre APIs existentes. La evidencia detallada permanece privada; no se consultaron datos de aplicación ni contenido de logs.

La propuesta pasó cfn-lint 1.57.2. ValidatePolicy de IAM Access Analyzer, con Observer y referencias ficticias, validó las cinco policies y las variantes regional/ID exacto sin hallazgos finales. Esto verifica la forma de las policies; no demuestra su instalación, permisos efectivos, herencia de tags ni compatibilidad de un despliegue.

## Una sola instalación AWS para esta API

La API nueva empieza con una única stack. No se prepara otra instalación paralela para producción: la misma se valida con proveedores simulados y más adelante podrá habilitar proveedores reales mediante configuración revisada. Las implementaciones originales en EC2 permanecen operativas durante la migración.

Conservé los identificadores existentes test, PortfolioApiCloudTest y portfolio-api-cloud-test; son los nombres del único destino actual, no la promesa de un segundo entorno. Las ramas dev/main describen integración y publicación de Git. El environment GitHub test-plan es un control de ejecución del workflow y no una segunda infraestructura AWS. El primer despliegue sigue sin ejecutarse; main/v0.1.0 no habilitan automáticamente el workflow ni providers reales.

La instalación definitiva necesita validar permisos, contratos y recuperación antes de recibir tráfico real. El despliegue y la validación de los dobles en AWS permanecen pendientes; no se agrega LocalStack ni otra simulación local de AWS en este corte.
