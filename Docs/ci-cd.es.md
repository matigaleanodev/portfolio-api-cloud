# CI/CD preparado

[English](ci-cd.md) · 24/10/2026. Los workflows cubren validación documental, preparación de test e integración de ramas. La API y el stack todavía no están implementados.

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

`.github/workflows/merge.yml`: dispatch desde main o dev, `MERGE_WORKFLOW_ENABLED=true`, environment `merge`, PR existente y SHA completo revisado. Verifica PR abierto/no draft, mismo repo, base main/dev y origen permitido; consulta checks requeridos y usa `--match-head-commit`, sin --admin.

Obtiene token de una **GitHub App dedicada**, no el GITHUB_TOKEN integrado ni un PAT humano. Variables pendientes MERGE_APP_ID y secret MERGE_APP_PRIVATE_KEY; solo son referencias, no se crearon ni leyeron valores. La App debe estar instalada exclusivamente en el repo con Contents/Pull requests write, Checks read y Metadata read; además Workflows write para PRs que modifiquen .github/workflows. Su ID irá como única excepción `pull_request` en el ruleset de actualizaciones; el ruleset de PR/CI permanece sin bypass. [Estado real y limitación](branch-protection.es.md).

Para sincronizar main→dev sin violar el requisito de estar actualizado, crear una rama release/sync-main-to-dev desde dev, integrar main en esa rama de trabajo, abrir PR release/...→dev y pasarlo por este mismo workflow con su head revisado. Un PR directo main→dev puede quedar detrás de dev por sus merge commits propios. Aplicar el mismo criterio de rama basada en destino a otros cruces protegidos cuando corresponda. No hay push directo, force, PAT, merge automático al margen de los checks ni creación automática de PR mediante token. **dev no se declara espejo SHA exacto de main**: un merge commit puede darle historia propia; si se quiere espejo exacto se necesita un mecanismo compatible con esa política. No se configura `can_approve_pull_request_reviews`; la App no aprueba reviews.

## Pendientes operativos

El repositorio tiene dev como rama predeterminada; main todavía no existe. Faltan la App dedicada, environments y políticas, implementación npm/stack y roles/bootstrap. Los flujos de merge con App y despliegue no se validaron end-to-end. La variable de habilitación por sí sola no permite merges: el ruleset de updates sigue bloqueado. La integración inicial del PR #1 utiliza la excepción temporal limitada a dev descrita en [protección de ramas](branch-protection.es.md).

Branches: solo feat/, fix/, release/; codex/ prohibido. main/dev se integran por PR fusionado desde workflow. Mantener ejecución serial, permisos por job y artifacts/versiones inmutables. Producción continúa fuera del alcance.
