import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import bodyParser from 'body-parser';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const jsonParser = bodyParser.json({ limit: '16kb' });
const formParser = bodyParser.urlencoded({ limit: '16kb', extended: true });

export async function parseBody(event: APIGatewayProxyEventV2): Promise<unknown> {
  const bytes = Buffer.from(event.body ?? '', event.isBase64Encoded ? 'base64' : 'utf8');
  const request: IncomingMessage & { body?: unknown } = new IncomingMessage(new Socket());
  request.headers = { ...event.headers };
  // El evento ya contiene el cuerpo completo; el framing corresponde al adaptador.
  delete request.headers['transfer-encoding'];
  request.headers['content-length'] = String(bytes.byteLength);
  request.method = event.requestContext.http.method;
  const response = new ServerResponse(request);
  request.push(bytes);
  request.push(null);
  try {
    for (const parser of [jsonParser, formParser]) {
      await new Promise<void>((resolve, reject) => {
        parser(request, response, (error?: unknown) => (error ? reject(error) : resolve()));
      });
    }
    return request.body;
  } finally {
    request.destroy();
  }
}

export function bodyError(error: unknown): {
  statusCode: number;
  body: object;
} {
  const failure = error as {
    status?: unknown;
    type?: unknown;
    message?: unknown;
  } | null;
  const statusCode =
    typeof failure?.status === 'number' && failure.status >= 400 && failure.status <= 599
      ? failure.status
      : 500;
  const message =
    statusCode === 500 || typeof failure?.message !== 'string'
      ? 'Internal server error'
      : failure.message;
  const body =
    failure?.type === 'entity.parse.failed'
      ? { message, error: 'Bad Request', statusCode }
      : { statusCode, message };
  return { statusCode, body };
}
