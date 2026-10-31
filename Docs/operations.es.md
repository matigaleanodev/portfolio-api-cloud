# Operación y recuperación

[English](operations.md)

CDK acepta `stage=production` en `us-east-1`. Los nombres físicos `portfolio-api-cloud-test` y `PortfolioApiCloudTest*` identifican la única instalación y se conservan para no recrear recursos. Plantillas y políticas viven en [packages/infrastructure/](../packages/infrastructure).

## Configuración no sensible

Llega como variables de entorno de cada función desde parámetros de CloudFormation; el runtime no carga `.env`. El plan de aplicación toma los valores de variables del environment `production` de GitHub:

| Variable                                 | Uso                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL` | Remitente verificado y destinatario de contacto.                                |
| `AI_DAILY_BUDGET_MICROUSD`               | Presupuesto diario global de IA.                                                |
| `AI_PRICING_VALID_UNTIL`                 | Vigencia de la revisión de tarifas (máximo 31 días); renovarla exige desplegar. |
| `R2_ENDPOINT`, `R2_BUCKET`               | Endpoint R2 y bucket de medios (conocimiento, estado editorial e imágenes OG).  |
| `R2_SUBSCRIBERS_BUCKET`                  | Bucket privado de suscriptores; CloudFormation y el runtime exigen que difiera. |
| `MEDIA_BASE_URL`, `BLOG_FROM_EMAIL`      | URL pública de medios y remitente del blog.                                     |
| `CERTIFICATE_ARN`, `ALARM_TOPIC_ARN`     | Certificado ACM del dominio y tópico SNS de alarmas (vacíos los desactivan).    |

Variables de repositorio habilitan cada workflow (`PRODUCTION_PLAN_ENABLED`, `PRODUCTION_FOUNDATION_ENABLED`, `PRODUCTION_EXECUTE_ENABLED`, `PARAMETERS_SYNC_ENABLED`, `MERGE_WORKFLOW_ENABLED`) y nombran los roles de entrega (`PRODUCTION_AWS_ROLE_ARN`, `PRODUCTION_CDK_DEPLOY_ROLE_ARN`, `PRODUCTION_EXECUTION_ROLE_ARN`). Los nombres de claves de entorno están en [configuration.ts](../packages/contracts/src/configuration.ts) y [editorial.ts](../packages/contracts/src/editorial.ts).

## Configuración sensible

Cada función lee un parámetro SSM `SecureString` estándar con un JSON que contiene solo claves sensibles. El nombre llega por `RUNTIME_PARAMETER_NAME` y el runtime rechaza nombres fuera de [configuration.ts](../packages/contracts/src/configuration.ts) sin consultar SSM.

| Parámetro                          | Claves                                                                                   | Funciones                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `/portfolio/prod/api`              | `QUOTA_KEY_SECRET`, `ORIGIN_VERIFY_SECRET`, `RESEND_CONTACT_API_KEY`, `R2_SUBSCRIBERS_*` | `api`                                                      |
| `/portfolio/prod/chat`             | `QUOTA_KEY_SECRET`, `ORIGIN_VERIFY_SECRET`, `OPENAI_API_KEY`, `R2_KNOWLEDGE_*`           | `chat`; `api` para variantes de chat                       |
| `/portfolio/prod/editorial`        | `R2_MEDIA_ACCESS_KEY_ID`, `R2_MEDIA_SECRET_ACCESS_KEY`                                   | `process-release`, `generate-og`, `publish-chat-knowledge` |
| `/portfolio/prod/notifications`    | `R2_SUBSCRIBERS_*`, `RESEND_BLOG_API_KEY`                                                | `notify-post`                                              |
| `/portfolio/validation/{api,chat}` | Valores sintéticos para proveedores ficticios                                            | Variante de validación                                     |

`api` recibe además `CHAT_PARAMETER_NAME` y carga el parámetro de chat solo al atender una variante de chat, por eso su rol también puede leerlo. `QUOTA_KEY_SECRET` y `ORIGIN_VERIFY_SECRET` se publican en api y chat desde el mismo valor. Cada función exige solo sus claves requeridas del [catálogo](../packages/contracts/src/functions.ts); `OPENAI_API_KEY`, `ORIGIN_VERIFY_SECRET` y las credenciales de conocimiento son opcionales y degradan a FAQ/fallback. `QUOTA_KEY_SECRET` requiere al menos 32 caracteres y debe mantenerse estable mientras haya ventanas activas. Claves no sensibles dentro del parámetro se ignoran.

La lectura usa `GetParameter` con descifrado, sin reintentos y con deadline de 3 segundos. El valor validado se cachea hasta cinco minutos; un refresco fallido no reutiliza el snapshot vencido y responde 503 sin exponer detalles.

Los parámetros usan la clave administrada `aws/ssm`, sin costo mensual. Implicancia: cualquier principal de la cuenta con `ssm:GetParameter` sobre el parámetro puede descifrarlo, incluidos roles de solo lectura amplios; los roles de runtime limitan `kms:Decrypt` a SSM y al ARN exacto de sus parámetros.

Limitación actual: las claves R2 están separadas por propósito (knowledge, media, subscribers), pero pueden apuntar al mismo token de Cloudflare. Mientras se use un token único, la segmentación de parámetros no aísla el acceso a R2; acotar tokens por bucket (por ejemplo, solo lectura de medios para chat) es una mejora posible.

### Fuente de verdad y actualización

Los GitHub Actions Secrets del environment `production-parameters` son la única fuente: `RESEND_CONTACT_API_KEY`, `RESEND_BLOG_API_KEY`, `OPENAI_API_KEY`, `QUOTA_KEY_SECRET`, `ORIGIN_VERIFY_SECRET`, `R2_KNOWLEDGE_ACCESS_KEY_ID`, `R2_KNOWLEDGE_SECRET_ACCESS_KEY`, `R2_MEDIA_ACCESS_KEY_ID`, `R2_MEDIA_SECRET_ACCESS_KEY`, `R2_SUBSCRIBERS_ACCESS_KEY_ID` y `R2_SUBSCRIBERS_SECRET_ACCESS_KEY`. Los parámetros no se editan en la consola.

[sync-parameters.yml](../.github/workflows/sync-parameters.yml) corre solo por `workflow_dispatch` desde `main`, con `target` `production` o `validation`. Valida todos los secrets y payloads antes de autenticarse y escribir, y publica siempre los payloads completos con `--overwrite`; su rol OIDC no puede leer ni descifrar. Una clave vacía corta la ejecución sin escrituras, así que no se puede omitir una clave para desactivar una capacidad: para apagar la IA paga, dejar vencer `AI_PRICING_VALID_UNTIL` o bajar el presupuesto. Las funciones toman el valor nuevo en hasta cinco minutos, sin desplegar.

Para cargar o rotar un secret desde VS Code:

1. Con la extensión GitHub Actions, abrir el panel **Settings**, el environment `production-parameters` y su sección **Secrets** para crear o reemplazar el valor. Alternativa desde la terminal integrada: `gh secret set NOMBRE --env production-parameters`, que pide el valor por entrada estándar y no lo deja en el historial.
2. Ejecutar el workflow **Sync runtime parameters** en `main` desde la vista Workflows de la extensión, o con `gh workflow run sync-parameters.yml --ref main -f target=production`, y aprobar el environment.
3. Revisar en el resumen del run la versión publicada de cada parámetro.

No guardar valores en archivos del checkout ni en variables de environment no secretas.

## Entrega protegida

1. Integrar por PR en `dev` y promover a `main` con CI exitoso. `verify` es requerido; [merge.yml](../.github/workflows/merge.yml) exige el SHA completo revisado e identidad real de `matigaleanodev`, con `MERGE_USER_TOKEN` del environment `merge`, sin fallback de App ni bypass de PR/CI.
2. Seleccionar `api-assembly-<sha>-<run>-<attempt>` de un CI por push exitoso y una revisión promovida a `main`. Comparar run, ID, digest e inventario. La retención es de 30 días; conservar una copia verificada para recuperación posterior.
3. [plan-foundation-production.yml](../.github/workflows/plan-foundation-production.yml) prepara foundation, roles y boundaries por separado. Exige `previous_runtime_secret_arn`: el ARN del secreto que todavía lee un runtime anterior, o `none` para no conceder nada.
4. [plan-production.yml](../.github/workflows/plan-production.yml) toma las variables del environment `production`, verifica sin descifrar que existan los cuatro parámetros productivos como `SecureString` y prepara el changeset desde el assembly sin recompilar el runtime. El recibo publica los parámetros de CloudFormation como `sha256`, y su digest ata la ejecución a esos valores.
5. Revisar template, assets y recibo. [build-and-deploy.yml](../.github/workflows/build-and-deploy.yml) los verifica de nuevo y ejecuta solo el StackId/ChangeSetId y digest revisados.

Los environments productivos admiten `main`; las banderas `*_ENABLED` quedan desactivadas fuera de su operación. OIDC restringe owner, repositorio y environment. Planificación, publicación, ejecución de CloudFormation, sincronización de parámetros y runtime usan roles separados. Push y tags no despliegan automáticamente.

`recover_bundle.py` valida artifacts actuales e históricos `test-assembly-*` sin relajar hashes ni extracción segura.

## Ingress, observabilidad y capacidad

El dominio usa ACM regional y Cloudflare con TLS estricto. Una regla específica del hostname sobrescribe `x-portfolio-origin`; el runtime valida secreto y rangos de Cloudflare antes de aceptar `CF-Connecting-IP`. `DisableDefaultEndpoint` permite cerrar execute-api después de verificar el dominio; `PublicAccess` controla acceso IAM o anónimo de las rutas de negocio.

Los logs JSON se retienen 14 días y omiten bodies, prompts, emails, IPs, sesiones y secretos. Tres alarmas, dentro de la capa gratuita de CloudWatch:

| Alarma              | Métrica                                                                      | Disparo                        |
| ------------------- | ---------------------------------------------------------------------------- | ------------------------------ |
| `http-errors`       | Métrica personalizada única de respuestas 5xx de `api` y `chat`              | ≥1 en 2 de 3 períodos de 5 min |
| `account-throttles` | `AWS/Lambda Throttles` sin dimensión: toda la cuenta                         | ≥1 en 2 de 3 períodos de 5 min |
| `account-errors`    | `AWS/Lambda Errors` sin dimensión: crash, timeout u OOM de cualquier función | ≥1 en 1 período de 5 min       |

Las dos de cuenta son compartidas: otros proyectos de la misma cuenta no deben duplicarlas. El handler HTTP no relanza, así que `Errors` refleja fallas de plataforma. No hay access logs del stage: para distinguir 429 de API Gateway de los de la aplicación, comparar la métrica `AWS/ApiGateway 4xx` con los 429 registrados por las funciones. `AlarmTopicArn` conecta SNS; verificar también la confirmación de la suscripción y la entrega.

API Gateway limita rate/burst del stage y DynamoDB mantiene cuotas y reservas. Las funciones no tienen reserved concurrency y comparten la cuota regional de concurrencia de la cuenta con otros proyectos; separar funciones no agrega capacidad. Reservar concurrencia solo tiene sentido con una cuota que deje margen sin reservar.

## Migración, despliegue y recuperación

Procedimiento genérico para pasar de un runtime anterior (secreto en Secrets Manager y publicación editorial en otro stack) a esta arquitectura, o para repetir un despliegue. Cada paso con efectos requiere autorización explícita.

1. Aplicar `delivery-access.template.json` con un rol administrador: incluye el rol de sincronización de parámetros, confiado solo al environment `production-parameters` y limitado a escribir los parámetros declarados.
2. Configurar los once secrets en el environment `production-parameters` (solo `main`, revisor requerido), las variables no sensibles en `production` y las variables de repositorio.
3. Integrar la revisión en `main`: el sync solo corre desde ahí.
4. Ejecutar `sync-parameters.yml` con `target=production` (y `validation` si se usará esa variante).
5. Planificar y aplicar foundation con `previous_runtime_secret_arn` igual al ARN del secreto anterior mientras el runtime desplegado lo lea; `none` si ya no hay runtime anterior. Foundation actualiza las boundaries: lectura de parámetros para el runtime y verificación sin descifrar para el rol de plan.
6. Planificar la aplicación (el guard exige los parámetros) y ejecutar el changeset revisado. Las funciones editoriales quedan sin invocador hasta el corte.
7. Validar: health y OPTIONS por el dominio custom (verifican origen leyendo SSM), FAQ de chat sin modelo, starters con GET y HEAD, contacto y alta/baja descartables, un evento vacío a cada función editorial (400 sin efectos) y logs sin `AccessDenied`.
8. Corte editorial entre publicaciones: confirmar que no haya una publicación en curso y cambiar en `portfolio` las variables de nombre de función del workflow (`PORTFOLIO_CLOUD_PROCESS_RELEASE_FUNCTION_NAME` y `PORTFOLIO_CLOUD_PUBLISH_CHAT_KNOWLEDGE_FUNCTION_NAME`) a `portfolio-api-cloud-test-process-release` y `portfolio-api-cloud-test-publish-chat-knowledge`. Con el mismo bucket de medios, `state/posts.json` y las claves R2 se conservan y el estado continúa.

Rollback:

- Editorial: volver las variables del workflow a las funciones anteriores.
- Aplicación: ejecutar el changeset del artifact anterior por el mismo proceso. Solo funciona mientras el secreto anterior siga legible y la foundation conceda acceso a él (paso 5).
- Tráfico: restaurar el CNAME proxied al destino anterior conservado, verificando destino y disponibilidad. Volver DNS no revierte datos, suscripciones ni envíos.
- Notify parcial: revisar `lastFailure` en `state/posts.json` y los logs antes de reinvocar; reinvocar a ciegas puede reenviar avisos (ver [limitaciones](api.es.md#idempotencia-y-limitaciones)).

No recompilar una revisión vieja ni tratar el rollback de CloudFormation como restauración de datos. Preservar la tabla, las reservas y los parámetros; no reiniciar el presupuesto para recuperar servicio.

Retiro posterior, manual y como decisiones separadas: aplicar foundation con `previous_runtime_secret_arn=none` y eliminar el secreto anterior de Secrets Manager cuando ya no haga falta como rollback; retirar el stack editorial anterior y su rol cuando ningún workflow lo invoque. La API NestJS y EC2 son alternativas independientes; retirarlos requiere migrar las otras aplicaciones que dependen de ellos.

## Mantenimiento

- Antes de `AI_PRICING_VALID_UNTIL`, revisar las [tarifas oficiales](https://developers.openai.com/api/docs/pricing) y los límites del único modelo. Si cambian, actualizar la reserva conservadora en `shared-control.ts`, tests y artifact; luego renovar la vigencia en la variable del environment `production` (hasta 31 días) y desplegar. No extender la fecha sin revisar precios.
- Renovar el fallback desde el artifact de conocimiento que genera `portfolio`, validando esquema, checksum y antigüedad máxima de 30 días. Reemplazarlo por PR/CI sin sellar contenido viejo con fecha nueva.
- Rotar credenciales actualizando el GitHub Secret y ejecutando el sync; mantener estable `QUOTA_KEY_SECRET` salvo que se acepte reiniciar ventanas activas.
- Revisar los [rangos de Cloudflare](https://www.cloudflare.com/ips/), permisos y dependencias. Manifiestos, lock y código son la referencia de versiones.

[Arquitectura](architecture.es.md) · [Decisiones](decisions.es.md)
