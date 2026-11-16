import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFirecrawlSearch, formatWebResults, firecrawlSearch } from '../src/sidepanel/lib/firecrawl.js';

test('parseFirecrawlSearch normalizes the v1 search payload', () => {
  const out = parseFirecrawlSearch({
    success: true,
    data: [
      { title: 'LangGraph Docs', url: 'https://x.dev/a', description: 'Streaming guide', markdown: '# Streaming\nstable' },
      { title: '', url: 'https://x.dev/b', description: '', markdown: '' },
    ],
  });
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { title: 'LangGraph Docs', url: 'https://x.dev/a', description: 'Streaming guide', markdown: '# Streaming\nstable' });
  // Missing fields degrade to empty strings, url preserved.
  assert.equal(out[1].url, 'https://x.dev/b');
  assert.equal(out[1].title, '');
});

test('parseFirecrawlSearch tolerates a bare data array and a web wrapper', () => {
  assert.equal(parseFirecrawlSearch({ data: { web: [{ url: 'https://a' }] } })[0].url, 'https://a');
  assert.equal(parseFirecrawlSearch([{ url: 'https://b' }])[0].url, 'https://b');
  assert.deepEqual(parseFirecrawlSearch(null), []);
  assert.deepEqual(parseFirecrawlSearch({ data: null }), []);
});

test('parseFirecrawlSearch drops entries without a url', () => {
  const out = parseFirecrawlSearch({ data: [{ title: 'no link' }, { url: 'https://ok' }] });
  assert.equal(out.length, 1);
  assert.equal(out[0].url, 'https://ok');
});

test('formatWebResults produces a sourced, length-capped block', () => {
  const text = formatWebResults([
    { title: 'A', url: 'https://a', description: 'da', markdown: 'x'.repeat(5000) },
  ]);
  assert.match(text, /A/);
  assert.match(text, /https:\/\/a/);
  // Markdown is truncated so a single result cannot blow the token budget.
  assert.ok(text.length < 4000, `expected capped block, got ${text.length}`);
});

test('formatWebResults handles an empty list', () => {
  assert.match(formatWebResults([]), /No web results/i);
});

test('firecrawlSearch posts to the v1 search endpoint with the bearer key', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, json: async () => ({ success: true, data: [{ title: 'T', url: 'https://u', description: 'd', markdown: 'm' }] }) };
  };
  const out = await firecrawlSearch({ apiKey: 'fc-key', query: 'hello', limit: 3, fetchImpl });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /api\.firecrawl\.dev\/v1\/search/);
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer fc-key');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.query, 'hello');
  assert.equal(body.limit, 3);
  assert.equal(out[0].url, 'https://u');
});

test('firecrawlSearch throws a readable error on a non-ok response', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ error: 'bad key' }) });
  await assert.rejects(firecrawlSearch({ apiKey: 'fc-key', query: 'x', fetchImpl }), /firecrawl|401|bad key/i);
});

test('firecrawlSearch rejects an empty key before any fetch', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return { ok: true, json: async () => ({}) };
  };
  await assert.rejects(firecrawlSearch({ apiKey: '  ', query: 'x', fetchImpl }), /key/i);
  assert.equal(called, false);
});
