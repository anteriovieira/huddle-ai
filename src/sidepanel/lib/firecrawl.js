// Web search via Firecrawl (https://firecrawl.dev). Used by the chat's web_search tool when the
// user turns "Web search" on and has saved a Firecrawl API key in settings. Pure helpers
// (parse/format) are unit-tested in Node; firecrawlSearch takes an injectable fetch so the network
// call is testable too.

const SEARCH_URL = 'https://api.firecrawl.dev/v1/search';
// Per-result markdown is capped so a handful of scraped pages can't blow the model's token budget.
const MAX_MARKDOWN = 1200;
// Default number of web results to pull. Kept small for cost and latency.
const DEFAULT_LIMIT = 4;

// Normalizes a Firecrawl /v1/search payload into [{ title, url, description, markdown }]. The API
// has returned results under `data` (an array) and, in some versions, under `data.web`; this accepts
// both, plus a bare array, and drops anything without a url.
export function parseFirecrawlSearch(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.data?.web)
        ? payload.data.web
        : Array.isArray(payload?.web)
          ? payload.web
          : [];
  return rows
    .filter((r) => r && typeof r.url === 'string' && r.url.trim())
    .map((r) => ({
      title: String(r.title ?? '').trim(),
      url: String(r.url).trim(),
      description: String(r.description ?? r.snippet ?? '').trim(),
      markdown: String(r.markdown ?? r.content ?? '').trim(),
    }));
}

// Renders the normalized results as a compact, sourced block for the model to read. Each result
// keeps its title + url (so the model can cite it) and a capped slice of the scraped markdown.
export function formatWebResults(results) {
  if (!results?.length) return 'No web results for this query.';
  return results
    .map((r, i) => {
      const head = `[${i + 1}] ${r.title || r.url}\n${r.url}`;
      const body = r.markdown
        ? r.markdown.slice(0, MAX_MARKDOWN)
        : r.description;
      return body ? `${head}\n${body}` : head;
    })
    .join('\n\n');
}

// Runs a Firecrawl web search and returns normalized results. `fetchImpl` defaults to global fetch
// (injectable for tests). Throws a readable error on a missing key or a non-ok response so the tool
// can report it to the model without crashing the chat.
export async function firecrawlSearch({ apiKey, query, limit = DEFAULT_LIMIT, signal, fetchImpl } = {}) {
  const key = (apiKey ?? '').trim();
  if (!key) throw new Error('Firecrawl API key is not configured.');
  const doFetch = fetchImpl ?? globalThis.fetch;
  const res = await doFetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, limit, scrapeOptions: { formats: ['markdown'] } }),
    signal,
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error || body?.message || '';
    } catch {
      // non-JSON body: fall back to the status alone
    }
    throw new Error(`Firecrawl search failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  const payload = await res.json();
  return parseFirecrawlSearch(payload);
}
