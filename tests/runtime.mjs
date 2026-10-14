import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { once } from 'node:events';

const command = resolve(process.argv[2]);
const root = resolve(process.argv[3]);
const require = createRequire(join(root, 'package.json'));
const WebSocket = require('ws');
const temporary = mkdtempSync(join(tmpdir(), 'meshcommander-test-'));
const server = createServer(socket => socket.pipe(socket));
let child;
let output = '';
let websocket;
let sockets = new Set();
server.on('connection', socket => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
});

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

try {
  const relayPort = await listen(server);
  const probe = createServer();
  const port = await listen(probe);
  await new Promise(resolve => probe.close(resolve));
  const arguments_ = ['--port', String(port), '--debug'];
  if (process.argv[4]) arguments_.unshift(resolve(process.argv[4]));
  child = spawn(command, arguments_, {
    cwd: temporary,
    env: { ...process.env, HOME: temporary, XDG_CONFIG_HOME: temporary, XDG_CACHE_HOME: temporary },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  child.on('error', error => { output += error.stack; });

  const base = `http://127.0.0.1:${port}`;
  let response;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(child.exitCode, null, `Application exited during startup: ${output}`);
    try {
      response = await fetch(base, { redirect: 'manual', signal: AbortSignal.timeout(500) });
      break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
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

  websocket = new WebSocket(`ws://127.0.0.1:${port}/webrelay.ashx?host=127.0.0.1&port=${relayPort}&tls=0`);
  await once(websocket, 'open', { signal: AbortSignal.timeout(3000) });
  const expected = Buffer.from([0, 1, 65, 127, 128, 200, 255]);
  const message = once(websocket, 'message', { signal: AbortSignal.timeout(3000) });
  websocket.send(expected);
  const [actual, binary] = await message;
  assert(binary);
  assert.deepEqual(actual, expected, 'Binary bytes changed through the TCP relay');
  const closed = once(websocket, 'close', { signal: AbortSignal.timeout(3000) });
  websocket.close();
  await closed;
  // The old upgradeReq reference crashed the application on this path.
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(child.exitCode, null, `Application exited after relay close: ${output}`);
  assert.equal((await fetch(base, { signal: AbortSignal.timeout(3000) })).status, 200);
  assert.deepEqual(readdirSync(temporary), [], 'Application wrote unexpected local state');
  console.log('Installed command, HTTP assets, language redirect, binary loopback relay and close verified');
} catch (error) {
  console.error(output);
  throw error;
} finally {
  websocket?.terminate();
  if (child?.pid && child.exitCode === null) {
    const stopped = once(child, 'exit');
    child.kill('SIGTERM');
    await stopped;
  }
  for (const socket of sockets) socket.destroy();
  await new Promise(resolve => server.close(resolve));
  rmSync(temporary, { recursive: true, force: true });
}
