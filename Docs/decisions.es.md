# Registro de decisiones

[English](decisions.md) · 24/10/2026.

## Decisiones cerradas

- Migrar las tres APIs del servidor compartido a serverless. Este repositorio implementa solo la alternativa de Portfolio.
- Conservar las implementaciones NestJS originales como referencias técnicas y alternativas independientes.
- Mantener las tres APIs actuales operativas durante la migración completa. Al finalizar y verificar recuperación, apagar EC2 sin terminarla ni desmantelarla y conservar un backup recuperable.
- Conservar los seis contratos de Portfolio y su comportamiento, con URL o enrutamiento configurables sin reescribir el frontend.
- Mantener la entrega estática en portfolio y las responsabilidades actuales de portfolio-cloud.
- Construir la estructura inicial de esta API con handlers TypeScript. La comparación con Nest queda como evidencia técnica.
- Mantener main/dev protegidas: PR, CI y merge por workflow. La primera entrega está integrada en dev; main queda para una etapa posterior.
- Usar exclusivamente AWS personal, región us-east-1.

## ADR-001 — Infraestructura como código

Estado: **abierta; CDK TypeScript es la opción preferida**.

CDK permite definir infraestructura en TypeScript, revisar IAM y probar los recursos. SAM sigue siendo la alternativa más cercana por su continuidad con portfolio-cloud, que conserva su herramienta actual. Falta cerrar roles, boundaries, retención y bootstrap; la herramienta no decide el runtime. [Arquitectura](architecture.es.md).

## ADR-002 — Implementación con handlers TypeScript

Estado: **dirección definida para la estructura inicial**.

Handlers agrupados con composición explícita, preservando dominio, DTOs, validaciones, errores y límites. La API actual permanece independiente. El experimento local comparó esa composición con Nest adaptado, con proveedores simulados. Su función es documentar diferencias, no decidir si se migra. [Resultados](local-runtime.es.md).

Lambda Event Function con HTTP API, fuera de VPC, es la base de infraestructura propuesta. La separación del chat requiere una necesidad comprobada de contención o permisos. La publicación productiva requiere protecciones distribuidas y validación real del entorno.

## ADR-003 — Integración y entrega

Estado: **política definida; automatización estable pendiente**.

main y dev requieren PR, CI, conversaciones resueltas y protección contra borrado/force. Las ramas de trabajo usan feat/fix. El flujo estable de merge necesita la App dedicada. PR #1 quedó integrado en dev, el bloqueo de updates fue restaurado y la excepción inicial está consumida.

La CI versionada corresponde a la preparación documental y al contrato futuro de aplicación/CDK. Los cambios de CI probados localmente todavía no forman parte de esta entrega. [CI/CD](ci-cd.es.md) y [reglas](branch-protection.es.md).

## ADR-004 — Procedencia e intercambiabilidad por aplicación

Estado: **criterio definido; evidencia local registrada**.

La comparación reutilizó portfolio-api@a0ef80fa9f82d1cea5a31425a63ab0a344338c56 con hashes por archivo, sin modificar su working tree. [Procedencia](runtime-evidence.es.md).

La intercambiabilidad significa sustituir la implementación de esta misma API conservando HTTP y comportamiento. URL o enrutamiento pueden requerir configuración. No significa intercambiar dominios entre APIs diferentes, crear una plataforma genérica ni garantizar paridad multicloud.

## ADR-005 — Conocimiento del bot antes de producción

Estado: **orden de entrega definido; actualización pendiente**.

La renovación de los datos del bot sobre el perfil profesional y los proyectos es el último paso previo al despliegue productivo. Incluye fuentes editoriales y curadas, prompts o FAQs que dependan de esos hechos, artifact publicado y fallback empaquetado. Debe verificarse procedencia, integridad, fechas, enlaces y respuestas representativas, conservando la versión anterior recuperable. Las comprobaciones del paquete final son parte de este mismo paso; después sigue la puesta en producción. [Secuencia](migration.es.md).

## Decisiones operativas abiertas

Presupuesto y cuota diaria de IA; umbrales de latencia y costo; edad máxima stale y retención del proveedor; aislamiento de test; roles/bootstrap; retención de artefactos; URL/routing y runbook de corte. La factura y los planes privados no están verificados. Los escenarios públicos son hipotéticos.
