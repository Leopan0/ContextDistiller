// Zero-dependency consistency gate for context-distiller.
// Verifies the packaging contracts that cause load failures when wrong:
//   - package.json required fields / exports / dsh.bundle.patch / files
//   - cordis.patch.yml insert id+name == package name
//   - src/index.ts exports inject + apply
// Run: node scripts/gates/run.mjs   (exit 1 on failure)
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const failures = [];
const ok = (cond, msg) => {
  if (!cond) failures.push(msg);
};

// --- package.json ---
const pkgPath = join(root, 'package.json');
ok(existsSync(pkgPath), 'package.json missing');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const name = pkg.name;

ok(typeof name === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(name), `invalid package name: ${name}`);
ok(pkg.type === 'module', 'package.json#type must be "module"');
ok(pkg.main === 'lib/index.js', 'package.json#main must be lib/index.js');
ok(pkg.exports?.['.'] != null, 'exports["."] required');
ok(pkg.exports?.['./package.json'] === './package.json', 'exports["./package.json"] required');
ok(
  pkg.exports?.['./cordis.patch.yml'] === './cordis.patch.yml',
  'exports["./cordis.patch.yml"] required for bundle form'
);
ok(pkg.dsh?.bundle?.patch === './cordis.patch.yml', 'dsh.bundle.patch must point to ./cordis.patch.yml');
// bundle-client contract: client export + platform
ok(pkg.exports?.['./client'] === './lib/client.js', 'exports["./client"] must be ./lib/client.js');
ok(pkg.dsh?.client?.platform === 'web', 'dsh.client.platform must be "web"');
ok(Array.isArray(pkg.files) && pkg.files.includes('lib'), 'files must include "lib"');
ok(
  Array.isArray(pkg.files) && pkg.files.includes('cordis.patch.yml'),
  'files must include "cordis.patch.yml"'
);

// --- cordis.patch.yml ---
const patchPath = join(root, 'cordis.patch.yml');
ok(existsSync(patchPath), 'cordis.patch.yml missing');
if (existsSync(patchPath)) {
  const patch = readFileSync(patchPath, 'utf8');
  ok(new RegExp(`id:\\s*${name}\\b`).test(patch), `patch insert id must equal "${name}"`);
  ok(new RegExp(`name:\\s*${name}\\b`).test(patch), `patch insert name must equal "${name}"`);
}

// --- src/index.ts ---
const entryPath = join(root, 'src', 'index.ts');
ok(existsSync(entryPath), 'src/index.ts missing');
if (existsSync(entryPath)) {
  const entry = readFileSync(entryPath, 'utf8');
  ok(/export\s+const\s+inject\s*=/.test(entry), 'src/index.ts must export `inject`');
  ok(/export\s+function\s+apply\s*\(/.test(entry), 'src/index.ts must export `apply`');
  // No runtime @deepseek-ai imports allowed (type-only imports are erased).
  const badRuntimeImport = /^import\s+(?!type\b)[^\n]*from\s+['"]@deepseek-ai\//m.test(entry);
  ok(!badRuntimeImport, 'src/index.ts must not runtime-import @deepseek-ai/* (use import type)');
}

// --- src/client/index.ts (client half) ---
const clientPath = join(root, 'src', 'client', 'index.ts');
ok(existsSync(clientPath), 'src/client/index.ts missing (bundle-client requires client half)');
if (existsSync(clientPath)) {
  const client = readFileSync(clientPath, 'utf8');
  ok(/export\s+const\s+inject\s*=/.test(client), 'src/client/index.ts must export `inject`');
  ok(/export\s+function\s+apply\s*\(/.test(client), 'src/client/index.ts must export `apply`');
}

if (failures.length > 0) {
  console.error('GATE FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('GATE PASSED: package/patch/entry contracts are consistent');
