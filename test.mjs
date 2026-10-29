// Transforms the test files (JSX + relative imports) with esbuild into .test-build/,
// leaving npm packages external so Node resolves React/jsdom from node_modules, then runs
// them through Node's built-in test runner.
import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import * as esbuild from 'esbuild';

const outdir = '.test-build';
rmSync(outdir, { recursive: true, force: true });

await esbuild.build({
  entryPoints: ['test/lib.test.js', 'test/components.test.jsx', 'test/app.test.jsx'],
  outdir,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  jsx: 'automatic',
  packages: 'external',
  sourcemap: 'inline',
  logLevel: 'info',
});

const files = readdirSync(outdir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => `${outdir}/${f}`);

const result = spawnSync('node', ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
