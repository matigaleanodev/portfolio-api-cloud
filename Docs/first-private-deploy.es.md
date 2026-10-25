# Primer deploy privado comprobado

[English](first-private-deploy.md) · 2026-10-25.

La stack portfolio-api-cloud-test quedó CREATE_COMPLETE el 25/10/2026 en us-east-1. Una Lambda usa Secrets Manager y DynamoDB reales; contacto, suscripciones e IA usan proveedores simulados. El acceso de negocio exige SigV4/IAM.

La comprobación HTTP secuencial verificó los seis contratos, rechazo anónimo y de la identidad Observer (403), y cuota compartida de contacto: cinco respuestas 204 con saldo 4→0; la sexta devuelve 429 con Retry-After. El código de Lambda coincide con el SHA256 del ZIP revisado en S3. La CI integrada aprobó las 617 pruebas.

| Método y ruta             | Resultado               |
| ------------------------- | ----------------------- |
| GET /api/health           | 200                     |
| POST /api/contact         | 204                     |
| POST /api/subscriptions   | 200                     |
| DELETE /api/subscriptions | 200                     |
| GET /api/chat/starters    | 200                     |
| POST /api/chat            | 201, source=ai simulado |

## Procedencia y ejecución

[CI](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40238188400) · [plan](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40239897203) · [execute](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40240008983) · [foundation UPDATE](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40239753311)

- Revisión del artifact: `2790d385da9aaeb8477d1d8e448e53d0a5fe9c1b`.
- Revisión del workflow: `5e56b48741ce571808b9c916cb56c27fd536caca`.
- Artifact: `12615778214`; digest `sha256:6c6e7e5a08e9c73cd1c0e8d9d2db6bacb7ae2c91516886742208324341f747b8`.
- Recibo: `sha256:c6bfd903bae0e36635750d3e961aa924cd11e3cffd5b0f3e31785d53a3350ea7`.
- Lambda ZIP SHA256: `072ad2e1a201cd9716ff426c3469cc071d5eb851955de1acef410f596fecce89`.

No se ejecutó la matriz completa de fallos, carga ni recuperación; no se comprobaron proveedores externos reales. Hubo cero llamadas IA pagas y ningún envío real. La API original, EC2, DNS/Cloudflare y el tráfico de producción conservan su configuración. v0.1.0 conserva su revisión original. Los cuatro flags de despliegue quedaron false.

La variante simulada no reserva concurrencia: la cuota regional comprobada es 10 y Lambda exige dejar 100 ejecuciones sin reservar para configurar una reserva. El gateway conserva rate 2/s y burst 5; la configuración normal conserva reserva 5 y necesita una cuota compatible. Antes de producción quedan proveedores reales, contenido editorial, matriz de operación y revisión del permiso regional de bootstrap para reducirlo al ID creado.
