import { defineConfig } from 'vitest/config';

const isolated = { environment: 'node', setupFiles: ['./test/setup.mjs'] };

export default defineConfig({
  envDir: false,
  test: {
    projects: [
      {
        envDir: false,
        test: {
          ...isolated,
          // El runtime se ejecuta desde la raíz de su paquete, como en Lambda.
          setupFiles: ['./test/setup.mjs', './test/setup-runtime.mjs'],
          pool: 'forks',
          name: 'application',
          include: ['.tmp/tests/test/*.test.js'],
        },
      },
      {
        envDir: false,
        test: {
          ...isolated,
          setupFiles: ['./test/setup.mjs', './test/setup-runtime.mjs'],
          pool: 'forks',
          name: 'editorial',
          include: ['.tmp/tests/test/editorial/*.test.js'],
        },
      },
      {
        envDir: false,
        test: {
          ...isolated,
          name: 'infrastructure',
          include: ['.tmp/tests/test/infra/*.test.js'],
        },
      },
      {
        envDir: false,
        test: {
          environment: 'node',
          name: 'tooling',
          include: ['.tmp/tests/test/tooling/*.test.js'],
        },
      },
    ],
  },
});
