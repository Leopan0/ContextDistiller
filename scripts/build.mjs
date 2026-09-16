// Bundle the Node half into a single ESM file at lib/index.js.
//
// `packages: 'external'` leaves every node_modules import external:
//   - schemastery is a real runtime dependency (declared in package.json and
//     installed with the plugin);
//   - @deepseek-ai/* and @dsh-plugin/* are type-only in this plugin and are
//     erased by esbuild, so they never appear in the output.
//
// Run: node scripts/build.mjs
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('lib', { recursive: true });

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'lib/index.js',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info'
});

console.log('[build] lib/index.js ready');
