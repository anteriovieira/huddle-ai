import { readFile, writeFile } from 'node:fs/promises';
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/sidepanel/main.jsx'],
  outfile: 'extension/sidepanel.js',
  bundle: true,
  format: 'esm',
  target: 'chrome116',
  jsx: 'automatic',
  // Production builds use React's production build (smaller, faster, and no StrictMode
  // double-invocation of renders/effects); watch keeps the dev build for warnings.
  define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
};

// Each build bumps the patch version in manifest.json and package.json, so the
// version shown in the side panel tells which build Chrome has loaded.
async function bumpVersion() {
  const manifestPath = 'extension/manifest.json';
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const [major = 0, minor = 0, patch = 0] = manifest.version.split('.').map(Number);
  const version = `${major}.${minor}.${patch + 1}`;
  manifest.version = version;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  pkg.version = version;
  await writeFile('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`version ${version}`);
}

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
} else {
  await bumpVersion();
  await esbuild.build(options);
}
