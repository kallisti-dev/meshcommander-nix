import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';

const root = resolve(process.argv[2]);
const require = createRequire(join(root, 'package.json'));
assert.equal(require('express-ws/package.json').version, '5.0.2');
assert.equal(require('ws/package.json').version, '8.22.0');
const server = readFileSync(join(root, 'webserver.js'), 'utf8');
assert(!server.includes('upgradeReq'), 'Obsolete ws upgradeReq API remains');
assert(!readFileSync(join(root, 'meshcommander.js'), 'utf8').includes('npm install'), 'Runtime package installation remains');
assert(existsSync(join(root, 'public/default.htm')));
assert(existsSync(join(root, 'LICENSE')));
console.log('Installed source, dependencies, web assets and license verified');
