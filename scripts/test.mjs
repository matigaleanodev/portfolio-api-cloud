import { rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
const root = new URL("../", import.meta.url);
rmSync(new URL(".tmp/tests/", root), { recursive: true, force: true });
execFileSync(process.execPath, ["node_modules/typescript/bin/tsc"], {
  cwd: root,
  stdio: "inherit",
});
execFileSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "--config",
    "vitest.config.mjs",
    "--configLoader",
    "native",
    ...process.argv.slice(2),
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      NODE_ENV: "test",
      AWS_EC2_METADATA_DISABLED: "true",
      PATH: "/usr/local/bin:/usr/bin:/bin",
    },
  },
);
