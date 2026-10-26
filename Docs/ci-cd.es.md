# Integración y entrega

[English](ci-cd.md)

La CI ejecuta documentación, tipos, build, contratos, tooling, empaquetado y síntesis CDK sin credenciales AWS. El check obligatorio `verify` conserva el resultado de todos los trabajos. Los PR y merges protegidos se integran mediante `merge.yml` con la identidad real de matigaleanodev.

## Artifact y planificación

`ci.yml` publica `api-assembly-<sha>-<run>-<attempt>` por 30 días. El bundle contiene assembly completo, metadata CDK referenciada, lock, revisión, versión de Node e inventario SHA256. `plan-production.yml` exige CI exitosa por push en main/dev, promoción de esa revisión a main y revisión del run, ID y digest del artifact. Recupera ese paquete y prepara el changeset sin recompilar el runtime.

El environment `production-plan` admite exclusivamente main. `PRODUCTION_PLAN_ENABLED` permanece false fuera de una operación. Las variables `PRODUCTION_AWS_ROLE_ARN`, `PRODUCTION_CDK_DEPLOY_ROLE_ARN`, `PRODUCTION_EXECUTION_ROLE_ARN` y `PRODUCTION_RUNTIME_SECRET_ARN` apuntan a las identidades y configuración existentes. `PRODUCTION_CERTIFICATE_ARN` identifica el certificado ACM; `PRODUCTION_ALARM_TOPIC_ARN`, el canal de alarmas.

`plan-foundation-production.yml` prepara por separado la [fundación](../infra/production-foundation.template.json), con digest de template revisado y environment `production-foundation-plan`. `validation-secret.yml` conserva su finalidad exclusiva de crear configuración ficticia, nunca credenciales reales.

## Ejecución

El workflow visible **build and deploy**, archivo `build-and-deploy.yml`, usa `production-execute` y `PRODUCTION_EXECUTE_ENABLED`. Recibe StackId, ChangeSetId y digest del recibo revisado. Restringe la sesión a ese destino, vuelve a verificar el changeset y sus assets publicados, compara el digest y ejecuta una sola vez. No hay despliegue automático por push ni bypass de PR/CI.

Los trusts OIDC usan propietario/repositorio inmutables y environments exactos; main se comprueba tanto en workflow como en políticas del environment. Los roles de planificación, publicación, ejecución CloudFormation y runtime siguen separados. Los nombres físicos heredados `portfolio-api-cloud-test`, `PortfolioApiCloudTest*`, bucket y tabla se conservan para evitar recreación y pérdida de datos.

## Recuperación

`recover_bundle.py` admite tanto `api-assembly-...` como los artifacts históricos `test-assembly-...`, con los mismos controles de run, revisión, digest, extracción e inventario. No se renombran artifacts publicados ni se relajan sus verificaciones. Las versiones 1 y los campos originales de metadata histórica siguen siendo recuperables.

[Dominio, continuidad y rollback](production.es.md). Los documentos de la primera instalación conservan los nombres y resultados de ese momento.

La creación regional del dominio exige el tag Project y `ForAllValues:StringEquals` para `apigateway:Request/EndpointType`, con presencia obligatoria mediante Null=false. Ese campo es multivalor; el operador escalar rechaza una solicitud regional válida. La revisión admite UPDATE_ROLLBACK_COMPLETE como estado estable para preparar una corrección, conservando los controles de identidad, template, assets y digest.
