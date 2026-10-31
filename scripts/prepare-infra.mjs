import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const tsc = fileURLToPath(new URL('node_modules/typescript/bin/tsc', root));

// build.mjs compila y arma los seis assets (.tmp/lambda-{api,chat,editorial,og,validation-api,
// validation-chat}); el escenario de validación llega por argumento o por el contexto CDK.
const scenarioArg = process.argv.find((value) => value.startsWith('validationScenario='));
const scenario =
  scenarioArg?.slice('validationScenario='.length) ??
  JSON.parse(process.env.CDK_CONTEXT_JSON ?? '{}').validationScenario;
execFileSync(
  process.execPath,
  [
    fileURLToPath(new URL('scripts/build.mjs', root)),
    ...(scenario === undefined ? [] : [`validationScenario=${scenario}`]),
  ],
  { cwd: root, stdio: 'inherit' },
);

execFileSync(process.execPath, [tsc, '-p', 'tsconfig.infra.json'], {
  cwd: root,
  stdio: 'inherit',
});
