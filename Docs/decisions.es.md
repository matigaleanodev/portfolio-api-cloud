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

Estado: **cerrada; AWS CDK v2 TypeScript, con stack local implementada**.

CDK permite definir infraestructura en TypeScript, revisar IAM y probar los recursos. SAM sigue siendo la alternativa más cercana por su continuidad con portfolio-cloud, que conserva su herramienta actual. La definición local fija retención, boundary y roles separados; la provisión/revisión efectiva de roles y bootstrap sigue pendiente. La herramienta no decide el runtime. [Arquitectura](architecture.es.md).

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

La sección inicial de health tuvo cuatro módulos de runtime, composición explícita, configuración CORS aislada y health sin proveedores. Node 24.22.1 LTS como objetivo, comprobado mediante ejecución aislada. TypeScript estricto, compilador JS 6.0.3, runner nativo y cero dependencias de runtime: no hubo necesidad de framework, bundler o SDK para esa sección. El incremento de contacto incorpora las dependencias de aplicación documentadas en ADR-008 y ADR-010.

La CI separa aplicación de CDK y conserva verify como check agregado obligatorio. Una stack ausente omite únicamente infraestructura; no permite omitir tipos/build/tests de una aplicación presente. La nueva base no usa código del prototipo descartado. [Implementación, límites y procedencia](application.es.md).

## ADR-007 — Identidad real de la integración

Estado: **política implementada; mecanismo activado**.

Los nuevos merges automatizados deben atribuirse a matigaleanodev mediante una credencial de usuario, validando login/ID/tipo y merged_by. El token de instalación atribuye la operación a la App y no satisface esta política. Se conserva PR, CI, SHA revisado y workflow; no hay fallback a bot ni cambios cosméticos de metadatos.

La transición se instaló por PR #5 con una última integración de la App y luego se reemplazó únicamente el actor de updates por User 99203645, solo vía PR. PR/CI conserva cero bypass y el environment sigue limitado a main/dev. La cuenta también puede integrar desde la UI; la política operativa mantiene workflow obligatorio. [Estado, alternativas y límites](integration.es.md).

## ADR-008 — Contacto con dependencias públicas

Estado: **sección local implementada; endurecimiento pendiente**.

Contacto conserva DTO, texto, fecha y honeypot del código propio auditado, con composición explícita. body-parser, class-validator y class-transformer se usan como dependencias. Los validadores se invocan directamente; no se copia ValidationPipe ni sus helpers. Dos arrays cambian de mensaje y prototype pasa de eliminación silenciosa a rechazo: diferencias explícitas y probadas. Resend se utiliza mediante su SDK oficial con transporte simulado en pruebas, sin mantener una implementación del SDK.

## ADR-009 — MIT propia, sin archivo de atribuciones

Estado: **implementada; reemplaza la consolidación inicial de avisos**.

LICENSE contiene el texto MIT y únicamente la autoría de Matias Galeano. Las adaptaciones del código de Throttler, helpers de Nest y cliente manual de Resend se reemplazan por uso de dependencias públicas e integración propia. Las licencias originales permanecen dentro de los paquetes distribuidos; no se mantiene NOTICE ni un catálogo manual de atribuciones. El origen fijado conserva UNLICENSED; la implementación propia de este repositorio adopta MIT por decisión de su titular.

## ADR-010 — Cuota mantenida por rate-limiter-flexible

Estado: **implementada localmente; cuota distribuida pendiente**.

Se fija rate-limiter-flexible 11.2.3: publicación del 17/10/2026, actividad reciente, repo no archivado, adopción señalada por 11,3 millones de descargas npm en el mes consultado y sin dependencias de producción. Se usa RateLimiterMemory mediante su API; no se mantiene una copia del algoritmo. [Evidencia fechada y fuentes](contact.es.md).

Contacto conserva 5/h/IP, bloqueo de una hora desde el sexto intento, sourceIp, cuota por método y headers existentes. La ventana es fija desde el primer intento y libera todos sus puntos al vencer; no conserva decrementos por hit ni el bug de timers de Throttler 6.5.0. Los reintentos bloqueados no extienden la sanción y una IP no altera el vencimiento de otra. Estas diferencias se prueban explícitamente. El JSON 429 histórico se mantiene por compatibilidad, sin dependencia Nest.

Resend 6.34.1 reemplaza el cliente manual. Su dependencia de tipos React se limita al desarrollo; HeadersInit se toma de los tipos fetch de Node, sin DOM ni skipLibCheck. Configuración productiva requiere NODE_ENV=production para evitar logs detallados del SDK. La suite usa mocks de transporte cargados después del cerco de red; ningún envío real.

La selección no resuelve cuotas compartidas entre Lambdas: distribución/atomicidad, proxies reales, deadline/cancelación y secretos siguen antes de exposición. No se agrega infraestructura en este corte. [Contrato y pendientes](contact.es.md).

## ADR-011 — Vitest y stack local de test

Estado: **implementados y verificados localmente**. Vitest 5.0.5 reemplaza node:test/unittest en las suites; títulos QA en español con Dado/Cuando/Entonces. CDK CLI 2.1146.1, library 2.274.0 y constructs 10.8.1 solo de desarrollo. Stack única de test, IAM, boundaries externas y roles separados; synth sin lookups. [Pruebas](testing.es.md) y [stack](infrastructure.es.md). Bootstrap, provisión de roles/secretos y despliegue no se ejecutaron.

## ADR-012 — Suscripciones con HTTP nativo

Estado: **sección local implementada; integración administrada pendiente**. POST/DELETE conservan body JSON, normalización, respuestas 200 y mapeos exactos del SHA auditado. fetch nativo explícito y AbortSignal.timeout(8000), sin dependencia nueva. Cuotas independientes 10/h/IP reutilizan RateLimiterMemory; contacto permanece en 5/h/IP. Las tres diferencias de validación aceptadas para contacto se declaran también aquí. Configuración lazy/500 y omisión de logs libres son diferencias explícitas; deadline total/distribución siguen pendientes. [Contrato, evidencia y procedencia](subscriptions.es.md).

## ADR-013 — Chat con dominio fijado y proveedores explícitos

Estado: **implementado y verificado localmente**. Se conservan los módulos necesarios de a0ef80fa para starters/chat, contenido y prompts sin renovación. DTO directo/anidado con reflect-metadata; repositorio R2 mediante SDK S3 vigente fijado; fetch OpenAI conservado. Cuotas independientes 20/min/IP reutilizan la decisión de ventana/bloqueo local. Se mantienen y prueban límites originales de timeout R2, stale y retención IA; se omiten logs libres y se conservan métricas acotadas. [Contratos, diferencias, procedencia y requisitos de etapa 4](chat.es.md). Ninguna evidencia local equivale a despliegue/integración AWS.

La ubicación profesional del chat se corrige puntualmente a Posadas, Misiones, Argentina, con diferencia explícita frente al SHA fijado. El resto del contenido conserva su alcance anterior y la renovación editorial general sigue inmediatamente antes de producción. [Detalle y referencias históricas](chat.es.md).
