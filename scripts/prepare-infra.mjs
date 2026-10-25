import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { stageRuntimePackage } from "./package.mjs";
const root = new URL("../", import.meta.url);
execFileSync(process.execPath, ["scripts/build.mjs"], {
  cwd: root,
  stdio: "inherit",
});
rmSync(new URL(".tmp/lambda/", root), { recursive: true, force: true });
stageRuntimePackage(fileURLToPath(new URL(".tmp/lambda/", root)));
execFileSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "tsconfig.infra.json"],
  { cwd: root, stdio: "inherit" },
);
