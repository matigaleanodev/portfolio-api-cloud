import { test } from "vitest";
import assert from "node:assert/strict";
import { request } from "node:https";
import { connect } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { createSocket } from "node:dgram";
import { lookup } from "node:dns/promises";
import { execSync } from "node:child_process";
import { createApplication } from "../src/application.js";
import { readConfiguration } from "../src/config.js";
import { handler } from "../src/handler.js";
import { httpEvent } from "./fixtures.js";

test("AIS-001 | Dada configuración explícita de CORS, cuando se leen valores vacíos, listas o comodín, entonces se normalizan sin exigir credenciales", () => {
  assert.deepEqual(readConfiguration({}), { corsOrigins: false });
  assert.deepEqual(readConfiguration({ CORS_ORIGIN: "  " }), {
    corsOrigins: false,
  });
  assert.deepEqual(readConfiguration({ CORS_ORIGIN: " * " }), {
    corsOrigins: true,
  });
  assert.deepEqual(
    readConfiguration({
      CORS_ORIGIN: " https://a.invalid, , https://b.invalid ",
    }),
    {
      corsOrigins: ["https://a.invalid", "https://b.invalid"],
    },
  );
  assert.deepEqual(readConfiguration({ CORS_ORIGIN: " , " }), {
    corsOrigins: false,
  });
});

test("AIS-002 | Dadas composiciones independientes, cuando cambia el objeto de configuración original, entonces cada aplicación conserva su propio origen", async () => {
  const env = { CORS_ORIGIN: "https://a.invalid" };
  const app = createApplication(readConfiguration(env));
  env.CORS_ORIGIN = "https://b.invalid";
  const event = httpEvent();
  event.headers.origin = "https://a.invalid";
  assert.equal(
    (await app(event)).headers?.["access-control-allow-origin"],
    event.headers.origin,
  );
  const other = createApplication(readConfiguration(env));
  assert.equal(
    (await other(event)).headers?.["access-control-allow-origin"],
    undefined,
  );
});

test("AIS-003 | Dado un proceso sin credenciales, cuando se importa e invoca el handler de health, entonces responde 200 sin proveedores", async () => {
  assert.equal(process.env.RESEND_API_KEY, undefined);
  assert.equal(process.env.OPENAI_API_KEY, undefined);
  assert.equal(process.env.PORTFOLIO_CLOUD_API_URL, undefined);
  assert.equal(process.env.CORS_ORIGIN, undefined);
  assert.equal((await handler(httpEvent())).statusCode, 200);
});

test("AIS-004 | Dado el cerco de aislamiento, cuando se intenta usar red, DNS o procesos hijos, entonces cada acceso queda bloqueado", async () => {
  const blocked = /Red y proveedores reales bloqueados/;
  await assert.rejects(fetch("https://example.invalid"), blocked);
  assert.throws(() => request("https://example.invalid"), blocked);
  assert.throws(() => connect(443, "example.invalid"), blocked);
  assert.throws(() => tlsConnect(443, "example.invalid"), blocked);
  assert.throws(() => createSocket("udp4"), blocked);
  assert.throws(() => lookup("example.invalid"), blocked);
  assert.throws(() => execSync("echo inesperado"), blocked);
});

test("AIS-005 | Dada una lista CORS sin orígenes, cuando se solicita preflight, entonces responde 404 sin headers CORS", async () => {
  const app = createApplication(readConfiguration({ CORS_ORIGIN: " , " }));
  const event = httpEvent("OPTIONS");
  event.headers.origin = "https://example.invalid";
  const result = await app(event);
  assert.equal(result.statusCode, 404);
  assert.equal(result.headers?.vary, undefined);
  assert.equal(result.headers?.["access-control-allow-origin"], undefined);
});
