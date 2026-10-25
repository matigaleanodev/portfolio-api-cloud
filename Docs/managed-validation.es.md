# Primera instalación con proveedores simulados

[English](managed-validation.md) · 25/10/2026.

## Estado comprobado

La primera instalación privada quedó desplegada y pasó una comprobación corta de los seis contratos, IAM y cuota compartida. [Resultado, procedencia y límites](first-private-deploy.es.md). Los environments de entrega restringen branch main y los cuatro flags quedaron false.

main/dev/remoto coincidían en 6f993417a0a9785b7ee3dbf120a9493a99e23c22 al iniciar. La release v0.1.0 conserva su assembly original. El asset desplegado usa otro paquete y artifact de CI integrada, revisados y promovidos a main. No se identifica como el assembly de v0.1.0 ni se mueve el tag.

## Runtime y paquetes

src/validation/handler.ts reutiliza createManagedHandler; Secrets Manager y DynamoDB mantienen sus clientes reales. Solo contacto, suscripciones y conteo/generación IA usan funciones simuladas. Contacto tiene SendEmail inyectable; el handler normal conserva Resend. No hay fallback de los dobles a fetch, Resend ni R2. Se usa el fallback editorial versionado sin renovar su fecha.

El entrypoint exige función portfolio-api-cloud-test, región us-east-1, tabla portfolio-api-cloud-test-control, API configurada y secreto del prefijo test en la cuenta prevista. Antes de cada request de negocio comprueba el snapshot validado, incluidas sus renovaciones: claves RESEND_API_KEY y OPENAI_API_KEY exactamente validation-only, correos y URL HTTPS en .invalid y ninguna clave R2. El secreto de derivación es estable y privado. El workflow de configuración genera un valor aleatorio y usa únicamente credenciales ficticias; su importe de admisión es sintético, separado del presupuesto real.

El build normal excluye src/validation. tsconfig.validation.json compila la variante separada; stageRuntimePackage fija validation.json en la raíz. El handler exige versión 1 y uno de success, error, pending-body o ambiguous. El escenario pertenece a los bytes revisados: headers, query y sessionId no lo cambian. pending-body mantiene pendiente la lectura del cuerpo; ambiguous permite reservar IA antes de simular el resultado desconocido, sin liberar la reserva ni repetir el efecto.

CDK selecciona la variante mediante --context validationScenario=success, con el mismo nombre de stack, función, tabla e IAM. No crea una instalación adicional. La CI sigue sin credenciales AWS y genera test-assembly con esa variante success. Los otros escenarios requieren otra síntesis/artifact revisados; no se activan remotamente desde HTTP. Sin contexto, synth conserva el paquete normal. La preparación inicial rechaza un handler normal recuperado.

Ambos paquetes se prueban fuera del checkout, con red bloqueada. El smoke de validación importa su entrypoint real y simula send de los SDK únicamente dentro de la prueba; la Lambda desplegada no contiene esos mocks de almacenamiento. La suite cubre las seis rutas, configuración inválida/renovada, error, cancelación y reserva ambigua. Estos resultados no demuestran SigV4, permisos ni concurrencia de DynamoDB administrado.

## Circuito por GitHub Actions

Todos los despliegues de infraestructura y aplicación pasan por dispatch manual desde main. Los workflows comparten portfolio-api-cloud-test-mutation, no cancelan ejecuciones activas y verifican cuenta/rol antes de la mutación. Cada environment debe permitir únicamente main. La activación requiere su variable explícita; se conservan deshabilitados mientras falten prerrequisitos.

| Workflow              | Control y operación preparada                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| validation-secret.yml | TEST_SECRET_ENABLED, test-foundation-plan: crea una vez portfolio-api-cloud/test/validation, sin recuperar valores ni reemplazar una clave existente                |
| foundation-test.yml   | TEST_FOUNDATION_ENABLED, test-foundation-plan: verifica SHA256 del template, ARN de secreto y CREATE/UPDATE, y prepara la fundación sin ejecutarla                  |
| deploy-test.yml       | TEST_PLAN_ENABLED, test-plan: recupera CI por run/ID/SHA/digest, exige promoción a main, verifica paquete/roles y publica assets/prepara aplicación sin recompilar  |
| execute-test.yml      | TEST_EXECUTE_ENABLED, test-execute: recibe clase de destino, StackId, ChangeSetId y digest del recibo revisado; restringe la sesión y ejecuta ese changeset una vez |

La fundación fija AllowRegionalApiBootstrap=true y TestApiId=unassigned para la primera creación, conforme al alcance regional elegido. Ese permiso puede afectar otras APIs de la región; el template revisado no las modifica. Registrar el ID nuevo y evaluar luego su reducción, conservando una sola instalación. RuntimeSecretArn sigue siendo una referencia, nunca un valor en Git o artifact.

Después de preparar, review_changeset.py obtiene DescribeChangeSet, GetTemplate y DescribeStacks. Exige CREATE_COMPLETE/AVAILABLE, ARN/nombre/rol exactos, cambios no vacíos, sin importación, jerarquías ni notificaciones; bloquea eliminación o reemplazo incluso condicional de la tabla. Contrasta el template vivo con la fuente revisada y los archivos del ZIP S3 con el asset recuperado. El recibo conserva cambios/parámetros visibles, hash canónico del template, rol, versión S3 y SHA256 de bytes. No lee secretos ni logs de negocio.

La ejecución vuelve a calcular el recibo vivo y exige igualdad con el digest revisado. Su policy de sesión limita ExecuteChangeSet al ARN exacto de stack y cloudformation:ChangeSetName exacto; no concede preparación ni PassRole. La identidad base tiene exclusivamente lectura de esas stacks/assets y ejecución, separada de la preparación. Se usa un token de idempotencia, se espera CREATE_COMPLETE/UPDATE_COMPLETE y se conserva el resultado. El éxito de CloudFormation deja pendiente validar los seis contratos y la readiness. [Permisos de CloudFormation](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cloudformation.html), [ejecución e idempotencia](https://docs.aws.amazon.com/cli/latest/reference/cloudformation/execute-change-set.html).

## Arranque de la confianza

infra/delivery-access.template.json materializa tres roles externos y tres boundaries equivalentes a sus policies:

| Rol                                               | Confianza y techo                                                                                                                                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PortfolioApiCloudTestFoundationPlanRole           | OIDC del repo/environment test-foundation-plan; preparación de la stack foundation, PassRole solo a su ejecutor y CreateSecret solo para la configuración validation |
| PortfolioApiCloudTestFoundationCloudFormationRole | servicio CloudFormation; bucket/SSM dedicados, cuatro roles y cinco policies exactos de test-foundation.template.json; CreateRole exige la boundary correspondiente  |
| PortfolioApiCloudTestGitHubExecuteRole            | OIDC del repo/environment test-execute; lectura/ejecución de las dos stacks previstas y lectura del bucket; cada sesión reduce a los ARN observados                  |

La fundación no puede administrar estas identidades de arranque. Ninguna usa AdministratorAccess, credenciales permanentes ni acceso administrativo genérico. El runtime continúa en la stack CDK. Las tres policies de acceso pasaron Access Analyzer sin hallazgos en la revisión inicial. La fundación actual registra dos W3037 de cfn-lint 1.57.2 sobre el permiso de etiquetado exigido por ApiGatewayV2; el resto del lint no tiene hallazgos. La comprobación de estos validadores no sustituye la ejecución administrada.

El acceso inicial quedó instalado con una identidad administrativa SSO verificada. La fundación y la aplicación se prepararon y ejecutaron por Actions con changesets revisados. Los subjects OIDC usan los IDs inmutables efectivos del repositorio y propietario, y environments restringidos a main. El arranque administrativo no reemplaza el circuito de despliegue ordinario.

## Plan de la primera ejecución (histórico)

1. Identificar el workflow/identidad inicial que pueda provisionar el template de acceso por Actions, revisar su policy efectiva y el changeset exacto antes de ejecutarlo. Sin ese origen confiable no comienza el provisioning.
2. Integrar la revisión nueva con CI aprobada y promoverla a main; configurar test-foundation-plan, test-plan y test-execute con restricción main y revisores viables. Conservar SHA/digest/run/artifact y SHA del workflow por separado.
3. Crear únicamente el secreto ficticio mediante validation-secret.yml. Conservar el ARN devuelto y la clave de derivación; una segunda ejecución falla en vez de sobrescribirla. La renovación futura de tarifas ficticias requiere un cambio revisado que preserve esa clave.
4. Preparar foundation con el digest del template, RuntimeSecretArn observado, CREATE, AllowRegionalApiBootstrap=true y TestApiId=unassigned. Cambios esperados: bucket versionado/cifrado/TLS, versión SSM 6, cuatro roles y cinco boundaries. Revisar recibo y ejecutar por separado.
5. Preparar aplicación con el nuevo artifact success de CI y las variables de roles previstas. Cambios esperados: una Lambda ARM64 Node24/512 MiB/28 s/sin reserva en la variante simulada, HTTP API IAM/stage, tabla de control retenida, logs de 14 días, rol/policy de runtime y tres alarmas sin acciones. El secreto y la tabla no son datos de aplicación.
6. Revisar el recibo y los ARN exactos; ejecutar con la identidad separada. Después comprobar gateway/IAM, seis contratos simulados, cuotas/reservas compartidas, privacidad y recuperación según la matriz de test-operations. Health solo prueba liveness.

El recorrido inicial se completó con el artifact y changeset registrados en el resultado del primer deploy privado. Las referencias del plan describen el diseño previo; la matriz exhaustiva de fallos/carga/recuperación permanece pendiente antes de producción.
