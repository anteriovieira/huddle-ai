# Chrome Web Store submission — Huddle AI

Ready-to-paste texts and the review-team justifications for submitting the extension to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). English version of [`chrome-web-store.md`](./chrome-web-store.md).

> One-line summary: the extension reads the live captions of a Slack huddle and, in the Chrome side panel, generates insights, a transcript and minutes using an AI model with the user's own API key. No data passes through the developer's servers.

---

## 1. Single purpose

The Chrome Web Store requires a single, narrow purpose.

**Text to paste:**

> Huddle AI has a single purpose: to assist Slack voice meetings (huddles) on the web. It reads the huddle's live captions and, in the Chrome side panel, shows insights from the conversation, a per-participant transcript and minutes at the end — processed by an AI provider the user chooses, with the user's own API key.

---

## 2. Permissions — justifications

Paste each justification into the matching field in the dashboard. These are exactly the permissions declared in [`extension/manifest.json`](../extension/manifest.json).

### `sidePanel`
> The extension's entire interface lives in the Chrome side panel (`side_panel`). The permission is required to open and render that panel next to the Slack tab.

### `storage`
> Stores the user's settings locally (API key, model, language, preferences), the ongoing huddle and its captions (`chrome.storage.session`), and the history of ended sessions with their minutes (`chrome.storage.local`). None of this data leaves the browser through the extension.

### `identity`
> Used **only** when the user chooses to send minutes to Google Drive. It obtains an OAuth token via `chrome.identity.getAuthToken` with the `drive.file` scope, which grants access solely to files the extension itself creates. It also reads the account email (`getProfileUserInfo`) to show which account is connected. It is optional: without using Drive, the permission is never triggered.

### `scripting`
> Allows injecting and coordinating the caption-reading scripts in the Slack tab (`app.slack.com`) from the service worker, including re-injecting after a tab reload, so caption capture works reliably.

### Content scripts on `app.slack.com`
> The extension registers content scripts that run only on `https://app.slack.com/*`. Slack opens the huddle window as an `about:blank` popup rendered from the main tab; Chrome does not run content scripts in that popup, so `page-hook.js` runs in the page's own JS world (`world: MAIN`) to reach it via `window.open`. `scanner.js` locates the captions panel and extracts `{ participant, text }`, and `content.js` (isolated world) bridges to the service worker. They only read the captions DOM — they do not modify Slack.

---

## 3. Host permissions — justifications

The origins in `host_permissions` split into **the origin that is read** (Slack) and **the AI call destinations**. Each AI call goes straight from the browser to the provider, with the user's key.

| Origin | Why |
|---|---|
| `https://app.slack.com/*` | Where the huddle and its captions live. The extension reads the captions from this tab. |
| `https://api.anthropic.com/*` | Call destination when the user picks a **Claude (Anthropic)** model. |
| `https://api.openai.com/*` | Destination when the user picks an **OpenAI** model. |
| `https://generativelanguage.googleapis.com/*` | Destination when the user picks a **Google Gemini** model. |
| `https://api.groq.com/*` | Destination when the user picks **Groq**. |
| `https://openrouter.ai/*` | Destination when the user picks **OpenRouter**. |
| `https://api.cerebras.ai/*` | Destination when the user picks **Cerebras**. |
| `https://api.mistral.ai/*` | Destination when the user picks **Mistral**. |
| `https://www.googleapis.com/*` | Optional upload of the minutes to **Google Drive** (`drive.file` scope). |

**Text to paste (host-permissions summary):**

> `app.slack.com` is the origin the extension reads the huddle captions from. The other origins are the endpoints of the AI providers (Anthropic, OpenAI, Google, Groq, OpenRouter, Cerebras, Mistral) the transcript is sent to — directly from the browser, using the user's own API key — and `www.googleapis.com` is used only for the optional upload of the minutes to Google Drive. The extension only calls the provider the user has selected.

---

## 4. Remote code

**Text to paste:**

> The extension does **not** use remote code. All JavaScript is bundled into the extension package (`extension/sidepanel.js`, produced by esbuild) and distributed within the submission itself. Network requests are only data requests (fetch) to the AI providers' APIs and to Google Drive; no script is downloaded and executed at runtime.

---

## 5. Data usage and privacy

Fill in the data declarations in the dashboard as below.

**What the extension processes:**
- **Huddle captions** (meeting content, including the participant names Slack displays).
- **AI provider API key**, entered by the user.
- **Settings and session history** (minutes, transcripts, insights).

**Where it goes:**
- Captions are sent **directly from the browser to the AI provider the user chose**, authenticated with the user's key. There is no developer intermediary server.
- The minutes, **only if the user asks**, are uploaded to the user's own Google Drive (`drive.file` scope).
- Everything else stays in `chrome.storage` in the user's browser.

**Required declarations (check in the form):**
- ✅ The extension collects/transmits the user's *web content* (the captions) — sent to the AI provider under the user's control.
- ✅ The extension handles *authentication information* (the API key) — stored locally, never sent to the developer.
- ❌ Does **not** sell data to third parties.
- ❌ Does **not** use or transfer data for purposes unrelated to the single purpose.
- ❌ Does **not** use or transfer data to determine creditworthiness or for lending.
- ❌ No analytics collection by the developer; the extension has no backend.

**Privacy policy:** the dashboard requires a privacy-policy URL because the extension handles user content and an authentication key. Publish a page (e.g. `PRIVACY.md` in the repo via GitHub Pages) covering the points above. A draft lives in [`docs/privacy-policy.md`](./privacy-policy.md).

---

## 6. Store listing

| Field | Value to paste |
|---|---|
| **Name** | Huddle AI |
| **Summary (≤132 chars)** | Live insights, transcript and minutes for your Slack huddles — in the side panel, with your own AI key. |
| **Category** | **Workflow & Planning** (current store taxonomy). Alternative: **Communication**. |
| **Default listing language** | English |

> The summary above is 103 characters (limit 132). The store name is **Huddle AI** (the manifest `name` is also "Huddle AI").

**Detailed description (draft to paste):**

> Huddle AI follows your Slack huddles on the web and works while you talk.
>
> • **Live insights** — current topic, points raised, action items (with owner and due date), decisions and open questions, refreshed every few seconds.
> • **Per-participant transcript** — the huddle captions become a clean history, with action items flagged inline. Copy or download.
> • **Automatic minutes** — summary, decisions, next steps, open questions and risks at the end of the meeting. Export as Markdown, send to Google Drive or post to the thread.
>
> You use your own API key (Anthropic, OpenAI, Google Gemini, Groq, OpenRouter, Cerebras or Mistral). Nothing goes through our servers: captions go straight from your browser to the provider you choose, and the history is stored locally.
>
> How to use: open the panel, paste your API key in Settings, join a huddle in Slack and open the Captions tab.

---

## 7. Listing — account, contact and distribution

Fields in the **Account** tab and the **Privacy practices** / **Distribution** tabs of the dashboard.

| Field | Value to paste |
|---|---|
| **Developer contact email** | `anteriovieira@gmail.com` (must be verified in the dashboard) |
| **Website / homepage** (optional) | GitHub repository URL |
| **Support URL** (optional) | Repository issues page |
| **Privacy policy URL** | Required — see section 5 (publish `docs/privacy-policy.md` via GitHub Pages) |
| **Visibility** | Public (or **Unlisted** to test first) |
| **Distribution / regions** | All regions |
| **Price** | Free |
| **Contains ads** | No |
| **Mature content** | No |

---

## 8. Image assets

All generated, versioned and with verified dimensions. Formats the store accepts: 24-bit PNG or JPEG (no alpha channel on screenshots).

### Icons (inside the `.zip`, declared in `manifest.json`)

| Icon | Size | File | Where used |
|---|---|---|---|
| Icon 16 | 16×16 | [`extension/icons/icon16.png`](../extension/icons/icon16.png) | Toolbar / favicon |
| Icon 32 | 32×32 | [`extension/icons/icon32.png`](../extension/icons/icon32.png) | Toolbar (HiDPI screens) |
| Icon 48 | 48×48 | [`extension/icons/icon48.png`](../extension/icons/icon48.png) | `chrome://extensions` page |
| Icon 128 | 128×128 | [`extension/icons/icon128.png`](../extension/icons/icon128.png) | **Store icon** + install |

### Listing images (uploaded manually in the dashboard, **not** in the `.zip`)

| Asset | Required size | File | Required? |
|---|---|---|---|
| Screenshot 1 — Insights | 1280×800 | [`docs/store/insights.png`](./store/insights.png) | Yes (min. 1) |
| Screenshot 2 — Captions | 1280×800 | [`docs/store/captions.png`](./store/captions.png) | Recommended |
| Screenshot 3 — Minutes | 1280×800 | [`docs/store/ata.png`](./store/ata.png) | Recommended |
| Small promo tile | 440×280 | [`docs/store/small.png`](./store/small.png) | Optional |
| Marquee promo tile | 1400×560 | [`docs/store/marquee.png`](./store/marquee.png) | Optional |

The screenshots use sample data rendered with the real panel components (a fictional huddle about a billing-gateway migration). No real meeting data appears. Store minimum: 128×128 icon + at least 1 screenshot; the promo tiles are optional but recommended.

---

## 9. Submission checklist

- [ ] `npm run build` with the final version; check `version` in `manifest.json`.
- [x] `oauth2.client_id` is already the real Google Cloud client ID (no longer a placeholder).
- [ ] Generate the `.zip` of the `extension/` folder **removing the `key` field from `manifest.json`** (the store rejects `key`; it assigns its own ID). Do not include `key.pem` or the `src/` sources.
- [ ] Fill in single purpose, permission justifications and host permissions (sections 1–3).
- [ ] Declare data usage and attach the privacy-policy URL (section 5).
- [ ] Fill in contact, distribution and visibility (section 7).
- [ ] Upload the 3 screenshots + 128×128 icon; optionally the 2 promo tiles (section 8).
- [ ] Review the name, category, description and summary (section 6).

> **`.zip` tip:** to build the package without the `key` field, copy `extension/` to a temp folder, remove the `"key"` key from that copy's `manifest.json` and zip its contents. The repository keeps `key` on purpose — it pins the local ID `lnffnbbmkiafgmglepfcjdchaahjoooe`, which the Google Drive OAuth flow depends on in development.
