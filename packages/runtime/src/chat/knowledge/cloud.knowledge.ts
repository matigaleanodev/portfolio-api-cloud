import { type KnowledgeContextItem } from '../chat.types.js';

export const CLOUD_KNOWLEDGE_ITEMS: readonly KnowledgeContextItem[] = [
  {
    sourceType: 'cloud',
    sourceId: 'cloud-ecosystem',
    title: 'Arquitectura del ecosistema portfolio',
    text: [
      'El ecosistema actual está dividido en cuatro repositorios con responsabilidades claras.',
      '`portfolio` concentra frontend estático, contenido y prerender.',
      '`portfolio-api-cloud` implementa contacto, chatbot, suscripciones y la automatización editorial con TypeScript, Lambda, HTTP API Gateway y CDK. `portfolio-api` conserva la implementación NestJS en EC2 para recuperación.',
      '`portfolio-cloud` conserva la automatización serverless anterior como alternativa de recuperación.',
    ].join(' '),
    tags: ['cloud', 'architecture', 'portfolio', 'portfolio-cloud', 'serverless'],
  },
  {
    sourceType: 'cloud',
    sourceId: 'cloud-lambdas',
    title: 'AWS Lambda en el portfolio',
    text: [
      'La API separa Lambdas por responsabilidad: una para el chatbot y otra para contacto y suscripciones, ambas con middleware Middy.',
      'La automatización editorial (`process-release`, `generate-og`, `notify-post` y `publish-chat-knowledge`) vive en el mismo repositorio y se despliega con CDK, con handlers chicos y servicios compartidos para proveedores.',
    ].join(' '),
    tags: ['aws', 'lambda', 'serverless', 'middy', 'cdk', 'og', 'subscriptions'],
  },
  {
    sourceType: 'cloud',
    sourceId: 'cloud-storage',
    title: 'Storage y estado editorial',
    text: [
      'La automatización editorial usa almacenamiento estilo objeto para assets y estado operativo.',
      'Las imágenes OpenGraph generadas se publican en un bucket accesible por dominio público y el estado procesado de posts vive como JSON versionable en storage.',
      'El criterio es usar storage simple y auditable antes que sumar bases de datos innecesarias.',
    ].join(' '),
    tags: ['cloud', 'storage', 's3', 'r2', 'state', 'og-images'],
  },
  {
    sourceType: 'cloud',
    sourceId: 'cloud-release-flow',
    title: 'Flujo post-publicación del blog',
    text: [
      'El frontend genera un release manifest con información editorial del blog.',
      'Luego `process-release` detecta posts nuevos, dispara la generación de OpenGraph y envía notificaciones a suscriptores.',
      'La intención es mantener ese flujo desacoplado del backend principal para que `portfolio-api` no se convierta en CMS ni en orquestador editorial.',
    ].join(' '),
    tags: ['cloud', 'release', 'blog', 'event-driven', 'notifications', 'manifest'],
  },
  {
    sourceType: 'cloud',
    sourceId: 'cloud-operational-criteria',
    title: 'Criterio técnico cloud y deploy',
    text: [
      'La API serverless usa Lambdas ARM64, DynamoDB para cuotas compartidas y SSM Parameter Store para la configuración sensible, cargada desde GitHub Actions Secrets; la implementación NestJS y EC2 se conservan para recuperación.',
      'La automatización del blog corre en AWS Lambda porque encaja mejor con tareas discretas como procesar releases, generar assets y notificar.',
      'La separación busca balancear pragmatismo, costo y claridad de responsabilidades.',
    ].join(' '),
    tags: ['cloud', 'aws', 'ec2', 'docker', 'lambda', 'ssm', 'pragmatism'],
  },
];
