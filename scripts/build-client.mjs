// Build the browser client half into lib/client.js.
//
// The output is CJS wrapped in DSH's ModuleLoader:
//   window.__ModuleLoader__.load({ id: "context-distiller", factory: (require) => { ... } })
//
// React / react-dom are external (provided by the platform at runtime).
// Run: node scripts/build-client.mjs
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

mkdirSync('lib', { recursive: true });

// 1) Bundle to a temporary CJS string.
const result = await build({
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  outfile: 'lib/.client-raw.js',
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
  ],
  sourcemap: false,
  write: false,
  logLevel: 'info',
});

// 2) Wrap in ModuleLoader and write the final lib/client.js.
const rawCode = result.outputFiles[0].text;
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const pluginId = pkg.name;

const wrapped = `/* context-distiller client bundle — built ${new Date().toISOString()} */
window.__ModuleLoader__.load({ id: ${JSON.stringify(pluginId)}, factory: function (require) {
  var module = { exports: {} };
  var exports = module.exports;
${rawCode}
  return module.exports;
} });
`;

writeFileSync('lib/client.js', wrapped, 'utf8');
console.log('[build:client] lib/client.js ready');
