import { r2Region } from '@portfolio-api-cloud/contracts/storage';
import {
  createSubscriberStore,
  isValidSubscriberEmail,
  normalizeSubscriberEmail,
} from '../src/subscriptions/store.ts';
import { dryRun, fail } from './cli.ts';

// Reemplaza run-subscribe/run-unsubscribe: el store corre en proceso, no como Lambda.
// Uso: run-subscription.js <subscribe|unsubscribe> <email> [--execute]
const [action, rawEmail, flag, ...rest] = process.argv.slice(2);
if (!['subscribe', 'unsubscribe'].includes(action ?? '') || !rawEmail || rest.length)
  throw new Error('Use: <subscribe|unsubscribe> <email> [--execute]');
if (flag !== undefined && flag !== '--execute') throw new Error(`Unknown argument: ${flag}`);
const email = normalizeSubscriberEmail(rawEmail);
if (!isValidSubscriberEmail(email)) throw new Error('Invalid email');

if (flag !== '--execute') dryRun(action!, { email: '[redacted-email]' });
else {
  const env = process.env;
  const missing = [
    'SUBSCRIBERS_R2_ENDPOINT',
    'SUBSCRIBERS_R2_BUCKET',
    'R2_SUBSCRIBERS_ACCESS_KEY_ID',
    'R2_SUBSCRIBERS_SECRET_ACCESS_KEY',
  ].filter((key) => !env[key]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  const store = createSubscriberStore({
    endpoint: env.SUBSCRIBERS_R2_ENDPOINT!,
    region: env.R2_REGION || r2Region,
    bucket: env.SUBSCRIBERS_R2_BUCKET!,
    accessKeyId: env.R2_SUBSCRIBERS_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SUBSCRIBERS_SECRET_ACCESS_KEY!,
  });
  await (
    action === 'subscribe' ? store.createSubscriber(email) : store.deleteSubscriber(email)
  ).then((result) => console.log(JSON.stringify({ action, result })), fail);
}
