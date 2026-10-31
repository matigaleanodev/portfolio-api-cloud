export class ChatUnavailableError extends Error {
  readonly status = 503;
}
