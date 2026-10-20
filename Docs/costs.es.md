# Costos: escenarios, no presupuesto confirmado

[English](costs.md) · Consulta: 24/10/2026. USD/mes, us-east-1, sin impuestos ni conversión ARS. [Fuentes](sources.es.md).

## Modelo explícito

Se calcula la candidata Lambda **Event Function**, no Lambda Web Functions. Las cifras usan una carga hipotética, no tráfico medido ni facturación personal. El modelo permite comparar alternativas y no garantiza ahorro.

| Supuesto mensual | Bajo | Mayor uso |
| --- | --- | --- |
| Solicitudes totales N | 10.000 | 1.000.000 |
| Chat que llama al proveedor | 20% = 2.000 | 20% = 200.000 |
| Duración chat / otras | 5 s / 0,15 s | 5 s / 0,15 s |
| Duración media ponderada | 1,12 s | 1,12 s |
| Memoria x86 | 512 MiB | 512 MiB |
| GB-s = N × 0,5 × 1,12 | 5.600 | 560.000 |
| Logs totales por request | 2 KiB | 2 KiB |
| Salida total supuesta, incluye HTTP/proveedores | 7 KiB/request | 7 KiB/request |
| Lecturas del secreto agrupado por mes | 100 | 10.000 |

Los 5 s incluyen espera externa; son hipótesis, no p95. Cada segundo medio adicional cuesta N×0,5×0,0000166667. A 1 M de requests, +1 s agrega ~USD 8,33 sin beneficios. Probar 1024 MiB: duplica tarifa por segundo, pero puede reducir duración/cold start. INIT facturado y refresh de secretos deben entrar en las mediciones.

## Componentes de la candidata, sin descuentos

Tarifas de referencia: Lambda x86 USD 0,0000166667/GB-s y 0,20/M requests; HTTP API USD 1/M; logs estándar 0,50/GB ingerido y 0,03/GB-mes almacenado; cuatro alarmas estándar a 0,10. Se estima un secreto JSON a 0,40/mes y lecturas a 0,05/10.000. Limiter: hasta dos WRU y dos RRU no transaccionales por request, items pequeños, 0,625/M WRU y 0,125/M RRU. Ajustar al algoritmo definitivo: condiciones fallidas/transacciones pueden cambiar el consumo.

| Componente | Bajo | Mayor uso |
| --- | ---: | ---: |
| Lambda cómputo | 0,093 | 9,333 |
| Lambda requests | 0,002 | 0,200 |
| Entrada HTTP API | 0,010 | 1,000 |
| Limiter DynamoDB requests | 0,015 | 1,500 |
| Reserva almacenamiento contadores | 0,010 | 0,010 |
| Secreto agrupado + lecturas | 0,401 | 0,450 |
| Logs ingestión + almacenamiento 14 días, estimado conservador | 0,010 | 0,981 |
| Cuatro alarmas | 0,400 | 0,400 |
| Reserva assets/requests S3 de despliegue | 0,050 | 0,100 |
| Salida a Internet a 0,09/GB, sin franquicia | 0,006 | 0,601 |
| **Subtotal candidato, aproximado** | **1,00** | **14,58** |

Tarifas oficiales: [Lambda](https://aws.amazon.com/lambda/pricing/), [HTTP API](https://aws.amazon.com/api-gateway/pricing/), [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/), [secrets](https://aws.amazon.com/secrets-manager/pricing/), [DynamoDB](https://aws.amazon.com/dynamodb/pricing/).

No se añaden DB de aplicación, NAT, ALB, VPC endpoints, Redis, colas, provisioned concurrency ni almacenamiento extra /tmp. Métricas nativas sin custom metrics iniciales; consultas Logs Insights/X-Ray, dashboards u otra telemetría serían adicionales. La reserva de assets depende de retención de paquetes; evitar acumulación ilimitada. La salida de R2 y los requests al upstream cloud van por separado abajo.

**Beneficio gratuito separado:** si queda íntegro el beneficio Lambda de 1 M requests y 400.000 GB-s compartido por la cuenta, Lambda sería 0 en bajo y ~2,667 en mayor uso. Conservando todos los demás rubros sin descontar, subtotales ~**0,90** y **7,71**. No se descuentan promociones API Gateway, créditos de bienvenida, beneficios CloudWatch/DynamoDB ni transferencia gratuitos: elegibilidad y consumo compartido no se verificaron. No asignar la franquicia completa a cada repo/ambiente.

La espera OpenAI se paga dos veces en conceptos diferentes: tokens al proveedor y duración Lambda. El caché IA actual por proceso puede tener menos hits tras escalar; el supuesto 20% debe medirse.

## Proveedores y responsabilidades compartidas

Para gpt-4.1-mini default, la documentación oficial consultada lista USD 0,40/M tokens input, 0,10/M cached input y 1,60/M output. Con 1.000 tokens entrada + 200 salida sin descuento, cada llamada cuesta 0,00072: **USD 1,44** o **144** para 2.000/200.000 llamadas. No se validó el override productivo de modelo. No se asumen hits de caché, herramientas ni llamadas gratuitas. [Modelo/precio](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

Resend (contacto y newsletters), R2 (knowledge/medios/suscriptores), Firebase, dominio y `portfolio-cloud` **continúan**. No se auditaron sus planes/facturas ni se cuentan como cero. El upstream cloud añade sus propias invocaciones HTTP/Lambda/R2 por suscripción. El API nuevo solo necesita lectura de knowledge, no duplicar su publicación o storage. Uso e idempotencia de publicación permanecen en cloud.

CDK/SAM no agregan licencia del framework. El repositorio público no prueba que cualquier uso de Actions, almacenamiento o servicios auxiliares sea ilimitado; medir retención/build. Serverless Dashboard/SST Console son opcionales y no están incluidos. El costo del framework no es el costo operativo AWS.

## EC2 compartida y convivencia

Vivo: t3.micro y una IPv4 pública; root EBS 8 GiB, clase no verificada. Referencia Linux On-Demand: 730 h×0,0104 = **7,59**; IPv4 730×0,005 = **3,65**. EBS se sigue pagando aparte; si fuera gp3 a 0,08/GB-mes, 8 GiB serían ~0,64 y el conjunto ~**11,88**, sin créditos CPU Unlimited, snapshots, transferencia, descuentos ni impuestos. Es un ejemplo de lista, no la factura. [T3](https://aws.amazon.com/ec2/instance-types/t3/), [IPv4](https://aws.amazon.com/vpc/pricing/), [EBS](https://aws.amazon.com/ebs/pricing/).

Mientras EC2 sigue encendida, el ahorro fijo por migrar solo Portfolio es **cero**. Incremento = nueva infraestructura test/prod + mediciones + duplicación puntual de recursos; baja si test no recibe tráfico, pero secretos/logs almacenados pueden seguir cobrando. Mantener dos stacks duplica sus costos fijos y consume beneficios compartidos.

Después de apagar EC2 sin terminarla ni desmantelarla, el total del ecosistema será las tres soluciones migradas + cloud/proveedores + observabilidad + EBS/snapshots retenidos. No atribuir toda la EC2 a Portfolio ni afirmar ahorro neto sin los costos de Foodly Notes/Modo Playa. Al detener la instancia se conserva el costo EBS; la IPv4 autoasignada puede cambiar al arrancar. Con Tunnel no es el origen DNS público, pero egress/SSM/Docker deben recuperarse y probarse.

Contenedores: como referencia App Runner cobra 0,007/GB-h provisionada y 0,064/vCPU-h activa en la región. Solo 1 GiB continuo serían ~5,11/mes de memoria antes de CPU/logs. Esto no prueba tamaño suficiente ni elegibilidad. Fargate+ALB agrega piso de cómputo, balanceador y red. Ninguno se elige por precio sin medir.

## Datos que faltan y cómo obtenerlos sin efectos

1. Logs agregados existentes de acceso por ruta/status/duración de los últimos 30 días; no cuerpos ni emails. Obtener métricas ya disponibles sin enviar tráfico de negocio.
2. Contar eventos chat_provider por outcome, tokens y cache_hit; comparar contra chat_reply, no solo source=faq. No recuperar prompts ni respuestas.
3. Contrastar el modelo con costos agregados por servicio y región. La facturación, los créditos y el presupuesto personal se conservan en el registro privado.
4. Medir en entorno aislado cold/warm, INIT/billed duration/memoria, distribución de tokens, solicitudes rechazadas y contadores. Proveedor simulado primero; llamadas pagas solo con presupuesto definido.
5. Inventariar metadata/retención de S3/logs/secrets y planes externos, sin GetSecretValue ni leer objetos privados de suscriptores.

Antes de habilitar público, acordar alertas en USD, cuota diaria IA, límites de ingreso y procedimiento de corte. Una alerta puede llegar tarde y no garantiza un límite de gasto.

## Comparación total y criterio del siguiente incremento

El piso operativo mínimo pesa más que una preferencia de framework. Nest adaptado y handlers comparten la misma candidata de infraestructura y los mismos proveedores: no hay una tarifa Lambda específica por usar Nest. Las [mediciones locales](local-runtime.es.md) no se convierten en duración facturada, ahorro de tokens ni presupuesto AWS.

Sumando los supuestos anteriores, el escenario bajo da **USD 2,44/mes + P** (1,00 infraestructura + 1,44 IA); mayor uso **158,58 + P** (14,58 + 144). Con la franquicia Lambda íntegra supuesta serían **2,34 + P** y **151,71 + P**. P incluye los cargos efectivos de Resend, R2, Firebase, dominio, portfolio-cloud y CI/retención que no estén incluidos arriba. P es desconocido: estas expresiones no son un total final ni una factura. No se presume que planes gratuitos cubran el consumo ni que cada ambiente reciba toda la franquicia.

| Alternativa | Costo total a comparar | Piso/condición |
| --- | --- | --- |
| EC2 compartida | instancia + IPv4 + EBS + observabilidad + proveedores | cómputo/red continuos; ejemplo de lista anterior, no costo exclusivo de Portfolio |
| Event Function + HTTP API, A/B | invocaciones/duración + limiter + logs + assets + secretos/alarmas + P | menor piso propuesto; secreto y alarmas aportan ~0,80/mes por ambiente en este modelo antes de uso |
| App Runner | memoria continua + CPU activa + logs/red + P | mínimo provisionado aun con poco tráfico |
| Fargate + ALB | cómputo continuo + balanceador/red + observabilidad + P | piso desproporcionado para la carga demo supuesta |
| Convivencia | EC2 actual + nueva infraestructura y proveedores incrementales | ahorro fijo nulo mientras EC2 permanece activa |

La resta correcta al finalizar es costo fijo evitable de EC2 menos costo incremental de **todas** las APIs migradas y recursos retenidos. EBS/snapshots pueden continuar cobrando. Foodly Notes y Modo Playa aún no tienen estimaciones cerradas en este repo. Apagar EC2 conservando instancia y backup depende de migrarlas y validar recuperación; migrar solo Portfolio no produce ese ahorro.

Los proveedores también pueden incorporar mínimos y sobreconsumos: [Resend](https://resend.com/pricing), [R2](https://developers.cloudflare.com/r2/pricing/). No se consultaron planes privados ni se reconstruyeron importes personales.

La conservación final incluye la instancia detenida y un backup recuperable. El ahorro se evalúa descontando almacenamiento y recursos retenidos; no se asume eliminación de todo costo fijo. [Secuencia de apagado y recuperación](migration.es.md#ec2-detenida-y-backup-recuperable).
