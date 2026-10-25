# CI/CD preparado

[English](ci-cd.md) · 24/10/2026. Los workflows cubren validación documental, preparación de test e integración de ramas. La aplicación local incluye health y contacto con pruebas; cuatro rutas de negocio siguen pendientes; la stack se sintetiza localmente.

## CI

`.github/workflows/ci.yml`: PR hacia main/dev, push a esas ramas y dispatch manual. Permisos de lectura; sin OIDC, secretos ni credenciales AWS.

El job documentation valida pares/enlaces y detecta aplicación e infraestructura por separado. package.json exige lock, tsconfig y entrada real; restos de aplicación sin manifiesto fallan. cdk.json activa infraestructura y exige sus scripts específicos.

Application ejecuta `npm ci --ignore-scripts`, `format:check`, `typecheck`, `build`, `test:app`, `test:tooling` y `test:package` en Node 24.22.1. Vitest ejecuta 155 casos de aplicación y 12 de tooling migrados desde unittest. No hay lint con --fix ni modificación automática de fuentes. El cerco de red se carga antes de la aplicación, con ambiente sin credenciales heredadas. [Cobertura y reporte QA](testing.es.md).

Infrastructure está activo porque ya existe cdk.json; ejecuta 11 casos en `test:infra` y `cdk -- synth --no-lookups --context stage=test`, sin credenciales AWS. [Stack local y prerrequisitos](infrastructure.es.md).

El check obligatorio sigue llamándose `verify`, ligado a GitHub Actions: exige documentation exitosa y éxito de cada ámbito presente; solo admite skipped para un ámbito ausente. El job de aplicación debe aprobar completo. El summary distingue aplicación y synth; no declara infraestructura comprobada si falta la stack.

Validación local: `npm run check` y actionlint. La CI de la base se comprobó también en el PR #4; cada nuevo head debe volver a aprobar los checks requeridos.

## Preparación de despliegue test

`.github/workflows/deploy-test.yml`: solo dispatch manual desde main del repo exacto; además exige `TEST_PLAN_ENABLED=true` y environment `test-plan`. Actualmente no se creó environment, roles, variables ni infraestructura y el job queda omitido. No hay trigger de despliegue por push ni camino prod.

La configuración del ambiente requiere revisión del environment y OIDC limitado a `repo:matigaleanodev/portfolio-api-cloud:environment:test-plan`, comprobando también la restricción de ramas del environment. Roles previstos:

- Variable TEST_AWS_ROLE_ARN: rol personal `PortfolioApiCloudTestGitHubDeployRole`.
- Variable TEST_CDK_DEPLOY_ROLE_ARN: `PortfolioApiCloudTestCdkDeployRole`, asumido por la CLI según el assembly, con PassRole solo al ejecutor previsto.
- Variable TEST_EXECUTION_ROLE_ARN: `PortfolioApiCloudTestCloudFormationExecutionRole`.
- Stack única: ID CDK PortfolioApiCloudTest, nombre físico portfolio-api-cloud-test, cuenta 650387442642, us-east-1.

El synthesizer configura cloudFormationExecutionRole y deployRoleArn con esos roles distintos. El workflow valida cloudFormationExecutionRoleArn/assumeRoleArn en el manifest; no pasa el ejecutor como --role-arn de la CLI. Roles de publicación de assets y trust del bootstrap se revisan aparte antes de habilitar.

El workflow comprueba archivos, scripts, tests y synth offline antes de autenticarse; revisa manifest y luego identidad exacta. El plan usa `cdk deploy --method prepare-change-set` con nombre SHA/run único. **Es una mutación futura:** puede publicar assets S3/ECR y crear changeset/stack preparatoria, aunque no ejecute infraestructura. No es una consulta read-only y no se ejecutó en esta auditoría. `--require-approval never` evita el prompt CLI; la revisión se aplica mediante el environment y el changeset.

No contiene execute-change-set, deploy directo, bootstrap, destroy, imports cloud existentes ni roles genéricos. Para ejecutar un changeset se necesita un paso de ejecución que vincule el ARN exacto a stack, SHA, assets y revisión. CDK `diff` por defecto también puede crear changesets; no usarlo como supuesto read-only durante auditorías.

El comando proporciona el parámetro obligatorio `RuntimePermissionsBoundaryArn` con el ARN previsto. Antes de habilitar preparación, revisar/provisionar esa boundary y bootstrap/roles de publicación con permisos acotados. La stack no lo crea automáticamente. Esta ejecución no se realizó.

## Merges y sincronización de dev

El workflow `.github/workflows/merge.yml` exige dispatch por matigaleanodev desde main/dev, environment merge, PR existente del mismo repositorio y SHA completo revisado. Valida checks con GITHUB_TOKEN de solo lectura y usa `MERGE_USER_TOKEN` exclusivamente para comprobar la identidad y solicitar el merge por API. Rechaza bots, otra cuenta, acceso insuficiente o bypass amplio; confirma merged_by y el commit devueltos por GitHub. No altera autoría ni fechas del merge y no tiene fallback al token de instalación.

MERGE_USER_TOKEN está provisionado con la credencial OAuth de usuario existente, verificada como matigaleanodev, sin ampliar scopes. El PR #5 instaló el mecanismo mediante una última integración por la App. El actor de updates es ahora User 99203645, solo pull_request; PR/CI sigue sin bypass. El environment conserva main/dev y no admite ejecución desde feat/. [Credencial, permisos, comprobaciones y limitaciones de la transición](integration.es.md).

Para sincronizar main→dev, mantener una rama release/sync-main-to-dev basada en dev, integrar main allí y abrir PR a dev. No hacer push directo, force, merge manual ni --admin. dev no se declara espejo SHA exacto de main: conserva merge commits propios.

## Pendientes operativos

El repositorio tiene dev como rama predeterminada; main todavía no existe. El environment de merge conserva main/dev; el workflow usa identidad de usuario tras la transición del PR #5. La primera ejecución se registra en el PR #2; la configuración por sí sola no demuestra un merge exitoso. Siguen pendientes el environment test-plan, los roles/bootstrap. El despliegue no se validó end-to-end. La integración inicial del PR #1 consumió la excepción temporal limitada a dev descrita en [protección de ramas](branch-protection.es.md).

Branches: solo feat/, fix/, release/; codex/ prohibido. main/dev se integran por PR fusionado desde workflow. Mantener ejecución serial, permisos por job y artifacts/versiones inmutables. Producción continúa fuera del alcance.

## Evidencia local separada

Los cambios del experimento fueron descartados. Esta base incorpora una nueva detección aplicación/infraestructura con pruebas propias; no recupera los scripts comparativos. El plan test conserva sus restricciones de repo, rama, environment, roles, identidad y changeset. Sus comandos ahora coinciden con typecheck, build, test y test:package; test:infra y CDK ya ejecutan validación local; sus requisitos AWS siguen pendientes. [Base local](application.es.md).

## Recuperación del primer merge con App

La [ejecución inicial](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40147675945) validó el PR y generó el token, pero `gh pr merge` se detuvo localmente al observar `mergeStateStatus=BLOCKED`, antes de pedir el merge al servidor. La corrección usa el endpoint de merge con SHA exacto y confirma `merged=true`. La [recuperación](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40147939891) integró el PR #2 con la App, conservando PR/CI. Usó una entrada temporal desde `feat/migration-evidence-docs`, ligada a su SHA exacto y al environment `merge`. Este cierre elimina esa condición; la variable de recuperación y el permiso de la rama en el environment ya fueron retirados. El flujo habitual vuelve a aceptar dispatch solo desde main/dev y el environment conserva únicamente esas ramas. No se retiró dev del bloqueo ni se cambió el ruleset de calidad.
