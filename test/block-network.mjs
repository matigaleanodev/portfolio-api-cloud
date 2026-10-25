import { syncBuiltinESMExports } from 'node:module';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import dns from 'node:dns';
import childProcess from 'node:child_process';

const deny = () => {
  throw new Error('Red y proveedores reales bloqueados en tests');
};

globalThis.fetch = async () => deny();
globalThis.WebSocket = class {
  constructor() {
    deny();
  }
};

http.request = deny;
http.get = deny;
https.request = deny;
https.get = deny;

net.connect = deny;
net.createConnection = deny;
net.Socket.prototype.connect = deny;
tls.connect = deny;
dgram.createSocket = deny;

for (const name of Object.keys(dns)) {
  if (name === 'lookup' || name.startsWith('resolve') || name === 'reverse') {
    dns[name] = deny;
  }
}

for (const name of Object.keys(dns.promises)) {
  if (name === 'lookup' || name.startsWith('resolve') || name === 'reverse') {
    dns.promises[name] = deny;
  }
}

childProcess.exec = deny;
childProcess.execSync = deny;
childProcess.execFile = deny;
childProcess.execFileSync = deny;
childProcess.spawn = deny;
childProcess.spawnSync = deny;
childProcess.fork = deny;

syncBuiltinESMExports();
