# Diseño de entrega y recuperación de test

[English](deployment-design.md) · 25/10/2026.

**Incremento vigente:** [primera instalación con dobles y circuito Actions](managed-validation.es.md), implementados localmente. main/v0.1.0 ya existen; provisioning, ejecución y validación administrada siguen pendientes.

## Auditoría y corte

CDK TypeScript ya estaba elegido y la stack agrupada ya existía. Conservé HTTP API v2 con IAM, una Lambda fuera de VPC, la tabla de control, los secretos externos y los límites del runtime. Completé nombres acotables de tabla/alarmas, assertions de identidad e invocación y conservación del assembly. No agregué una stack de provisioning ni una segunda API.

La etapa 5 queda cubierta como diseño e implementación local revisable. La etapa 6 conserva el merge humano protegido existente y agrega pruebas del plan y retención en CI. La preparación AWS, el despliegue y la validación administrada siguen separados. Las matrices siguientes conservan el contrato de diseño inicial. La propuesta local materializada y sus ajustes actuales están en [operación test](test-operations.es.md); no son políticas instaladas ni permisos efectivos comprobados.

## Configuración y separación por ambiente

Solo existe `test`: cuenta `650387442642`, región `us-east-1`, stack `portfolio-api-cloud-test`, qualifier `papiatest`. El constructor rechaza ausencia de stage y cualquier otro valor. No hay defaults productivos ni selección automática por rama.

`CorsOrigin` es configuración pública y queda vacío por defecto. `RuntimeSecretArn` es una referencia externa obligatoria y restringida al prefijo `portfolio-api-cloud/test/`; el valor JSON permanece en Secrets Manager. `RuntimePermissionsBoundaryArn` exige la política exacta prevista, sin default. Tabla `portfolio-api-cloud-test-control`, función/log group y tres alarmas tienen nombres propios de test. El ID de API se obtiene por referencia CloudFormation.

Los destinos de contacto, suscripciones, R2 y las credenciales de proveedores de test deben estar aislados. La tabla es compartida entre revisiones de este runtime: recuperar código no reinicia cuotas ni reservas. El secreto de derivación debe conservarse durante las ventanas activas.

## Trust y delegación

Todos los roles siguientes pertenecen a la cuenta personal. Sus nombres se anteponen con `PortfolioApiCloudTest`.

| Rol                         | Principal de confianza                     | Delegación y alcance                                                                          |
| --------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| GitHubDeployRole            | proveedor OIDC GitHub, con aud/sub exactos | únicamente sts:AssumeRole hacia CdkDeployRole y FilePublishingRole                            |
| CdkDeployRole               | ARN exacto de GitHubDeployRole             | preparar/leer changesets de la stack test y PassRole al ejecutor exacto                       |
| FilePublishingRole          | ARN exacto de GitHubDeployRole             | publicar/leer assets del bucket dedicado; sin CloudFormation ni PassRole                      |
| CloudFormationExecutionRole | servicio cloudformation.amazonaws.com      | administrar los recursos de esta stack; PassRole solo al runtime                              |
| RuntimeRole                 | servicio lambda.amazonaws.com              | logs propios, operaciones de control y lectura del secreto exacto; sin AssumeRole ni PassRole |

Trust OIDC previsto para GitHubDeployRole:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::650387442642:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:matigaleanodev/portfolio-api-cloud:environment:test-plan"
        }
      }
    }
  ]
}
```

Con environment, el sub no acredita por sí mismo la rama. El environment debe admitir únicamente main; el workflow exige además repo exacto, main, dispatch manual y TEST_PLAN_ENABLED=true. main ya existe; los environments y roles efectivos dejan la activación pendiente; no se habilita dev como atajo. No confiar en toda la cuenta ni usar comodines en Principal/sub. El job de CI no recibe OIDC. [OIDC y environments](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).

PassRole de CdkDeployRole requiere Resource `arn:aws:iam::650387442642:role/PortfolioApiCloudTestCloudFormationExecutionRole` y StringEquals `iam:PassedToService=cloudformation.amazonaws.com`. El ejecutor solo puede pasar `arn:aws:iam::650387442642:role/PortfolioApiCloudTestRuntimeRole` con `iam:PassedToService=lambda.amazonaws.com`. GitHub y el publicador no reciben PassRole. [Delegación IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_passrole.html).

## Políticas y boundaries por responsabilidad

La implementación administrativa de etapa 7 debe traducir esta matriz a policies y comprobar cada acción/condición con el template exacto y la referencia de autorización de AWS. No ampliar a AdministratorAccess para resolver un rechazo.

| Identidad             | Allow previsto                                                                                                                                                                                                                                                     | Recurso/condición                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub                | sts:AssumeRole                                                                                                                                                                                                                                                     | los dos roles exactos anteriores; ninguna acción directa sobre recursos de aplicación                                                                                   |
| Deploy                | cloudformation:CreateChangeSet, DescribeChangeSet, DeleteChangeSet, DescribeStacks, DescribeStackEvents, GetTemplate, GetTemplateSummary                                                                                                                           | stack arn:aws:cloudformation:us-east-1:650387442642:stack/portfolio-api-cloud-test/_; condiciones de creación RoleArn exacto y ChangeSetName portfolio-api-cloud-test-_ |
| Deploy                | ssm:GetParameter                                                                                                                                                                                                                                                   | arn:aws:ssm:us-east-1:650387442642:parameter/cdk-bootstrap/papiatest/version                                                                                            |
| Deploy                | s3:GetObject, GetBucketLocation y ListBucket                                                                                                                                                                                                                       | únicamente bucket dedicado y sus objetos; sin borrado                                                                                                                   |
| Publicador            | s3:GetBucketLocation, ListBucket; GetObject, PutObject                                                                                                                                                                                                             | bucket dedicado para acciones de bucket; objetos para acciones de objeto; sin DeleteObject                                                                              |
| Ejecutor              | lambda:CreateFunction, GetFunction, GetFunctionConfiguration, UpdateFunctionCode, UpdateFunctionConfiguration, DeleteFunction, AddPermission, RemovePermission, GetPolicy, PutFunctionConcurrency, DeleteFunctionConcurrency, TagResource, UntagResource, ListTags | función portfolio-api-cloud-test de cuenta/región previstas                                                                                                             |
| Ejecutor              | dynamodb:CreateTable, DescribeTable, UpdateTable, DeleteTable, DescribeTimeToLive, UpdateTimeToLive, TagResource, UntagResource, ListTagsOfResource                                                                                                                | tabla portfolio-api-cloud-test-control; eliminación sigue protegida y retenida                                                                                          |
| Ejecutor              | logs:CreateLogGroup, DescribeLogGroups, PutRetentionPolicy, DeleteRetentionPolicy, TagResource, UntagResource, ListTagsForResource                                                                                                                                 | grupo /aws/lambda/portfolio-api-cloud-test; separar DescribeLogGroups si requiere Resource *                                                                            |
| Ejecutor              | cloudwatch:PutMetricAlarm, DeleteAlarms, DescribeAlarms                                                                                                                                                                                                            | alarm:portfolio-api-cloud-test-*; separar lecturas sin soporte de ARN                                                                                                   |
| Ejecutor              | apigateway:GET, POST, PATCH, PUT, DELETE                                                                                                                                                                                                                           | región us-east-1, /apis y /apis/* según acción; ID generado, revisar soporte de tags/condiciones antes de provisionar                                                   |
| Ejecutor              | iam:GetRole, CreateRole, DeleteRole, PutRolePolicy, GetRolePolicy, DeleteRolePolicy, TagRole, UntagRole                                                                                                                                                            | únicamente RuntimeRole; CreateRole exige iam:PermissionsBoundary exacta de runtime                                                                                      |
| Runtime y su boundary | logs:CreateLogStream, PutLogEvents; dynamodb:GetItem, PutItem, UpdateItem; secretsmanager:GetSecretValue                                                                                                                                                           | streams propios, tabla exacta, secreto exacto configurado                                                                                                               |

El ejecutor necesita además s3:GetObject sobre los assets del bucket para instalar código. No puede leer secretos, datos DynamoDB, crear access keys ni modificar roles de pipeline/bootstrap o policies de boundary. Si una actualización exige PutRolePermissionsBoundary, permitir exclusivamente la misma boundary; no permitir DeleteRolePermissionsBoundary, AttachRolePolicy ni mutación de esa política. La stack actual no necesita cambiar el trust después de crear RuntimeRole.

GitHub/deploy/publicador requieren boundaries administrativas externas que limiten respectivamente AssumeRole, preparación y S3 a esta matriz. El ejecutor requiere su propia boundary, distinta de la de runtime, que limite los servicios/recursos anteriores y la creación de roles con boundary obligatoria. Las policies de identidad y las boundaries se revisan juntas: una boundary limita, no concede permisos. Conservar denegaciones organizativas/SSO existentes y analizar resource policies; este diseño no evade restricciones de Architect. [Boundaries CDK](https://docs.aws.amazon.com/cdk/v2/guide/customize-permissions-boundaries.html).

La preparación no concede ExecuteChangeSet, CreateStack, UpdateStack, DeleteStack ni RollbackStack. El paso de ejecución futuro tendrá otra revisión explícita del ARN exacto del changeset y su identidad. Las excepciones de Resource * solo corresponden a acciones que no soportan ARN y deben separarse/documentarse. API Gateway crea IDs no conocidos de antemano: el prefijo regional /apis/* no garantiza aislamiento por API; eso requiere revisar condiciones soportadas y el entorno antes de activar el ejecutor. [Permisos CloudFormation](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cloudformation.html).

## Bootstrap mínimo diseñado

Bucket dedicado `cdk-papiatest-assets-650387442642-us-east-1`, cuatro bloqueos de acceso público, propiedad BucketOwnerEnforced, cifrado SSE-S3, TLS obligatorio y versionado. Retener bucket/objetos; no agregar CMK, ECR, Docker publisher, lookup role ni trust entre cuentas para este ZIP. Outputs BucketName, BucketDomainName y BootstrapVersion. Parámetro de versión `/cdk-bootstrap/papiatest/version` y versión compatible con el assembly fijado. Roles/policies/boundaries anteriores se provisionan fuera de la stack de aplicación y se revisan antes de usarla.

No usar la plantilla estándar con AdministratorAccess ni interpretar qualifier propio como aislamiento de permisos. La fundación se prepara y ejecuta únicamente mediante workflows manuales de GitHub Actions separados, después de establecer la identidad inicial de confianza. La definición administrativa final debe comprobar compatibilidad con la CLI fijada y sus lecturas auxiliares; los tests locales no acreditan esa compatibilidad efectiva. [Personalización](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-customizing.html), [seguridad](https://docs.aws.amazon.com/cdk/v2/guide/best-practices-security.html).

## Conservación y recuperación verificable

CI conserva el assembly solo después de tests y synth; el plan conserva el suyo antes de autenticarse. Nombre por SHA/run/intento y retención GitHub de 30 días, sin sobrescritura. El bundle contiene los archivos de cdk.out referenciados por el manifest (templates y assets, sin copias históricas ajenas), lock, revisión/Node y checksums SHA-256 de todos los archivos. La creación rechaza destinos existentes, revisiones incompletas, Node distinto, otro ambiente, symlinks y nombres privados conocidos; verify rechaza cambios, faltantes, extras o revisión diferente.

Los hashes detectan alteración accidental, no autentican un bundle cuyo inventario también fue reemplazado. Recuperar del run/repo/commit revisados, verificar el digest del artifact y contrastar la revisión con GitHub. El contenido es público y no incluye valores de Secrets Manager ni credenciales. Revisar el assembly nuevo antes de publicarlo; un filtro de nombres no demuestra ausencia de cualquier secreto arbitrario.

Para ensayar recuperación local, descargar el artifact correspondiente en un directorio nuevo y ejecutar:

```bash
python3 scripts/review_bundle.py verify /ruta/al/bundle SHA_COMPLETO_REVISADO
```

Usar el assembly conservado para la futura preparación, sin recompilar ni sintetizar otra revisión. Validar de nuevo cuenta, región, parámetros externos, identidad y changeset antes de ejecutarlo. No ejecutar por el mero éxito de verify. La recuperación del runtime requiere el mismo control compartido y secreto compatible; no restaurar contadores antiguos.

Retención diseñada del bucket: al menos 90 días para assets corrientes y versiones anteriores, con limpieza solo después de identificar referencias activas y una versión de recuperación. No aplicar una regla ciega de expiración a assets activos. GitHub 30 días no es un archivo histórico: antes de vencer, conservar de forma controlada el bundle de la revisión activa y la anterior. Logs test siguen en 14 días; tabla retenida con TTL lógico/físico. Retención y restauración de datos externos corresponden a su owner. [Artifacts GitHub](https://docs.github.com/en/actions/tutorials/store-and-share-data).

## Criterios para las etapas siguientes

| Etapa | Preparación incluida                                 | Evidencia que sigue faltando                                                                                                                                       |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 7     | matriz IAM, trust, boundaries, bootstrap/config test | identidad personal, inventario efectivo, policies finales revisadas, proveedores aislados y provisioning separado                                                  |
| 8     | bundle retenido y plan manual sin ejecución          | ARN de changeset revisado, assets/digest, parámetros, permisos y ejecución separada                                                                                |
| 9     | lista de aceptación                                  | SigV4 y rechazo anónimo; seis contratos; proxies/IP; cuotas concurrentes reales; fallos/timeout; secreto inválido; fallback corrupto/vencido; privacidad y alarmas |
| 10    | verificación local de integridad y retorno de código | ensayo de recuperación test y del routing con EC2 operativa, digests/config de origen, efectos en vuelo y runbook del corte                                        |
| 11–14 | orden vigente conservado                             | renovar conocimiento inmediatamente antes de producción; desplegar, estabilizar y recién después completar la migración de las otras APIs y conservar EC2          |

En etapa 9 empezar con destinos/proveedores simulados, sin envíos reales ni generación paga. Medir INIT, latencias por ruta, duración facturada, errores, throttling y costos auxiliares. Establecer umbrales con esas muestras antes de exposición; no inventar valores de aceptación o RTO/RPO. Las alarmas actuales no tienen acciones: su existencia no demuestra una notificación operativa.

La recuperación de tráfico debe mantener un solo destino de escritura por request, sin replay de POST/DELETE. Volver a EC2 no deshace emails o suscripciones aceptadas. La renovación editorial general y la revisión de modelo/tarifas permanecen en sus pasos previstos.

## Preparación local posterior de etapas 6–10

[Operación test](test-operations.es.md) y [plantilla de fundación](../infra/test-foundation.template.json) materializan las policies/boundaries y el bootstrap mínimo. Incluyen GetEncryptionConfiguration y GetParameters requeridos por las lecturas de la CLI, así como administración API V2 deshabilitada por defecto. El plan recupera el artifact revisado por run/digest y comprueba promoción a main sin recompilar. Auditoría Observer realizada; no hay recursos test provisionados. Dobles administrados, ejecución del changeset, recuperación test y retorno productivo siguen pendientes según ese runbook.
