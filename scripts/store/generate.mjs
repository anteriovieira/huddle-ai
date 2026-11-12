// Regenerates the Chrome Web Store promo images in docs/store/ (English).
//
// It runs the real side-panel UI (the same React components the extension ships) against a seeded
// English demo session, screenshots each tab, and composes the marketing frames around those shots.
// insights.js is swapped for a no-network stub and format.js/minutes.js get English date/relative-time
// helpers (see scripts/store/shims/*), so nothing here calls a model and the UI reads fully in English.
//
// Usage: node scripts/store/generate.mjs
// Requires: deps installed (npm install), Playwright's chromium, and `convert` (ImageMagick) for the
// final 24-bit flatten. Fonts (Lato) are downloaded once into the build cache.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import * as esbuild from 'esbuild';
import { makeState } from './demo-data.mjs';
import { COPY } from './copy.mjs';

const execFileP = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const require = createRequire(import.meta.url);

// Playwright ships with this environment's global toolchain, not in the repo's node_modules.
async function loadChromium() {
  for (const anchor of [import.meta.url, '/opt/node-tools/', '/usr/lib/node_modules/']) {
    try {
      const resolved = createRequire(anchor).resolve('playwright');
      const mod = await import(pathToFileURL(resolved));
      return mod.chromium ?? mod.default?.chromium;
    } catch {
      /* try the next anchor */
    }
  }
  return (await import('playwright')).chromium;
}
const chromium = await loadChromium();

const buildDir = path.join(repoRoot, 'node_modules', '.store-build');
const assetsDir = path.join(buildDir, 'assets');
const outDir = path.join(repoRoot, 'docs', 'store');

const PANEL_W = 420; // CSS width the app renders at (single-column layout); downscaled into the tiles
// Two capture heights, both rendered at PANEL_W and shown top-cropped into the 376×698 tile window:
//  - SHORT ≈ the window height, so the whole viewport fits — used for Captions, whose feed anchors to
//    the live line and its "Following live" pill at the bottom.
//  - TALL pushes the sticky footer below the crop, so Insights/Minutes show the top of a long scroll
//    (cards, meeting info … key points) exactly like the shipped tiles.
const PANEL_H_SHORT = Math.round((698 * PANEL_W) / 376); // ~780
const PANEL_H_TALL = 980;
const SCALE = 2; // deviceScaleFactor for crisp downscaled panels

const exists = (p) => access(p).then(() => true).catch(() => false);

// Lato 400/700/900, downloaded once and self-hosted (Playwright's chromium has no proxy for
// fonts.gstatic.com). Returns the @font-face CSS pointing at the local woff2 files.
async function ensureFonts() {
  await mkdir(assetsDir, { recursive: true });
  const cssPath = path.join(assetsDir, 'lato.css');
  if (await exists(cssPath)) return readFile(cssPath, 'utf8');
  const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
  const { stdout } = await execFileP('curl', [
    '-s', '-A', ua,
    'https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap',
  ]);
  let css = stdout;
  const urls = [...css.matchAll(/https:\/\/[^) ]+\.woff2/g)].map((m) => m[0]);
  for (const url of urls) {
    const name = createHash('sha1').update(url).digest('hex').slice(0, 12) + '.woff2';
    await execFileP('curl', ['-s', '-A', ua, url, '-o', path.join(assetsDir, name)]);
    css = css.split(url).join(`./assets/${name}`);
  }
  await writeFile(cssPath, css);
  return css;
}

// Bundle the real side panel, with insights/format/minutes swapped for the screenshot shims.
async function buildApp() {
  const shimDir = path.join(here, 'shims');
  const shimPlugin = {
    name: 'store-shims',
    setup(b) {
      b.onResolve({ filter: /(^|\/)(insights|format|minutes)\.js$/ }, (args) => {
        const importer = args.importer.replace(/\\/g, '/');
        if (importer.includes('/scripts/store/shims/')) return undefined; // a shim importing the real module
        return { path: path.join(shimDir, path.basename(args.path)) };
      });
    },
  };
  await esbuild.build({
    entryPoints: [path.join(repoRoot, 'src/sidepanel/main.jsx')],
    outfile: path.join(buildDir, 'sidepanel.js'),
    bundle: true,
    format: 'esm',
    target: 'chrome116',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    minify: true,
    sourcemap: false,
    logLevel: 'warning',
    plugins: [shimPlugin],
  });
  await copyFile(path.join(repoRoot, 'extension/sidepanel.css'), path.join(buildDir, 'sidepanel.css'));
  await writeFile(
    path.join(buildDir, 'index.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<link rel="stylesheet" href="./assets/lato.css" />
<link rel="stylesheet" href="./sidepanel.css" /></head>
<body><div id="app" class="app"></div><script type="module" src="./sidepanel.js"></script></body></html>`,
  );
}

// The chrome.* stub + seeded storage, installed before the app module runs.
function initScript(state) {
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const store = { session: clone(state.session), local: clone(state.local) };
  const area = (bag) => ({
    async get(keys) {
      if (keys == null) return clone(bag);
      if (typeof keys === 'string') return keys in bag ? { [keys]: clone(bag[keys]) } : {};
      if (Array.isArray(keys)) {
        const o = {};
        for (const k of keys) if (k in bag) o[k] = clone(bag[k]);
        return o;
      }
      const o = {};
      for (const k of Object.keys(keys)) o[k] = k in bag ? clone(bag[k]) : keys[k];
      return o;
    },
    async set(obj) {
      Object.assign(bag, clone(obj));
    },
    async remove(keys) {
      for (const k of [].concat(keys)) delete bag[k];
    },
  });
  window.chrome = {
    runtime: {
      getManifest: () => ({ version: state.version }),
      sendMessage: async () => {},
      lastError: null,
      id: 'huddle-ai-demo',
    },
    storage: {
      session: area(store.session),
      local: area(store.local),
      onChanged: { addListener() {}, removeListener() {} },
    },
    tabs: { query: async () => [], sendMessage: async () => ({ ok: true }), get: async () => ({}), update: async () => {} },
    windows: { update: async () => {} },
    identity: {
      getAuthToken: async () => {
        throw new Error('not connected');
      },
      getProfileUserInfo: async () => ({ email: '' }),
      removeCachedAuthToken: async () => {},
    },
  };
}

// ES module scripts can't load over file:// (CORS); serve the build dir over http instead.
function serve(dir) {
  const MIME = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
  };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(dir, rel);
    if (!file.startsWith(dir)) {
      res.writeHead(403).end();
      return;
    }
    res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    createReadStream(file)
      .on('error', () => res.writeHead(404).end())
      .pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function capturePanels(browser, baseUrl) {
  const now = Date.now();
  const state = makeState(now);
  const manifest = JSON.parse(await readFile(path.join(repoRoot, 'extension/manifest.json'), 'utf8'));
  state.version = manifest.version;

  const context = await browser.newContext({
    viewport: { width: PANEL_W, height: PANEL_H_TALL },
    deviceScaleFactor: SCALE,
  });
  await context.addInitScript(initScript, state);
  const page = await context.newPage();
  await page.goto(baseUrl + '/index.html');
  await page.waitForSelector('nav.tabs .tab', { timeout: 15000 });
  await page.waitForTimeout(1200); // let the first (stubbed) analysis settle into the countdown

  const shots = {};

  // Insights: expand the topic timeline so the "What happened so far" stack matches the shipped tile.
  await page.setViewportSize({ width: PANEL_W, height: PANEL_H_TALL });
  await page.getByRole('tab', { name: 'Insights' }).click();
  await page.waitForTimeout(150);
  await page.locator('button.topic__head').first().click().catch(() => {});
  await page.locator('[aria-label="Hide latest captions"]').first().click().catch(() => {});
  await page.waitForTimeout(250);
  shots.insights = await page.screenshot();

  // Captions: render at the window height so the full feed and the "Following live" pill are visible.
  await page.setViewportSize({ width: PANEL_W, height: PANEL_H_SHORT });
  await page.getByRole('tab', { name: 'Captions' }).click();
  await page.waitForTimeout(500);
  shots.captions = await page.screenshot();

  await page.setViewportSize({ width: PANEL_W, height: PANEL_H_TALL });
  await page.getByRole('tab', { name: 'Minutes' }).click();
  await page.waitForTimeout(400);
  shots.minutes = await page.screenshot();

  // Analytics: the scored-meeting dashboard (radar, criteria, strengths, per participant).
  await page.setViewportSize({ width: PANEL_W, height: PANEL_H_TALL });
  await page.getByRole('tab', { name: 'Analytics' }).click();
  await page.waitForTimeout(400);
  shots.analytics = await page.screenshot();

  await context.close();
  return shots;
}

const dataUri = (buf) => 'data:image/png;base64,' + buf.toString('base64');

function frameCss(fonts) {
  return `${fonts}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%}
body{font-family:Lato,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden}
.frame{position:relative;width:100%;height:100%;overflow:hidden;
  background:
    radial-gradient(130% 120% at 100% 0%, rgba(43,172,118,.17) 0%, rgba(43,172,118,0) 46%),
    radial-gradient(120% 120% at 0% 100%, rgba(29,155,209,.13) 0%, rgba(29,155,209,0) 52%),
    linear-gradient(135deg,#1b1f23 0%,#15181b 60%,#121417 100%);}
.copy{position:absolute;display:flex;flex-direction:column;gap:22px}
.brand{display:flex;align-items:center;gap:14px}
.brand img{width:44px;height:44px;border-radius:10px;display:block}
.brand span{font-size:26px;font-weight:800;color:#f5f7f8;letter-spacing:-.3px}
.badge{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;
  padding:5px 14px;border-radius:999px;font-size:13px;font-weight:700;letter-spacing:.2px;
  color:#4fd79b;background:rgba(43,172,118,.10);border:1px solid rgba(43,172,118,.45)}
.badge.live::before{content:"";width:8px;height:8px;border-radius:50%;background:#2bbd82;
  box-shadow:0 0 0 4px rgba(43,189,130,.18)}
h1{font-weight:900;color:#f6f8f9;letter-spacing:-1.4px}
h1 .g{color:#2cbd82}
.sub{color:#aab0b5;font-weight:400}
.bullets{list-style:none;display:flex;flex-direction:column;gap:13px;margin-top:4px}
.bullets li{display:flex;align-items:center;gap:12px;color:#d6dadd;font-size:17px}
.bullets li::before{content:"";width:7px;height:7px;border-radius:50%;background:#2cbd82;flex:0 0 auto}
.panel{position:absolute;overflow:hidden;border-radius:16px;border:1px solid rgba(255,255,255,.08);
  box-shadow:0 30px 70px -20px rgba(0,0,0,.55),0 8px 24px -8px rgba(0,0,0,.4)}
.panel img{display:block;width:100%;height:100%;object-fit:cover;object-position:top center}`;
}

// A marketing frame (insights/captions/ata): left copy column + one panel on the right.
async function renderTile(page, { fonts, icon, copy, panel }) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${frameCss(fonts)}
.copy{left:72px;top:50%;transform:translateY(-50%);width:452px}
h1{font-size:54px;line-height:1.04}
.sub{font-size:20px;line-height:1.42;max-width:430px}
.panel{top:51px;left:748px;width:376px;height:698px}
</style></head><body><div class="frame">
<div class="copy">
  <div class="brand"><img src="${icon}"><span>Huddle AI</span></div>
  <span class="badge ${copy.live ? 'live' : ''}">${copy.badge}</span>
  <h1>${copy.h1}</h1>
  <p class="sub">${copy.sub}</p>
  <ul class="bullets">${copy.bullets.map((b) => `<li>${b}</li>`).join('')}</ul>
</div>
<div class="panel"><img src="${panel}"></div>
</div></body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  return page.screenshot();
}

async function renderMarquee(page, { fonts, icon, copy, front, back }) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${frameCss(fonts)}
.copy{left:88px;top:50%;transform:translateY(-50%);width:560px}
h1{font-size:58px;line-height:1.03}
.sub{font-size:21px;line-height:1.4;max-width:470px}
.panel{top:16px;height:600px;width:360px}
.panel.back{left:792px;opacity:.62;filter:saturate(.9) brightness(.82);transform:scale(.96);transform-origin:top center}
.panel.front{left:1016px;width:392px;box-shadow:0 40px 90px -24px rgba(0,0,0,.6),0 10px 30px -8px rgba(0,0,0,.45)}
</style></head><body><div class="frame">
<div class="copy">
  <div class="brand"><img src="${icon}"><span>Huddle AI</span></div>
  <h1>${copy.h1}</h1>
  <p class="sub">${copy.sub}</p>
</div>
<div class="panel back"><img src="${back}"></div>
<div class="panel front"><img src="${front}"></div>
</div></body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  return page.screenshot();
}

async function renderSmall(page, { fonts, icon, copy }) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}
*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%}
body{font-family:Lato,Arial,sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden}
.frame{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:14px;text-align:center;padding:26px;
  background:radial-gradient(120% 120% at 30% 20%, rgba(43,189,130,.22) 0%, rgba(43,189,130,0) 60%),
    linear-gradient(150deg,#1f3a34 0%,#173029 55%,#14241f 100%)}
.frame img{width:72px;height:72px;border-radius:16px;box-shadow:0 12px 30px -8px rgba(0,0,0,.5)}
.frame h1{font-size:34px;font-weight:900;color:#fff;letter-spacing:-.5px}
.frame p{font-size:16px;color:#cfe3da;max-width:360px;line-height:1.4}
</style></head><body><div class="frame">
  <img src="${icon}"><h1>Huddle AI</h1><p>${copy.sub}</p>
</div></body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  return page.screenshot();
}

// Playwright screenshots are RGBA; the store wants 24-bit PNG (no alpha). Flatten in place.
// Prefer ImageMagick's `convert`; fall back to Python/Pillow when it is not installed.
async function flatten(file) {
  try {
    await execFileP('convert', [file, '-background', 'black', '-alpha', 'remove', '-alpha', 'off', file]);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    await execFileP('python3', [
      '-c',
      'import sys;from PIL import Image;f=sys.argv[1];im=Image.open(f).convert("RGBA");'
        + 'bg=Image.new("RGB",im.size,(0,0,0));bg.paste(im,mask=im.split()[3]);bg.save(f)',
      file,
    ]);
  }
}

async function main() {
  await mkdir(buildDir, { recursive: true });
  const fonts = await ensureFonts();
  await buildApp();

  const iconBuf = await readFile(path.join(repoRoot, 'extension/icons/icon128.png'));
  const icon = dataUri(iconBuf);

  const browser = await chromium.launch();
  const { server, port } = await serve(buildDir);
  const shots = await capturePanels(browser, `http://127.0.0.1:${port}`);
  server.close();
  const panels = {
    insights: dataUri(shots.insights),
    captions: dataUri(shots.captions),
    minutes: dataUri(shots.minutes),
    analytics: dataUri(shots.analytics),
  };

  const page = await browser.newPage();

  const tiles = [
    { name: 'insights', w: 1280, h: 800, copy: COPY.insights, panel: panels.insights },
    { name: 'captions', w: 1280, h: 800, copy: COPY.captions, panel: panels.captions },
    { name: 'ata', w: 1280, h: 800, copy: COPY.ata, panel: panels.minutes },
    { name: 'analytics', w: 1280, h: 800, copy: COPY.analytics, panel: panels.analytics },
  ];
  for (const tile of tiles) {
    await page.setViewportSize({ width: tile.w, height: tile.h });
    const buf = await renderTile(page, { fonts, icon, copy: tile.copy, panel: tile.panel });
    const file = path.join(outDir, `${tile.name}.png`);
    await writeFile(file, buf);
    await flatten(file);
    console.log('wrote', path.relative(repoRoot, file));
  }

  await page.setViewportSize({ width: 1400, height: 560 });
  const marquee = await renderMarquee(page, { fonts, icon, copy: COPY.marquee, front: panels.insights, back: panels.captions });
  await writeFile(path.join(outDir, 'marquee.png'), marquee);
  await flatten(path.join(outDir, 'marquee.png'));
  console.log('wrote', path.relative(repoRoot, path.join(outDir, 'marquee.png')));

  await page.setViewportSize({ width: 440, height: 280 });
  const small = await renderSmall(page, { fonts, icon, copy: COPY.small });
  await writeFile(path.join(outDir, 'small.png'), small);
  await flatten(path.join(outDir, 'small.png'));
  console.log('wrote', path.relative(repoRoot, path.join(outDir, 'small.png')));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
