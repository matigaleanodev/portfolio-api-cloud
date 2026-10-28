# Operación y recuperación

[English](operations.md)

CDK admite `stage=production` en `us-east-1`. Los nombres físicos `portfolio-api-cloud-test` y `PortfolioApiCloudTest*` identifican la instalación única y se conservan para evitar recreaciones. Templates y políticas están en [infra/](../infra).

## Configuración

Lambda exporta `dist/handler.handler` y recibe `CORS_ORIGIN`, `TRUSTED_API_ID`, `TRUSTED_CUSTOM_DOMAIN`, `QUOTA_TABLE_NAME` y `RUNTIME_SECRET_ARN`. No carga `.env`.

El secreto JSON agrupa contacto (`RESEND_API_KEY`, `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL`), suscripciones (`PORTFOLIO_CLOUD_API_URL` HTTPS), derivación (`QUOTA_KEY_SECRET`, mínimo 32 caracteres) y origen (`ORIGIN_VERIFY_SECRET`). R2 exige endpoint HTTPS, bucket, access key y secret key completos. IA usa `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`, `AI_DAILY_BUDGET_MICROUSD` y `AI_PRICING_VALID_UNTIL`.

La configuración común se valida y cachea hasta cinco minutos; una renovación fallida no reutiliza el snapshot vencido. IA inválida o vencida deshabilita solo generación paga. Mantener estable `QUOTA_KEY_SECRET` durante ventanas activas y preservar contadores/reservas al renovar configuración.

## Entrega protegida

1. Integrar por PR hacia `dev` y promover a `main` con CI aprobada. `verify` es obligatorio; [merge.yml](../.github/workflows/merge.yml) exige SHA completo revisado e identidad real de `matigaleanodev`. Usa `MERGE_USER_TOKEN` del environment `merge`, sin fallback a App ni bypass de PR/CI.
2. Seleccionar `api-assembly-<sha>-<run>-<attempt>` de CI por push aprobada y revisión promovida a main. Contrastar run, ID, digest e inventario. La retención es 30 días; conservar copia verificada para recuperación posterior.
3. [plan-production.yml](../.github/workflows/plan-production.yml) prepara el changeset desde ese assembly, sin recompilar runtime. [plan-foundation-production.yml](../.github/workflows/plan-foundation-production.yml) prepara fundación y roles/boundaries por separado.
4. Revisar template, assets y recibo. **build and deploy**, [build-and-deploy.yml](../.github/workflows/build-and-deploy.yml), vuelve a verificarlos y ejecuta solo StackId/ChangeSetId y digest revisados.

Los environments productivos admiten main; los flags `PRODUCTION_*_ENABLED` permanecen desactivados fuera de su operación. OIDC restringe propietario, repo y environment. Planificación, publicación, ejecución CloudFormation y runtime usan roles separados. Push y tags no despliegan automáticamente.

`recover_bundle.py` valida artifacts actuales y `test-assembly-*` históricos sin relajar hashes ni extracción segura. `validation-secret.yml` solo crea configuración ficticia; los proveedores simulados tienen paquete separado.

## Entrada y observabilidad

El dominio usa ACM regional y Cloudflare con TLS estricto. Una regla exclusiva del hostname sobrescribe `x-portfolio-origin`; el handler valida secreto y rangos Cloudflare antes de aceptar `CF-Connecting-IP`. `DisableDefaultEndpoint` permite cerrar execute-api después de comprobar el dominio; `PublicAccess` controla IAM o acceso anónimo.

API Gateway limita rate/burst; DynamoDB mantiene cuotas y reservas. Lambda no reserva concurrencia. Logs JSON retienen 14 días y omiten cuerpos, prompts, emails, IP, sesión y secretos. Cuatro alarmas cubren errores Lambda, throttles, duración y HTTP 5xx controlados. `AlarmTopicArn` conecta SNS; comprobar también confirmación de suscripción y entrega del aviso.

## Mantenimiento y recuperación

- Antes de `AI_PRICING_VALID_UNTIL`, revisar [tarifas oficiales](https://developers.openai.com/api/docs/pricing) y límites del único modelo. Si cambian, actualizar reserva conservadora en `shared-control.ts`, pruebas y artifact; después renovar vigencia en Secrets Manager hasta 31 días. No extender fecha sin revisar precios.
- Renovar fallback desde el artifact editorial de `portfolio-cloud`, validando esquema, checksum y edad máxima de 30 días. Reemplazar por PR/CI sin fabricar una fecha nueva sobre contenido viejo. Caché y stale respetan esa edad.
- Revisar [rangos Cloudflare](https://www.cloudflare.com/ips/), permisos y dependencias. Manifiesto/lock y código son la referencia de versiones.

Para recuperar tráfico, conservar URL del frontend y restaurar el CNAME proxied al túnel anterior conservado. Verificar destino y disponibilidad antes de operar; comprobar health con Origin/User-Agent del frontend y contratos afectados.

Para código o infraestructura, recuperar el assembly revisado con inventario y preparar otro changeset por el mismo circuito. No recompilar una revisión antigua ni tratar rollback CloudFormation como restauración de datos. Conservar tabla, reservas y secretos; no reiniciar presupuesto para recuperar servicio.

La API NestJS y EC2 son alternativas independientes. Su retiro requiere migrar las otras aplicaciones y verificar recuperación, conservando instancia y backup recuperable. El presupuesto IA no limita otras aplicaciones, infraestructura, impuestos ni factura completa.
