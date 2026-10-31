/** Claves de objetos R2 compartidas entre publicación editorial, chat y suscripciones. */
export const storageKeys = {
  chatKnowledge: 'artifacts/chat/knowledge.json',
  processedPostsState: 'state/posts.json',
  ogPrefix: 'og/',
  subscribersPrefix: 'subscribers/',
  subscriberSuffix: '.json',
} as const;

/** Región de firma que R2 acepta para el SDK S3. */
export const r2Region = 'auto';
