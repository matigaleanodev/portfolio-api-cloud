# Validación productiva

[English](production-rollout.md) · 25/10/2026.

El portfolio publicado consume la API TypeScript en Lambda mediante su URL HTTPS de API Gateway. Conservé los seis contratos y cambié únicamente la URL base de los servicios Angular; no hubo reescritura del frontend. El chat usa GPT-6 Luna como único modelo, con reasoning explícito `none`, sin generación alternativa.

## Entrega y comprobaciones

Promoví el paquete real `dist/handler.handler` en la instalación física existente `portfolio-api-cloud-test`, con configuración real en Secrets Manager. La candidata pasó primero el smoke privado por SigV4; el acceso anónimo y Observer devolvieron 403. Después habilité la ruta pública mediante un changeset de una sola modificación, sin reemplazo. El hash de Lambda coincide con el ZIP revisado.

La revisión de aplicación es `1cc2cd32dd48b6fd6f8d09be36b824994d0f514d`, artifact `12618050015`, digest `sha256:a85f2fa509d68241da3818b5c87008fafb83d43dde2f12b3ccb1d6a8fea22646`. La CI aprobó 625 pruebas y controles de tipos, paquete, documentación y synth. El frontend publicado corresponde al merge `7cb9f15c3607f5a3ccec4115e30bbc4625aadd2c`, comprobado mediante publication-state y navegador real.

Desde `https://matiasgaleano.dev` se comprobaron:

| Método y ruta             | Resultado                              |
| ------------------------- | -------------------------------------- |
| GET /api/health           | 200                                    |
| POST /api/contact         | 204, correo de prueba recibido         |
| GET /api/chat/starters    | 200, sugerencias visibles              |
| POST /api/chat            | 201, IA desde la interfaz y FAQ sin IA |
| POST /api/subscriptions   | 200                                    |
| DELETE /api/subscriptions | 200                                    |

Usé direcciones temporales únicas bajo mi dominio para alta/baja; ambos registros de prueba se eliminaron. No se consultó ni modificó el resto de los suscriptores. Las operaciones se delegan a portfolio-cloud. Su publicador actualizó el knowledge canónico de R2 con los tres proyectos publicados y 15 posts; el perfil curado mantiene Comafi/Boreal IT y Posadas.

CORS y preflight admiten los dos orígenes del portfolio; un origen ajeno no recibe autorización CORS. Dos headers X-Forwarded-For/CF-Connecting-IP distintos consumieron la misma cuota, comprobando que no reemplazan sourceIp. No hay Function URL. La cuota regional permanece en 10, sin reserva ni aumento. El bootstrap regional quedó deshabilitado y los permisos efectivos de API Gateway se acotan a `9vxryiyill` y sus recursos.

## Consumo observado de Luna

| Prueba            | Entrada | Escritura de caché | Salida | Razonamiento |   Costo USD |
| ----------------- | ------: | -----------------: | -----: | -----------: | ----------: |
| Backend/cloud     |    1478 |               1475 |    107 |            0 | 0.000238175 |
| Foodly/Modo Playa |    3115 |               3112 |    167 |            0 | 0.000472800 |

El total, incluida la comprobación inicial del modelo con 14 tokens de entrada y 6 de salida, es **USD 0.000715375**. Es un cálculo sobre usage real y tarifas Standard verificadas; no una factura ni un total AWS/Resend. No se observaron tokens de razonamiento. El proveedor tardó 4,603 s y 3,281 s en las dos consultas representativas.

La reserva real conservó entrada a USD 0,125/M por escritura de caché a 30 minutos y 600 tokens máximos de salida a USD 0,50/M, incluido razonamiento. El contador compartido conservó también las reservas de la validación simulada previa: no se reinició ni se devolvió saldo al cambiar modelo o configuración. FAQ no produjo eventos de generación ni reservas de IA.

## Recuperación y límites

EC2 sigue running y el health de la API NestJS anterior responde 200 con el origen del portfolio; su dominio y los datos anteriores permanecen disponibles. Para recuperar tráfico, revertir por PR la URL del frontend a `https://api.matiasgaleano.dev/api` y publicar por Actions; después comprobar los seis contratos. No hubo regresión funcional que exigiera rollback durante este corte. El assembly y recibos conservan la revisión anterior de la infraestructura nueva.

- Revisar tarifas y renovar AI_PRICING_VALID_UNTIL antes del 24/11/2026; el vencimiento bloquea negocio. El fallback empaquetado también requiere renovación dentro de sus 30 días de vigencia.
- El techo monetario aplica a la admisión del runtime nuevo; no es un límite de facturación de la cuenta, infraestructura, Resend ni API anterior. Las reservas son conservadoras y no se reembolsan ante fallos ambiguos.
- Las tres alarmas estaban OK y no cuentan con acciones de notificación. Quedan pendientes un canal de avisos y cobertura específica de errores HTTP controlados. Logs: 14 días, sin texto de chat ni identidad del visitante.
- No se ejecutó una matriz exhaustiva de carga, fallos, recuperación ni alarmas forzadas. Abortar el transporte no prueba el cese de facturación del proveedor. Las personas detrás de NAT comparten el límite adicional por origen/día.
- Los clientes con un bundle anterior necesitan recargar para adoptar la nueva URL. El knowledge remoto tiene caché de cinco minutos; el fallback es un snapshot fechado, no una réplica continua.

## Procedencia

[CI API](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40242591045) · [Foundation](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40242825388) · [Candidate](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40243378109) · [Public ingress](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40243932314) · [Frontend](https://github.com/matigaleanodev/portfolio/actions/runs/40244153897)

[Configuración y fuentes oficiales de tarifas](production.es.md).
