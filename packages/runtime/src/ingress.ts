import { BlockList, isIP } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// Rangos oficiales de Cloudflare; revisar junto al mantenimiento operativo.
const cloudflare = new BlockList();
for (const subnet of [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
]) {
  const [address, prefix] = subnet.split('/');
  cloudflare.addSubnet(address!, Number(prefix), isIP(address!) === 6 ? 'ipv6' : 'ipv4');
}

export function verifiedVisitorIp(event: APIGatewayProxyEventV2): string | null {
  const source = event.requestContext.http.sourceIp;
  const visitor = event.headers['cf-connecting-ip'];
  if (
    !isIP(source) ||
    !cloudflare.check(source, isIP(source) === 6 ? 'ipv6' : 'ipv4') ||
    !visitor ||
    !isIP(visitor)
  )
    return null;
  return visitor;
}

export function verifyOriginSecret(event: APIGatewayProxyEventV2, expected?: string): boolean {
  const actual = event.headers['x-portfolio-origin'];
  if (!expected || expected.length < 32 || !actual) return false;
  const left = Buffer.from(actual),
    right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
