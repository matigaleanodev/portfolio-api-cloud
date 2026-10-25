import { syncBuiltinESMExports } from 'node:module';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import dns from 'node:dns';
import childProcess from 'node:child_process';

const deny = () => { throw new Error('Red y proveedores reales bloqueados en tests'); };
globalThis.fetch = async () => deny();
globalThis.WebSocket = class { constructor() { deny(); } };
http.request = http.get = https.request = https.get = deny;
net.connect = net.createConnection = net.Socket.prototype.connect = tls.connect = deny;
dgram.createSocket = deny;
for (const name of Object.keys(dns)) {
  if (name === 'lookup' || name.startsWith('resolve') || name === 'reverse') dns[name] = deny;
}
for (const name of Object.keys(dns.promises)) {
  if (name === 'lookup' || name.startsWith('resolve') || name === 'reverse') dns.promises[name] = deny;
}
childProcess.exec = childProcess.execSync = childProcess.execFile = childProcess.execFileSync = deny;
childProcess.spawn = childProcess.spawnSync = childProcess.fork = deny;
syncBuiltinESMExports();
