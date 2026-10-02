// Zero-dependency consistency gate for context-distiller.
// Verifies the packaging contracts that cause load failures when wrong:
//   - package.json required fields / exports / dsh.bundle.patch / files
//   - plugin display metadata: top-level `icon` + locale/<lang>.json meta
//   - cordis.patch.yml insert id+name == package name
//   - src/index.ts exports inject + apply
// Run: node scripts/gates/run.mjs   (exit 1 on failure)
import { readFileSync, existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, extname, isAbsolute } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const failures = [];
const ok = (cond, msg) => {
  if (!cond) failures.push(msg);
};

/**
 * Does a package.json#files entry publish `relativePath`? An exact path, a bare
 * directory, and a directory glob all ship the file; anything else does not.
 */
const ships = (entry, relativePath) => {
  if (typeof entry !== 'string') return false;
  const raw = entry.replace(/^\.\//, '');
  const target = relativePath.replace(/^\.\//, '');
  if (raw === target) return true;
  const base = raw.replace(/\/\*\*?.*$/, '').replace(/\/$/, '');
  return base !== '' && target.startsWith(`${base}/`);
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

// --- plugin display metadata: icon + locale ---
// dsh's lib/types/package-meta.js reads a top-level `icon` (manifest-relative
// SVG/PNG/JPEG/WebP, at most 256 KiB, still inside the manifest directory after
// realpath) plus locale/<language>.json `meta.title` / `meta.description`,
// resolving both through package.json#exports without evaluating plugin code.
// Failures here never break the plugin — they silently degrade the Plugin
// Manager card — so they are gated rather than left to be noticed by eye.
const ICON_EXTENSIONS = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp']);
const MAX_ICON_BYTES = 256 * 1024;

ok(
  typeof pkg.icon === 'string' && pkg.icon.trim() !== '',
  'package.json#icon must be a non-empty string'
);
if (typeof pkg.icon === 'string' && pkg.icon.trim() !== '') {
  const icon = pkg.icon;
  ok(!isAbsolute(icon) && !/^[A-Za-z][A-Za-z\d+.-]*:/u.test(icon),
    `package.json#icon must be a relative file path (got ${icon})`);
  ok(ICON_EXTENSIONS.has(extname(icon).toLowerCase()),
    `package.json#icon must be SVG, PNG, JPEG or WebP (got ${icon})`);
  const iconPath = resolve(root, icon);
  ok(existsSync(iconPath), `package.json#icon target is missing: ${icon}`);
  if (existsSync(iconPath)) {
    ok(statSync(iconPath).isFile(), `package.json#icon target must be a regular file: ${icon}`);
    ok(statSync(iconPath).size <= MAX_ICON_BYTES, `package.json#icon target exceeds 256 KiB: ${icon}`);
    const local = relative(root, realpathSync(iconPath));
    ok(!local.startsWith('..') && !isAbsolute(local),
      `package.json#icon must stay inside the package directory: ${icon}`);
    ok(Array.isArray(pkg.files) && pkg.files.some((entry) => ships(entry, icon)),
      `files must ship the icon, or the published package renders no card art (${icon})`);
  }
}

ok(
  Object.keys(pkg.exports ?? {}).some((key) => key.startsWith('./locale/')),
  'exports must expose ./locale/*.json so dsh can read plugin display text'
);
ok(Array.isArray(pkg.files) && pkg.files.some((entry) => ships(entry, 'locale/en.json')),
  'files must ship locale/*.json, or the published package renders no display text');

const localeDir = join(root, 'locale');
const LANGUAGE_FILE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*\.json$/;
ok(existsSync(localeDir), 'locale/ directory is missing (plugin display text)');
if (existsSync(localeDir)) {
  const localeFiles = readdirSync(localeDir).filter((file) => file.endsWith('.json'));
  ok(localeFiles.includes('en.json'), 'locale/en.json is required as the English fallback');
  for (const file of localeFiles) {
    ok(LANGUAGE_FILE.test(file), `locale/${file} must be named after a language id`);
    try {
      const meta = JSON.parse(readFileSync(join(localeDir, file), 'utf8')).meta;
      ok(typeof meta?.title === 'string' && meta.title.trim() !== '',
        `locale/${file}: meta.title must be a non-empty string`);
      ok(typeof meta?.description === 'string' && meta.description.trim() !== '',
        `locale/${file}: meta.description must be a non-empty string`);
    } catch (error) {
      failures.push(`locale/${file} must be JSON with a meta block: ${error.message}`);
    }
  }
}

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
