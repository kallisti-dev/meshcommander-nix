// Starts the installed command on loopback and checks HTTP, the language
// redirect, and the WebSocket relay to plain TCP and to TLS 1.2 limited to
// ECDHE key exchange, as newer Intel AMT firmware requires.
//
// usage: node runtime.mjs COMMAND PACKAGE_ROOT TLS_KEY TLS_CERTIFICATE
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { createServer as createTlsServer } from 'node:tls';
import { once } from 'node:events';

const [command, root, keyFile, certificateFile] = process.argv.slice(2).map((path) => resolve(path));
const require = createRequire(join(root, 'package.json'));
const WebSocket = require('ws');
const temporary = mkdtempSync(join(tmpdir(), 'meshcommander-test-'));
const sockets = new Set();
const track = (socket) => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
  socket.on('error', () => {});
  socket.pipe(socket);
};
const tcpEcho = createServer(track);
const tlsEcho = createTlsServer(
  {
    key: readFileSync(keyFile),
    cert: readFileSync(certificateFile),
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.2',
    ciphers: 'ECDHE-RSA-AES128-GCM-SHA256',
  },
  track,
);
let child;
let output = '';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

async function relay(base, query) {
  const websocket = new WebSocket(`${base.replace('http', 'ws')}/webrelay.ashx?host=127.0.0.1&${query}`);
  try {
    await once(websocket, 'open', { signal: AbortSignal.timeout(3000) });
    const expected = Buffer.from([0, 1, 65, 127, 128, 200, 255]);
    const message = once(websocket, 'message', { signal: AbortSignal.timeout(3000) });
    websocket.send(expected);
    const [actual, binary] = await message;
    assert(binary);
    assert.deepEqual(actual, expected, `Binary bytes changed through the relay (${query})`);
    const closed = once(websocket, 'close', { signal: AbortSignal.timeout(3000) });
    websocket.close();
    await closed;
  } finally {
    websocket.terminate();
  }
}

try {
  const tcpPort = await listen(tcpEcho);
  const tlsPort = await listen(tlsEcho);
  const probe = createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  child = spawn(command, ['--port', String(port), '--debug'], {
    cwd: temporary,
    env: { ...process.env, HOME: temporary, XDG_CONFIG_HOME: temporary, XDG_CACHE_HOME: temporary },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  child.on('error', (error) => { output += error.stack; });

  const base = `http://127.0.0.1:${port}`;
  let response;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(child.exitCode, null, `Application exited during startup: ${output}`);
    try {
      response = await fetch(base, { redirect: 'manual', signal: AbortSignal.timeout(500) });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert(response, `HTTP startup timed out: ${output}`);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/default.htm');
  const page = await fetch(`${base}/default.htm`, { signal: AbortSignal.timeout(3000) });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /MeshCommander/i);
  const german = await fetch(base, { redirect: 'manual', headers: { 'accept-language': 'de-DE' }, signal: AbortSignal.timeout(3000) });
  assert.equal(german.headers.get('location'), '/default-de.htm');

  await relay(base, `port=${tcpPort}&tls=0`);
  await relay(base, `port=${tlsPort}&tls=1`);
  // Closing a relay crashed the server while it used the removed upgradeReq API.
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(child.exitCode, null, `Application exited after relay close: ${output}`);
  assert.equal((await fetch(base, { signal: AbortSignal.timeout(3000) })).status, 200);
  assert.deepEqual(readdirSync(temporary), [], 'Application wrote unexpected local state');
  console.log('HTTP, language redirect, and TCP and ECDHE TLS relays verified');
} catch (error) {
  console.error(output);
  throw error;
} finally {
  if (child?.pid && child.exitCode === null) {
    const stopped = once(child, 'exit');
    child.kill('SIGTERM');
    await stopped;
  }
  for (const socket of sockets) socket.destroy();
  await Promise.all([tcpEcho, tlsEcho].map((server) => new Promise((resolve) => server.close(resolve))));
  rmSync(temporary, { recursive: true, force: true });
}
