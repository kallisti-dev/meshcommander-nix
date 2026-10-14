import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const repo = fileURLToPath(new URL('../', import.meta.url));
const destination = resolve(process.argv[2] || join(repo, 'work'));
assert(!existsSync(destination), `Destination already exists: ${destination}`);
const temporary = mkdtempSync(join(tmpdir(), 'meshcommander-source-'));
try {
  const response = await fetch('https://registry.npmjs.org/meshcommander/-/meshcommander-0.9.5-a.tgz');
  assert(response.ok, `Download failed: ${response.status}`);
  const source = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(source).digest('base64'), 'NbF/MAFGg0bRSjEmKuQAiIN6LG5RccCl1gNqFDbJsPU=');
  const archive = join(temporary, 'source.tgz');
  writeFileSync(archive, source);
  execFileSync('tar', ['-xzf', archive, '-C', temporary]);
  execFileSync(process.execPath, [join(repo, 'scripts/patch-source.mjs'), join(temporary, 'package')]);
  mkdirSync(destination, { recursive: true });
  cpSync(join(temporary, 'package'), destination, { recursive: true });
  if (existsSync(join(repo, 'package-lock.json'))) cpSync(join(repo, 'package-lock.json'), join(destination, 'package-lock.json'));
  console.log(`Prepared ${destination}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
