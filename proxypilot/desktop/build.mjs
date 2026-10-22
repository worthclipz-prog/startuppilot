// Bundles the Electron main process (desktop/main.ts + src/) into one CommonJS file. Playwright stays
// external: it ships its own runtime files and must be loaded from node_modules.
import { build } from 'esbuild';

await build({
  entryPoints: ['desktop/main.ts'],
  outfile: 'dist/desktop.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron', 'playwright', 'playwright-core'],
  // src/ is ESM and uses import.meta.url to find public/ and node_modules; give CommonJS an equivalent.
  define: { 'import.meta.url': 'importMetaUrl' },
  banner: { js: "const importMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
  legalComments: 'none',
  logLevel: 'warning',
});
