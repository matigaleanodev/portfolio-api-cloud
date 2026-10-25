import { defineConfig } from "vitest/config";
const isolated = { environment: "node", setupFiles: ["./test/setup.mjs"] };
export default defineConfig({
  envDir: false,
  test: {
    projects: [
      {
        envDir: false,
        test: {
          ...isolated,
          name: "application",
          include: [".tmp/tests/test/*.test.js"],
        },
      },
      {
        envDir: false,
        test: {
          ...isolated,
          name: "infrastructure",
          include: [".tmp/tests/test/infra/*.test.js"],
        },
      },
      {
        envDir: false,
        test: {
          environment: "node",
          name: "tooling",
          include: [".tmp/tests/test/tooling/*.test.js"],
        },
      },
    ],
  },
});
