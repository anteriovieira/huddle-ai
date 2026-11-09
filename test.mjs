// Transforms the test files (JSX + relative imports) with esbuild into .test-build/,
// leaving npm packages external so Node resolves React/jsdom from node_modules, then runs
// them through Node's built-in test runner.
import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import * as esbuild from 'esbuild';

const outdir = '.test-build';
rmSync(outdir, { recursive: true, force: true });

// Redirects App.jsx's `./insights.js` import to a network-free test double so the chat test
// can drive the UI deterministically.
const mockInsights = {
  name: 'mock-insights',
  setup(build) {
    const mockPath = resolve('test/mocks/insights.mock.js');
    build.onResolve({ filter: /insights\.js$/ }, (args) => {
      if (args.importer.replace(/\\/g, '/').includes('/src/sidepanel/')) return { path: mockPath };
      return null;
    });
  },
};

await esbuild.build({
  entryPoints: ['test/lib.test.js', 'test/components.test.jsx', 'test/app.test.jsx', 'test/chat.test.jsx', 'test/thread.test.js', 'test/scanner.test.js'],
  outdir,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  jsx: 'automatic',
  packages: 'external',
  sourcemap: 'inline',
  plugins: [mockInsights],
  logLevel: 'info',
});

const files = readdirSync(outdir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => `${outdir}/${f}`);

const result = spawnSync('node', ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
