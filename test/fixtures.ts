import type { APIGatewayProxyEventV2 } from 'aws-lambda';

export function httpEvent(method = 'GET', rawPath = '/api/health'): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: '$default', rawPath, rawQueryString: '', headers: {},
    isBase64Encoded: false,
    requestContext: {
      accountId: '000000000000', apiId: 'local', domainName: 'example.invalid', domainPrefix: 'local',
      http: { method, path: rawPath, protocol: 'HTTP/1.1', sourceIp: '192.0.2.1', userAgent: 'local-test' },
      requestId: 'local-request', routeKey: '$default', stage: 'test', time: '', timeEpoch: 0,
    },
  };
}
