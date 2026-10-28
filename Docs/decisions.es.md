# Decisiones técnicas

[English](decisions.md)

## Handlers agrupados

Elegí composición explícita y una Lambda para seis operaciones: conserva contratos y dominio sin servidor HTTP ni contenedor Nest. Separar funciones requiere necesidad comprobada de permisos, concurrencia o aislamiento. Los DTO usan class-validator/class-transformer; Resend usa su SDK y suscripciones, fetch nativo.

## CDK e infraestructura separada

CDK TypeScript permite definir IAM y probar recursos antes de desplegar. Infraestructura queda fuera del runtime. `portfolio-cloud` conserva su herramienta y responsabilidades; no se introduce una plataforma común para uniformar repositorios.

## Compatibilidad por aplicación

Lambda y NestJS mantienen HTTP y comportamiento para sustituir la API mediante configuración del frontend. Las diferencias de validación y ventanas de cuota se declaran en pruebas. No se busca intercambiar dominios entre APIs ni garantizar equivalencia entre nubes.

## Controles compartidos

DynamoDB evita que escalar Lambda multiplique cupos. Las ventanas vencen por lógica de aplicación, las claves se derivan y las reservas IA preceden consumo. Deadline y cancelación limitan espera; no reintentar evita repetir efectos ambiguos. Las alertas complementan esos controles.

## FAQ y modelo único

FAQ responde directamente y mantiene continuidad sin IA. GPT-6 Luna es el único modelo: Responses, `reasoning.effort=none`, `store=false`, sin herramientas ni generación alternativa. La reserva es conservadora, sin depender de descuentos de caché; fallos ambiguos no devuelven presupuesto. Tarifas vencidas deshabilitan solo generación paga.

## Conocimiento verificable

`portfolio-cloud` publica contenido editorial; esta API lo consume. Fallback empaquetado con esquema, checksum y edad máxima, sin renovar automáticamente la fecha. No se persisten conversaciones. `store=false` no acredita por sí solo ausencia de retención del proveedor.

## Entrega y recuperación

PR, CI y merge por workflow conservan identidad humana verificable. El artifact se promueve y recupera sin recompilar; planificación, publicación, ejecución y runtime tienen roles separados. Una instalación conserva nombres físicos y datos. La API original y EC2 permiten recuperación independiente mientras sigan disponibles.

## Organización y middleware

Como dirección de diseño, elegí separar dominio, HTTP y runtime, y adoptar Middy para routing y middleware. El código actual conserva composición explícita; esta decisión no implica que Middy ya esté integrado. La reorganización debe preservar contratos y controles. Powertools queda opcional y no se agrega solo por el logger.

## Pruebas y licencia

Vitest unifica suites con proveedores simulados y red bloqueada; CDK usa assertions y synth sin lookups. El proyecto usa MIT con autoría propia; las licencias de dependencias permanecen en sus paquetes, sin catálogo manual de atribuciones.

[Arquitectura](architecture.es.md) · [Contratos](api.es.md) · [Operación](operations.es.md)
