# CI/CD preparado

[English](ci-cd.md) · 24/10/2026. Los workflows cubren validación documental, preparación de test e integración de ramas. Esta entrega versiona documentación; la aplicación y el stack productivos todavía no están implementados.

## CI

`.github/workflows/ci.yml`: PR hacia main/dev, push a esas ramas y dispatch manual. Permisos de lectura; sin OIDC, secretos ni credenciales AWS. Valida documentos y sus pares/enlaces. Mientras no exista package.json informa explícitamente que no hubo tests/build/synth; no simula pruebas exitosas de una API inexistente.

Cuando se agregue aplicación, requiere también lockfile/cdk.json y el contrato de scripts: `lint` sin --fix, `test -- --ci --runInBand`, `test:e2e`, `build`, `cdk -- synth --no-lookups --context stage=test`. Este contrato es futuro, no comandos ya disponibles. Las pruebas deben ignorar .env, usar configuración ficticia y bloquear proveedores/red externa por defecto, tanto si el runtime elegido es Nest como si usa handlers nativos. Adaptar runner/scripts expresamente si cambia la elección.

El job agregado `verify` es el check obligatorio configurado en GitHub, ligado a la App GitHub Actions. Falla si documentación o aplicación presente fallan. En etapa documental, el job application se omite y el summary lo aclara. La validación local se hace con `python3 scripts/check_docs.py` y actionlint disponible en el entorno del mantenedor.

## Preparación de despliegue test

`.github/workflows/deploy-test.yml`: solo dispatch manual desde main del repo exacto; además exige `TEST_PLAN_ENABLED=true` y environment `test-plan`. Actualmente no se creó environment, roles, variables ni infraestructura y el job queda omitido. No hay trigger de despliegue por push ni camino prod.

La configuración del ambiente requiere revisión del environment y OIDC limitado a `repo:matigaleanodev/portfolio-api-cloud:environment:test-plan`, comprobando también la restricción de ramas del environment. Roles previstos:

- Variable TEST_AWS_ROLE_ARN: rol personal `PortfolioApiCloudTestGitHubDeployRole`.
- Variable TEST_CDK_DEPLOY_ROLE_ARN: `PortfolioApiCloudTestCdkDeployRole`, asumido por la CLI según el assembly, con PassRole solo al ejecutor previsto.
- Variable TEST_EXECUTION_ROLE_ARN: `PortfolioApiCloudTestCloudFormationExecutionRole`.
- Stack única: ID CDK PortfolioApiCloudTest, nombre físico portfolio-api-cloud-test, cuenta 650387442642, us-east-1.

El synthesizer futuro debe configurar cloudFormationExecutionRole y deployRoleArn con esos roles distintos. El workflow valida cloudFormationExecutionRoleArn/assumeRoleArn en el manifest; no pasa el ejecutor como --role-arn de la CLI. Roles de publicación de assets y trust del bootstrap se revisan aparte antes de habilitar.

El workflow comprueba archivos, scripts, tests y synth offline antes de autenticarse; revisa manifest y luego identidad exacta. El plan usa `cdk deploy --method prepare-change-set` con nombre SHA/run único. **Es una mutación futura:** puede publicar assets S3/ECR y crear changeset/stack preparatoria, aunque no ejecute infraestructura. No es una consulta read-only y no se ejecutó en esta auditoría. `--require-approval never` evita el prompt CLI; la revisión se aplica mediante el environment y el changeset.

No contiene execute-change-set, deploy directo, bootstrap, destroy, imports cloud existentes ni roles genéricos. Para ejecutar un changeset se necesita un paso de ejecución que vincule el ARN exacto a stack, SHA, assets y revisión. CDK `diff` por defecto también puede crear changesets; no usarlo como supuesto read-only durante auditorías.

## Merges y sincronización de dev

`.github/workflows/merge.yml`: dispatch desde main o dev, `MERGE_WORKFLOW_ENABLED=true`, environment `merge`, PR existente y SHA completo revisado. Verifica PR abierto/no draft, mismo repo, base main/dev y origen permitido; consulta checks requeridos y solicita el merge por API con `merge_method=merge` y `sha` exacto, sin --admin. GitHub aplica sus reglas al token de la App.

Obtiene token de la **GitHub App privada dedicada** `matigaleanodev-portfolio-merge` (5461240), instalada solo en este repo. Permisos: Contents/Pull requests/Workflows write; Checks/Metadata read. Las variables de repositorio MERGE_APP_ID y MERGE_WORKFLOW_ENABLED están configuradas. La clave está en MERGE_APP_PRIVATE_KEY del environment `merge`, limitado a ramas main/dev; su copia local queda fuera de Git con permisos privados. El ID de la App es el único bypass `pull_request` del ruleset de updates; PR/CI conserva cero bypass. [Reglas efectivas](branch-protection.es.md).

Para sincronizar main→dev sin violar el requisito de estar actualizado, crear una rama release/sync-main-to-dev desde dev, integrar main en esa rama de trabajo, abrir PR release/...→dev y pasarlo por este mismo workflow con su head revisado. Un PR directo main→dev puede quedar detrás de dev por sus merge commits propios. Aplicar el mismo criterio de rama basada en destino a otros cruces protegidos cuando corresponda. No hay push directo, force, PAT, merge automático al margen de los checks ni creación automática de PR mediante token. **dev no se declara espejo SHA exacto de main**: un merge commit puede darle historia propia; si se quiere espejo exacto se necesita un mecanismo compatible con esa política. No se configura `can_approve_pull_request_reviews`; la App no aprueba reviews.

## Pendientes operativos

El repositorio tiene dev como rama predeterminada; main todavía no existe. La App y el environment de merge están configurados y su alcance fue verificado. La primera ejecución se registra en el PR #2; la configuración por sí sola no demuestra un merge exitoso. Siguen pendientes el environment test-plan, la implementación npm/stack y los roles/bootstrap. El despliegue no se validó end-to-end. La integración inicial del PR #1 consumió la excepción temporal limitada a dev descrita en [protección de ramas](branch-protection.es.md).

Branches: solo feat/, fix/, release/; codex/ prohibido. main/dev se integran por PR fusionado desde workflow. Mantener ejecución serial, permisos por job y artifacts/versiones inmutables. Producción continúa fuera del alcance.

## Evidencia local separada

La comparación local ejecutó pruebas con mocks y ensayó una detección separada de aplicación/CDK. Esos cambios de workflow, scripts y paquetes no forman parte de estos commits documentales y se descartaron del checkout. El siguiente incremento debe adaptar expresamente la CI a la estructura inicial y evitar exigir una stack ficticia solo por incorporar package.json. [Estado y límites](local-runtime.es.md).

## Recuperación del primer merge con App

La [ejecución inicial](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40147675945) validó el PR y generó el token, pero `gh pr merge` se detuvo localmente al observar `mergeStateStatus=BLOCKED`, antes de pedir el merge al servidor. La corrección usa el endpoint de merge con SHA exacto y confirma `merged=true`. La [recuperación](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40147939891) integró el PR #2 con la App, conservando PR/CI. Usó una entrada temporal desde `feat/migration-evidence-docs`, ligada a su SHA exacto y al environment `merge`. Este cierre elimina esa condición; la variable de recuperación y el permiso de la rama en el environment ya fueron retirados. El flujo habitual vuelve a aceptar dispatch solo desde main/dev y el environment conserva únicamente esas ramas. No se retiró dev del bloqueo ni se cambió el ruleset de calidad.
