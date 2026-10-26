# Stack de test en código

[English](infrastructure.md) · 24/10/2026.

**Incremento vigente:** [primera instalación con dobles y circuito Actions](managed-validation.es.md), desplegada y comprobada en AWS con proveedores simulados. [Resultado del primer deploy privado](first-private-deploy.es.md). Las secciones de diseño y auditoría conservan su contexto previo.

**Estado vigente de fase 4:** [controles del runtime](runtime-hardening.es.md), implementados y probados localmente: cuota compartida, presupuesto GLOBAL de IA, sesión/origen, cancelación, fallback versionado, configuración y observabilidad. Las referencias al traslado inicial conservan su evidencia histórica; no implican validación AWS.

AWS CDK v2 queda elegido para este repositorio. Dependencias locales de desarrollo fijadas: CLI **2.1146.1**, aws-cdk-lib **2.274.0**, constructs **10.8.1**. No se requiere instalación global. [Código](../infra/stack.ts), [entrada](../infra/app.ts) y [pruebas](../test/infra/stack.test.ts).

## Recursos definidos

Stack `PortfolioApiCloudTest`, nombre físico `portfolio-api-cloud-test`, cuenta personal `650387442642`, región `us-east-1`; se rechaza un contexto stage diferente de test.

- Una Lambda Event Function Node.js 24, ARM64, 512 MiB, 28 segundos y concurrencia reservada 5, fuera de VPC. Handler `dist/handler.handler`.
- HTTP API v2 con integración AWS_PROXY, payload 2.0 y timeout de 29 segundos; stage `$default` para no introducir un prefijo en rawPath. Rate global 2/s, burst 5, sujeto a validación real.
- `$default` exige firma IAM (SigV4) y delega las rutas al handler para conservar mayúsculas y errores. Solo `OPTIONS /{proxy+}` permite acceso anónimo para preflight. CORS sigue en la aplicación; gateway no lo duplica. No hay Function URL paralela.
- Log group propio, retención de 14 días y conservación al borrar/reemplazar la stack. El rol runtime acota escritura de logs, operaciones de control sobre su tabla y lectura del ARN de secreto; exige una permissions boundary externa.
- `NODE_ENV=production` evita logs detallados del SDK Resend. El parámetro no secreto `CorsOrigin` queda vacío por defecto.

IAM es aislamiento de esta API de test; todavía no es el contrato público del frontend. Health también requiere firma. La implementación local de cuota/deadline no habilita negocio público antes de su validación administrada. Los límites de gateway/concurrencia no reemplazan cuota por IP ni son un tope monetario.

La stack define una tabla DynamoDB de control on-demand con TTL y protección de borrado; no una DB de aplicación. Agrega lectura de un secreto externo por ARN y tres alarmas sin acciones. No agrega NAT, VPC, dominio ni frontend. El handler sin configuración de negocio válida devuelve 503 y el asset incluye fallback curado real versionado. [Controles y prerrequisitos](runtime-hardening.es.md).

## Paquete y síntesis local

```bash
npm ci --ignore-scripts
npm run test:infra
npm run cdk -- synth --no-lookups --context stage=production
```

`prepare-infra.mjs` compila y prepara `.tmp/lambda` con dist, package.json, LICENSE y dependencias de producción del lock. Es la misma función de empaquetado que verifica `test:package`. Excluye fuentes, tests, `.env`, archivos privados y herramientas CDK/Vitest. Conserva las licencias incluidas en cada dependencia. CDK registra un asset ZIP; `cdk.out` contiene template, manifest y copia local del asset. No se publica S3 ni se crea un change set con synth.

El typecheck de aplicación conserva `exactOptionalPropertyTypes`; `tsconfig.infra.json` lo desactiva solo para infraestructura y sus tests porque las declaraciones CDK de esta versión no son compatibles con esa opción. Ambos conservan strict, noUncheckedIndexedAccess y verificación de declaraciones, sin skipLibCheck.

## Requisitos antes de preparar AWS

El synthesizer usa qualifier `papiatest`, bucket esperado `cdk-papiatest-assets-650387442642-us-east-1` y parámetro de versión `/cdk-bootstrap/papiatest/version`. Esos recursos y roles se referencian; esta entrega no comprueba ni crea su existencia.

| Responsabilidad           | Rol esperado                                             |
| ------------------------- | -------------------------------------------------------- |
| Entrada GitHub OIDC       | PortfolioApiCloudTestGitHubDeployRole                    |
| Operaciones de deploy CDK | PortfolioApiCloudTestCdkDeployRole                       |
| Ejecución CloudFormation  | PortfolioApiCloudTestCloudFormationExecutionRole         |
| Publicación de archivos   | PortfolioApiCloudTestFilePublishingRole                  |
| Ejecución Lambda          | PortfolioApiCloudTestRuntimeRole (definido por la stack) |

La boundary obligatoria es `arn:aws:iam::650387442642:policy/PortfolioApiCloudTestRuntimeBoundary`, recibida en `RuntimePermissionsBoundaryArn` sin default. Revisar su contenido y permisos/trust/PassRole/bootstrap antes de cualquier ejecución. No usar el bootstrap por defecto con AdministratorAccess. No se necesita rol de publicación Docker para este asset.

El workflow de preparación permanece manual, con environment y activación explícita. El comando proporciona el ARN de boundary esperado; antes de habilitarlo se debe revisar/provisionar esa política, el bootstrap y los roles; no se ejecutó. [CI/CD](ci-cd.es.md). La síntesis y 18 assertions no demuestran permisos efectivos, ausencia de drift ni funcionamiento del servicio desplegado.

RuntimeSecretArn es obligatorio, sin default, y restringido al secreto portfolio-api-cloud/test/ en la cuenta/región fijadas. La política runtime suma únicamente GetItem/PutItem/UpdateItem sobre su tabla y GetSecretValue sobre ese ARN. Ni la boundary ni el secreto se crean en la stack; sus permisos efectivos deben revisarse antes de preparar un changeset.

## Cierre local de etapa 5

Tabla con nombre portfolio-api-cloud-test-control y alarmas portfolio-api-cloud-test-errors/throttles/duration para acotar el diseño IAM. Las 18 assertions cubren recursos, trust runtime exacto, acciones permitidas, alcance de invocación y ausencia de recursos adicionales. [Diseño externo de roles/bootstrap y conservación](deployment-design.es.md). No se provisionan roles externos ni se comprueban permisos efectivos.

## Preparación de test

[Auditoría, fundación externa revisable y runbook de etapas 6–10](test-operations.es.md). Roles/bootstrap/secreto, despliegue, validación y recuperación administrada siguen sin ejecutarse.

Una sola instalación AWS conserva los nombres test existentes y se valida inicialmente con proveedores simulados; no se agrega una stack productiva paralela ni emulación local de AWS. El alcance regional API Gateway está elegido para la cuenta personal, con su efecto sobre APIs existentes explícito en [operación](test-operations.es.md). main y v0.1.0 no ejecutan el despliegue automáticamente.
