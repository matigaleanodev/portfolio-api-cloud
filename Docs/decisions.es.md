# Decisiones y propuestas

[English](decisions.md) · 24/10/2026.

## Confirmado por el usuario

- Migrar toda la API con respaldo en la implementación original; orden Portfolio→Foodly Notes→Modo Playa.
- Conservar responsabilidades de portfolio-cloud y frontend estático.
- Crear ahora portfolio-api-cloud **público**, con documentación y workflows locales y protección GitHub de main/dev.
- Publicar la preparación en commits pequeños y avanzar solo a dev; main queda fuera. No autorizar todavía código de aplicación, recursos AWS, bootstrap CDK, deploy ni corte.
- Solo cuenta personal, Observer para inspección; no credenciales/arquetipo privado de Comafi.
- Aceptar 1–2 meses de convivencia; no apagar EC2 hasta migrar las otras apps y estabilizar.

## ADR-001 — Herramienta de infraestructura

Estado: **propuesta**. CDK v2 TypeScript recomendado por experiencia diaria del mantenedor, control IAM y pruebas de infraestructura. SAM finalista por continuidad con portfolio-cloud. La experiencia en el trabajo es contexto del usuario, no autoridad para copiar código ni acceder a cuentas laborales. No migrar SAM existente. [Comparación](architecture.es.md).

## ADR-002 — Unidad de ejecución

Estado: **propuesta condicionada**. Comparar NestJS adaptado con handlers livianos antes de elegir runtime; CDK no reemplaza Nest. Event Function + HTTP API, sin VPC y con cuotas distribuidas es la infraestructura candidata común. Ver [evaluación](runtime-evaluation.es.md). Dividir chat solo ante contención medible. Comparar Lambda Web Functions nativas antes de cerrar implementación si su soporte/costo resulta favorable. [Riesgos](audit.es.md).

## ADR-003 — Publicación y workflows

Estado: **preparación y protección GitHub autorizadas, activación de workflows pendiente**. GitHub se creó vacío. La publicación de la preparación y su integración solo a dev se autorizaron después, conservando los bloqueos de merges hasta resolver la App y el bootstrap Git. CI distingue documentación de aplicación inexistente. Deploy manual solo prepara cambios de test tras opt-in y environment; no ejecuta changeset, no produce despliegue y no tiene camino prod. main/dev solo reciben PRs fusionados por workflow de App dedicada, sin PAT/force. Los rulesets ya están activos y el lock actual no tiene bypass: merges bloqueados hasta instalar la App. dev no se promete espejo exacto. Ramas de trabajo solo feat/fix/release; codex prohibido. Publicar no equivale a autorizar bootstrap ni activar mutaciones. [CI/CD](ci-cd.es.md).

## Pendientes que condicionan implementación/producción

Aprobar recomendaciones, escoger límites diarios/budget y latencia aceptable, definir edad máxima stale, aislar datos/proveedores test, revisar IAM/bootstrap/CDK seleccionado, elegir mecanismo de dominio y ensayar rollback. Faltan costos y tráfico reales; las estimaciones no se convierten en presupuesto por estar documentadas. Los dos repos antiguos de runtime y automatización permanecen operativos y sin cambios.
