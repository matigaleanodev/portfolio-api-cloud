import { createR2Client } from '../src/subscriptions/store.ts';
import { fail, parseFlags } from './cli.ts';
import { migrateSubscribers, type MigrationMode } from './subscriber-migration.ts';

// Sin argumentos solo muestra el uso; --plan lista claves (lectura), --copy copia sin
// sobrescribir y --remove-public exige SUBSCRIBERS_MIGRATION_CUTOVER_CONFIRMED=true.
const flags = parseFlags(['--plan', '--copy', '--remove-public']);
if (flags.size !== 1) {
  console.log('Use exactly one of --plan, --copy or --remove-public. Nothing was contacted.');
} else {
  const mode = [...flags][0]!.slice(2) as MigrationMode;
  if (mode === 'remove-public' && process.env.SUBSCRIBERS_MIGRATION_CUTOVER_CONFIRMED !== 'true')
    throw new Error(
      'Pause subscription writes and confirm private runtime cutover before removing public copies',
    );
  const env = process.env;
  const missing = [
    'R2_ENDPOINT',
    'R2_BUCKET',
    'SUBSCRIBERS_R2_BUCKET',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
  ].filter((key) => !env[key]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  const s3 = createR2Client({
    endpoint: env.R2_ENDPOINT!,
    region: env.R2_REGION,
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
  });
  await migrateSubscribers(s3, env.R2_BUCKET!, env.SUBSCRIBERS_R2_BUCKET!, mode).then(
    (count) => console.log(JSON.stringify({ mode, subscribers: count })),
    fail,
  );
}
