// Applied identically by Nix and the non-Nix source preparation command.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const root = process.argv[2];
assert(root, 'Usage: node scripts/patch-source.mjs SOURCE_DIRECTORY');
const manifestPath = join(root, 'package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
assert.equal(manifest.name, 'meshcommander');
assert.equal(manifest.version, '0.9.5-a');
assert.equal(manifest.dependencies['express-ws'], '^2.0.0');
manifest.dependencies['express-ws'] = '5.0.2';
manifest.overrides = { ws: '8.22.0' };
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

const serverPath = join(root, 'webserver.js');
let server = readFileSync(serverPath, 'utf8');
function replaceOnce(before, after) {
  assert.equal(server.split(before).length, 2, `Expected one occurrence: ${before}`);
  server = server.replace(before, after);
}
// ws >= 3 removed upgradeReq; keep the route's request in the close closure.
replaceOnce("ws.on('close', function (req)", "ws.on('close', function ()");
replaceOnce('ws.upgradeReq.query.host', 'req.query.host');
replaceOnce('ws.upgradeReq.query.port', 'req.query.port');
writeFileSync(serverPath, server);

// A packaged application must never try npm install at runtime.
const mainPath = join(root, 'meshcommander.js');
let main = readFileSync(mainPath, 'utf8');
const start = main.indexOf('function InstallModules(');
assert(start > 0);
assert(main.endsWith("InstallModules(['minimist', 'express', 'express-ws'], function () { CreateMeshCommanderServer().Start(); });"));
main = main.slice(0, start) + 'CreateMeshCommanderServer().Start();\n';
writeFileSync(mainPath, main);
