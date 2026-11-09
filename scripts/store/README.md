# Chrome Web Store images

Regenerates the promo images in [`docs/store/`](../../docs/store/) — the assets submitted to the
Chrome Web Store (see [`docs/chrome-web-store.md`](../../docs/chrome-web-store.md) §7), in **English**:

| File | Size | Content |
|---|---|---|
| `insights.png` | 1280×800 | Marketing copy + the Insights tab |
| `captions.png` | 1280×800 | Marketing copy + the Captions tab |
| `ata.png` | 1280×800 | Marketing copy + the Minutes tab |
| `marquee.png` | 1400×560 | Marquee promo tile (two panels) |
| `small.png` | 440×280 | Small promo tile |

## How it works

The panels on the right are the **real** side-panel UI — the same React components the extension
ships — rendered against a seeded English demo session (a fictional huddle about a billing gateway
migration; no real meeting data). The marketing frames are composed around those screenshots.

To keep it offline and fully English, the build swaps three modules for screenshot-only shims
([`shims/`](./shims)):

- `insights.js` → a no-network stub, so no AI model is ever called;
- `format.js` → English relative-time (`3 min ago`) and date helpers (the app ships pt-BR ones);
- `minutes.js` → widens the classification color map to the English category names.

`demo-data.mjs` holds the seeded session, `copy.mjs` the headline/bullet copy.

## Regenerate

```bash
npm install
node scripts/store/generate.mjs
```

Requires Playwright's Chromium and ImageMagick (`convert`, for the 24-bit flatten the store wants).
Lato is downloaded once into `node_modules/.store-build/assets/`. Nothing in `src/` is modified.
