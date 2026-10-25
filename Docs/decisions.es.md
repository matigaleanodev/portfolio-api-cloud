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

Estado: **política definida; merge con App validado en PR #2 y #3**.

main y dev requieren PR, CI, conversaciones resueltas y protección contra borrado/force. Las ramas de trabajo usan feat/fix. La configuración actual integra con identidad real de matigaleanodev; la transición de la App se instaló por PR #5 sin quitar PR/CI. [Integración](integration.es.md). PR #1 quedó integrado en dev, el bloqueo de updates fue restaurado y la excepción inicial está consumida.

La CI separa documentación, aplicación e infraestructura; verify sigue siendo obligatorio. La aplicación se prueba en Node 24.22.1 LTS y no exige stack ficticia. Estos cambios tienen validación local y CI aprobada en el PR #4; cada head posterior requiere su nueva validación. [CI/CD](ci-cd.es.md) y [reglas](branch-protection.es.md).

## ADR-004 — Procedencia e intercambiabilidad por aplicación

Estado: **criterio definido; evidencia local registrada**.

La comparación reutilizó portfolio-api@a0ef80fa9f82d1cea5a31425a63ab0a344338c56 con hashes por archivo, sin modificar su working tree. [Procedencia](runtime-evidence.es.md).

La intercambiabilidad significa sustituir la implementación de esta misma API conservando HTTP y comportamiento. URL o enrutamiento pueden requerir configuración. No significa intercambiar dominios entre APIs diferentes, crear una plataforma genérica ni garantizar paridad multicloud.

## ADR-005 — Conocimiento del bot antes de producción

Estado: **orden de entrega definido; actualización pendiente**.

La renovación de los datos del bot sobre el perfil profesional y los proyectos es el último paso previo al despliegue productivo. Incluye fuentes editoriales y curadas, prompts o FAQs que dependan de esos hechos, artifact publicado y fallback empaquetado. Debe verificarse procedencia, integridad, fechas, enlaces y respuestas representativas, conservando la versión anterior recuperable. Las comprobaciones del paquete final son parte de este mismo paso; después sigue la puesta en producción. [Secuencia](migration.es.md).

## Decisiones operativas abiertas

Presupuesto y cuota diaria de IA; umbrales de latencia y costo; edad máxima stale y retención del proveedor; aislamiento de test; roles/bootstrap; retención de artefactos; URL/routing y runbook de corte. La factura y los planes privados no están verificados. Los escenarios públicos son hipotéticos.

## ADR-006 — Base local y validación independiente

Estado: **implementada localmente; cobertura parcial**.

Cuatro módulos de runtime, composición explícita, configuración CORS aislada y health sin proveedores. Node 24.22.1 LTS como objetivo, comprobado mediante ejecución aislada. TypeScript estricto, compilador JS 6.0.3, runner nativo y cero dependencias de runtime: no hay necesidad de framework, bundler o SDK para esta sección.

La CI separa aplicación de CDK y conserva verify como check agregado obligatorio. Una stack ausente omite únicamente infraestructura; no permite omitir tipos/build/tests de una aplicación presente. La nueva base no usa código del prototipo descartado. [Implementación, límites y procedencia](application.es.md).

## ADR-007 — Identidad real de la integración

Estado: **política implementada; mecanismo activado**.

Los nuevos merges automatizados deben atribuirse a matigaleanodev mediante una credencial de usuario, validando login/ID/tipo y merged_by. El token de instalación atribuye la operación a la App y no satisface esta política. Se conserva PR, CI, SHA revisado y workflow; no hay fallback a bot ni cambios cosméticos de metadatos.

La transición se instaló por PR #5 con una última integración de la App y luego se reemplazó únicamente el actor de updates por User 99203645, solo vía PR. PR/CI conserva cero bypass y el environment sigue limitado a main/dev. La cuenta también puede integrar desde la UI; la política operativa mantiene workflow obligatorio. [Estado, alternativas y límites](integration.es.md).
