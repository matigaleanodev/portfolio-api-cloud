# Starters y chat con proveedores explícitos

[English](chat.md) · 25/10/2026.

## Contratos y composición

GET /api/chat/starters devuelve **200** con suggestedQuestions: «¿Quién sos y a qué te dedicás?» y «¿Qué tecnologías usás?». HEAD comparte esa ruta y cuota, con body vacío. POST /api/chat devuelve **201** con answer, suggestedQuestions y source (faq, ai o fallback). Se conservan mayúsculas/barra final del routing y el parser común de 16 KiB, CORS y headers funcionales. Cada método dispone de **20/min/IP**, independiente del otro, contacto y alta/baja; la identidad es sourceIp del evento, nunca XFF.

src/chat/ conserva módulos de dominio concretos del origen: DTO, FAQ, contenido, selección contextual, fecha Argentina, proveedor OpenAI, repositorio de conocimiento y métricas. chat.providers.ts compone instancias explícitamente; application.ts adapta HTTP sin Nest/Express. handler.ts crea y conserva la composición de chat al primer POST válido. Starters no necesita configurar proveedores.

Validación: message string no vacío/no blanco, máximo 500 unidades UTF-16; sessionId opcional/null, string de hasta 100; history opcional/null, array de hasta seis entradas; role user/assistant y content string no blanco de hasta 1500. No se recorta ni normaliza texto. Se rechazan campos desconocidos, también anidados; se conserva stopAtFirstError por propiedad y los prefijos de errores history.0. El historial viaja en la request: sessionId no crea identidad ni persistencia de conversación.

Orden conservado: fuera de alcance → FAQ solo sin historial → selección de contexto → reformulación FAQ/IA → fallback. Una FAQ también puede consultar IA; source faq no significa ausencia de consumo. Una consulta profesional utiliza el perfil curado sin leer R2. Consultas editoriales requieren conocimiento válido y mantienen **503** cuando falta, aunque haya FAQ. Un fallo IA con contexto da fallback técnico, sin afirmar que falte información. Las sugerencias se fusionan, deduplican y limitan como en el origen.

Se conservan ranking, referencias conversacionales, separación entre hechos laborales y proyectos, enlaces y prompts. La única corrección de contenido es la ubicación profesional: **Posadas, Misiones, Argentina**, confirmada por el titular, reemplaza Villa Gesell del SHA auditado y se propaga al contexto y la FAQ. Los cinco hashes comparan los valores exportados normalizando exclusivamente esa sustitución; las respuestas y requests históricas declaran la misma adaptación sin reescribir el fixture. No se revalidó el resto del perfil ni se renovaron proyectos, fuentes editoriales o prompts. La renovación general sigue inmediatamente antes de producción. Posts futuros o inválidos se excluyen según el cambio de día en Argentina.

## Configuración y proveedores

OpenAI lee OPENAI_API_KEY sin trim y OPENAI_CHAT_MODEL con default gpt-4.1-mini. Sin clave o sin contexto devuelve null sin llamar al proveedor. Se conserva fetch nativo a /v1/responses, temperatura 0.3, max_output_tokens 300, JSON mode, historial ordenado y el mismo texto del prompt. No se agrega SDK ni se cambia store/retención. [OpenAI Docs](https://developers.openai.com/api/docs/guides/text).

El abort de IA sigue en 15 s; HTTP fallido, JSON inválido, respuesta inválida, red o abort producen null/fallback. Se conserva el acceso original al primer bloque output/content. Caché por hash SHA-256 de mensaje/contexto/historial/enlaces/sugerencias, 24 h, máximo 200 entradas y expulsión por inserción; no single-flight de IA ni retries de aplicación.

R2 utiliza R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY completos, con trim. Sin los cuatro se usa únicamente filesystem; configuración parcialmente presente falla. R2_REGION usa auto; CHAT_KNOWLEDGE_OBJECT_KEY usa artifacts/chat/knowledge.json; CHAT_KNOWLEDGE_CACHE_TTL_MS usa parseInt, mínimo 1000 ms y default cinco minutos. Cliente S3 con endpoint/credenciales explícitos y forcePathStyle; GetObject recibe Bucket/Key. No se usan credenciales profesionales ni se consulta AWS en pruebas.

Conocimiento: caché remota → R2 single-flight → stale en memoria ante fallo → fallback local → error. El fallback conserva las rutas .generated/chat/knowledge.json del cwd y ../portfolio/.generated/chat/knowledge.json; usa el primer archivo existente, sin saltar al segundo si el primero es inválido. La caché local usa ruta/mtime. Acepta artifact plano validado o envelope v1 con source, generatedAt y contentHash SHA-256; valida shape, slugs únicos, campos opcionales y URLs HTTP(S) sin credenciales. La integridad del envelope no equivale a autenticidad de su autor.

**Límites conservados y probados:** el timeout R2 de 5 s rodea send y no cancela el SDK ni cubre transformToString; stale no tiene edad máxima. Los reintentos internos del SDK conservan sus defaults, sin retries de aplicación. Los cachés son por entorno y se pierden al reiniciar. Ninguno resuelve deadline total ni cuota distribuida. El paquete actual no incorpora un artifact editorial real: sin R2/fallback válido, una consulta editorial en frío da 503. El smoke escribe un fallback sintético exclusivamente dentro de su directorio temporal; no se distribuye como contenido del bot.

## Dependencias y diferencias explícitas

Se agregan únicamente dependencias directas necesarias y fijadas: **@aws-sdk/client-s3 3.1156.0**, versión latest consultada en npm, engines >=20, Apache-2.0; y **reflect-metadata 0.2.2**, latest, Apache-2.0. S3 evita implementar firma/transportes R2 manualmente. reflect-metadata es requerido por @Type del historial en class-transformer; no introduce DI ni metadata de Nest. Lock reproducible; las licencias permanecen en los paquetes. [Metadata S3](https://registry.npmjs.org/@aws-sdk/client-s3/3.1156.0), [metadata reflect-metadata](https://registry.npmjs.org/reflect-metadata/0.2.2).

- Ubicación profesional corregida a Posadas, Misiones, Argentina; el origen y sus hashes históricos conservan Villa Gesell. Es una adaptación explícita de contenido, sin renovación editorial general.
- Dos arrays raíz cambian el mensaje por body must be an object; prototype extra se rechaza en raíz e historial, frente a eliminación silenciosa de ValidationPipe. Las cuatro referencias divergentes están declaradas sin alterar las expectativas históricas.
- Cuota con rate-limiter-flexible: ventana fija desde el primer intento y bloqueo de 60 s desde el intento excedido, sin extensión por reintentos; no se recupera el algoritmo ni el bug de timers Throttler.
- Configuración al primer POST válido: R2 incompleto produce 500 controlado; health/starters siguen disponibles. El origen validaba startup de toda la aplicación.
- Se omiten logs libres del repositorio/proveedor que podían incluir endpoint, ruta o detalles de red. Las métricas JSON acotadas conservan evento, outcome, duración y consumos válidos, ahora mediante stdout sin Logger Nest. No incluyen mensaje, historial, sessionId ni textos de excepciones. Correlación y observabilidad transversal quedan pendientes.
- La versión S3 vigente reemplaza 3.1004.0 del origen; la compatibilidad local comprueba configuración/comando/body simulados, no transporte efectivo ni R2 real.

Fuera de las diferencias declaradas, no se introduce otro cambio deliberado en contenido, validación o errores. Se prueban 400/413/429/503 y 500 controlado; los restantes contratos mantienen 204/200 y mapeos 400/502/503.

## Evidencia local

**223 casos nuevos**: 59 referencias DTO; 18 referencias de dominio y efectos generadas ejecutando los blobs originales; cinco hashes de contenido; 74 escenarios adaptados de las suites originales (FAQ, conversación, contexto y publicación); 20 proveedor/métricas; 33 repositorio/configuración/SDK; 14 HTTP/cuotas/composición. Dos expectativas de 404 se reemplazan y otra prueba de contacto ahora espera 400 de chat sin message.

Total **479 aprobados**: 456 aplicación, 12 tooling y 11 infraestructura. Formato, tipos estrictos, build ESM, smoke fuera del checkout sin devDependencies, documentación, scope CI, actionlint y synth sin lookups se comprueban localmente con Node 24.22.1 LTS. npm audit del lock actual no reporta vulnerabilidades. La reproducción pública ejecuta npm ci --ignore-scripts y check sin .git, privados, dist ni node_modules previos, con ambiente/credenciales ficticios. Nada de esto demuestra integración administrada, disponibilidad de proveedores ni costos AWS.

test/chat-reference.json SHA-256: 5f3ec1524ebd9d9d8a740b19d6fc5333e5afd9bc39d563fdbe331903c16be401.
test/chat-domain-reference.json SHA-256: 2aeddfabc6061692c3c4c649624a17b9d9e0a996071d3f2d5c9b0a57dfea2492.
Ambos se excluyen de Prettier como evidencia fijada. Contacto y suscripciones conservan sus hashes anteriores. La generación utilizó Nest common 11.1.13, class-validator 0.14.3, class-transformer 0.5.1, reflect-metadata 0.2.2 y rxjs 7.8.2; no se verificaron nuevamente tarballs. La ejecución normal no depende del origen, Nest, Jest ni herramientas privadas.

## Procedencia y propiedad

Fuente: [portfolio-api@a0ef80fa9f82d1cea5a31425a63ab0a344338c56](https://github.com/matigaleanodev/portfolio-api/tree/a0ef80fa9f82d1cea5a31425a63ab0a344338c56). Se consultaron únicamente blobs de ese SHA. Dominio/contenido se trasladan con la corrección puntual de ubicación declarada y sin renovación editorial general; DTO agrega validación directa/anidada; servicios reemplazan DI por constructores explícitos; config recibe mapas; proveedores reciben fetch/lector R2; routing/cuota/errores se adaptan a eventos. Controlador/módulo y specs guían contratos/composición, sin copiarlos al runtime. main.ts, app.module.ts y manifiestos fijados conservan la procedencia documentada en [aplicación](application.es.md) y [contacto](contact.es.md).

| Blob consultado                            | SHA-256                                                          |
| ------------------------------------------ | ---------------------------------------------------------------- |
| src/chat/chat-content.config.ts            | a49b0629cad4f2f3d0792b796da8f1e9987aa76da7a16bac6f7e5febd6bc6202 |
| src/chat/chat-knowledge.repository.spec.ts | b1f0c6915f6111afeb0f964031bf8ddcaf0c7ae544f6ca41dfde25793800f0ac |
| src/chat/chat-knowledge.repository.ts      | cc85890ff78ba83a51f3db1fd6f7f162d58724f868c50865ce8e6c4c6c9d1930 |
| src/chat/chat-metrics.spec.ts              | 1681c37f5df94561ed3ba1fe8e2307bc1bf8849568d5b7668c1c27b860c9aef1 |
| src/chat/chat-metrics.ts                   | 3bc37f3773d68b87de71e07bd02390c7f2b04e31b8491025cea4f4d20b333513 |
| src/chat/chat.controller.ts                | ec61358bb2acee22ff63b623e5b6354a636d37b722e39aad1d00ce8fd093121d |
| src/chat/chat.dto.ts                       | a81df32e362a49951d732f35dfcae8d09f5e00e7436d2d15af32805a725ee13a |
| src/chat/chat.module.ts                    | 7592b98926a1e99cb4acffffc5d717f31b78c11f2399e1fb52a380585ac9fa8b |
| src/chat/chat.service.spec.ts              | 85aa23038a31444535165dff17b03dbdef6d70b7aa0ca03d25153c6bf95a9409 |
| src/chat/chat.service.ts                   | d4690a40574281b664fe2ccd60dc070ada8a9ea7c4a0771869d504071869d5e4 |
| src/chat/chat.types.ts                     | 0d65cb1eb935311fc2c25c9e03ca9e5c799d5d75e3d857d3b2d35c716f0d427f |
| src/chat/content/chat-faq.data.ts          | 5d7ee8c37438ebf0ecc468e0ca4cbc67577c2f578b0b19130440b17de1f0be75 |
| src/chat/faq.service.spec.ts               | 810cb3f903db23ecea03191086504b2ad0e25b3f5e986afc69cd9f427c0ed4e2 |
| src/chat/faq.service.ts                    | 2236d2381e66e6d5407adba4f189c7f93df7dd89b7fe82f5ac21af4204d72247 |
| src/chat/knowledge.service.spec.ts         | 0071c9e2ae4f07e8251bf88ba5487080ea995e39325cf9a3cb9a494eba613488 |
| src/chat/knowledge.service.ts              | 7da4497f947eae75945fb19adf7b24274aa70acdd6a940e99d7f99087cf578e2 |
| src/chat/knowledge/cloud.knowledge.ts      | d8cabb15a53fdbaf4469f0c4dca86032db8d54eb66d73170d006157fb117fb29 |
| src/chat/knowledge/professional-profile.ts | 4545a60efdc17e3b63dab046923a8831d6ffa790a371321df848dddc687dbcbe |
| src/chat/knowledge/profile.knowledge.ts    | 4cdf04f94f770d3e92533890a24febfd67ae5e64126c60efcff43da30447de7f |
| src/chat/openai.service.spec.ts            | 8491bb44ca515fc4e6885fc653509d911336f73ff4ea6dccd3d038eb90c4b6a8 |
| src/chat/openai.service.ts                 | db7cdb23866e144668239c2740461369bb2d65c35f606d5cf76c347c08a8662c |
| src/chat/publication.spec.ts               | 4a3e4efcd62aaa23f1c69420e12fa9fd3860dedbab6e6928f1cf845d8e8d908c |
| src/chat/publication.ts                    | f5bb155418f572b279abc5f0f597b92651e059d929c7cac719da73f37e36e4cd |
| src/config/runtime.config.spec.ts          | 58563eaa8cefe638730012b3b2da9199d7bac226cfbf0a912470178c3d693845 |
| src/config/runtime.config.ts               | 366b7c532275fda3aaee639db60884999e3a0ee8f268b4a983124f6f6f672890 |
| test/chat-conversation.e2e-spec.ts         | 89de1cca53222c963f5390e8649fe2ec420ae3d732678cb10c31e5a5e720af60 |
| test/chat-runtime.e2e-spec.ts              | 420e8c8b8e215ef5d8d77611acfef96045c427cc319fe67c79c6344885c16920 |
| test/chat.e2e-spec.ts                      | c1ffcaa5914d0ccb545e7c495d0145793a35cbcc62f1268147879a663b6b442e |

Ambos repos pertenecen al mismo mantenedor. El origen continúa UNLICENSED: su carácter público no concede licencia a terceros. La implementación propia mantiene [MIT](../LICENSE), sin NOTICE ni inventario manual; las dependencias conservan sus avisos dentro de sus paquetes.

## Siguiente etapa

Los seis contratos están implementados y probados localmente, con alcance diferencial finito y diferencias declaradas. Sigue etapa 4: cuotas compartidas/atómicas, IP/proxies reales, presupuesto IA, deadline/cancelación, fallback versionado/política stale, retención y secretos/startup. La stack permanece sin desplegar y no habilita exposición pública. La renovación editorial permanece inmediatamente antes de producción.
