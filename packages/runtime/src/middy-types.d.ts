// @middy/core 7 referencia en sus tipos un SDK opcional (modo durable) que este runtime no usa:
// `never` deja el contexto estándar de Lambda como única opción.
declare module '@aws/durable-execution-sdk-js' {
  export type DurableContext = never;
}
