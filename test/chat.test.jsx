import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost' });
global.window = dom.window;
global.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom lacks a few DOM APIs that the scroll effects and Radix tooltips call.
for (const name of ['scrollIntoView', 'hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
  if (!dom.window.HTMLElement.prototype[name]) dom.window.HTMLElement.prototype[name] = function () {};
}
global.ResizeObserver = dom.window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const huddle = { id: 'h1', active: true, startedAt: Date.now() - 60000, title: 'Huddle in general', captions: true, language: 'pt-BR' };
const sessionStore = { state: { huddle, utterances: [{ id: 'u1', speaker: 'Ana', text: 'oi', at: 0 }] } };
const localStore = { settings: { apiKey: 'sk-ant-test' } };

global.chrome = {
  runtime: { getManifest: () => ({ version: '9.9.9' }), sendMessage: async () => {} },
  storage: {
    session: {
      get: async (keys) => pick(sessionStore, keys),
      set: async (obj) => Object.assign(sessionStore, obj),
      remove: async () => {},
    },
    local: {
      get: async (keys) => pick(localStore, keys),
      set: async (obj) => Object.assign(localStore, obj),
      remove: async () => {},
    },
    onChanged: { addListener() {}, removeListener() {} },
  },
  tabs: { query: async () => [], sendMessage: async () => ({}), update: async () => {}, get: async () => ({}) },
  windows: { update: async () => {} },
  identity: { getAuthToken: async () => null, getProfileUserInfo: async () => ({ email: null }) },
};

function pick(store, keys) {
  const list = Array.isArray(keys) ? keys : keys == null ? Object.keys(store) : [keys];
  const out = {};
  for (const k of list) if (k in store) out[k] = store[k];
  return out;
}

const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { App } = await import('../src/sidepanel/App.jsx');
const { TooltipProvider, Tooltip } = await import('../src/sidepanel/ui/Tooltip.jsx');
const { PastAtaView } = await import('../src/sidepanel/views/Atas.jsx');
const mock = await import('./mocks/insights.mock.js');

const sampleRecord = {
  huddleId: 'h-del',
  generatedAt: Date.now(),
  model: 'claude-opus-5-5',
  meta: {
    startedAt: Date.parse('2026-10-29T14:00:00Z'),
    endedAt: Date.parse('2026-10-29T14:30:00Z'),
    source: 'Slack · #general',
    participants: ['Ana'],
  },
  data: {
    title: 'Sessão X',
    summary: 'resumo',
    classification: { category: 'Daily', confidence: 50, description: 'd' },
    tags: [],
    signals: [],
    key_points: [],
    next_steps: [],
  },
};
const noopAta = { done: new Set(), onCopy() {}, onToggleStep() {} };
const noopFooter = { onCopy() {}, canPost: false, onPost() {}, onDownload() {}, uploaded: null, driveBusy: false, onDrive() {} };

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 15)); });

function setValue(input, value) {
  const proto = input.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}
function click(el) {
  el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
}
async function sendQuestion(text) {
  const input = document.getElementById('chat-input');
  await act(async () => setValue(input, text));
  const form = input.closest('form');
  await act(async () => {
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  });
  await settle();
}
const tabTitles = () => [...document.querySelectorAll('.chattab__label')].map((b) => b.textContent);

test('each chat tab is renamed from its first question', async () => {
  const container = document.getElementById('app');
  const root = createRoot(container);
  // StrictMode double-invokes renders/updaters in the dev build (as the shipped app did),
  // which is exactly what broke the first chat's rename before the pure-updater fix.
  await act(async () =>
    root.render(
      React.createElement(React.StrictMode, null, React.createElement(TooltipProvider, null, React.createElement(App))),
    ),
  );
  await settle();

  // Open the chat dock from the header.
  await act(async () => click([...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Chat com a reunião')));
  await settle();

  try {
    await sendQuestion('quantas conversas enviamos?');
    const afterFirst = tabTitles();

    // Add a second chat and ask there too.
    await act(async () => click(document.querySelector('.chatdock__add')));
    await settle();
    await sendQuestion('qual a decisão principal?');
    const afterSecond = tabTitles();

    assert.equal(mock.titleCalls.length, 2, 'titleChat should be called once per new chat');
    assert.ok(afterFirst[0].startsWith('Título:'), `first tab should be renamed, got "${afterFirst[0]}"`);
    assert.ok(
      afterSecond.every((t) => t.startsWith('Título:')),
      `both tabs should be renamed, got ${JSON.stringify(afterSecond)}`,
    );
  } finally {
    await act(async () => root.unmount());
  }
});

test('Tooltip wires a trigger around its child and preserves it', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      React.createElement(
        TooltipProvider,
        null,
        React.createElement(
          Tooltip,
          { label: 'Baixar transcrição' },
          React.createElement('button', { id: 'tt-btn', className: 'icon-button' }, 'x'),
        ),
      ),
    ),
  );
  try {
    const btn = document.getElementById('tt-btn');
    // The child is preserved (class + text) and Radix turned it into a tooltip trigger.
    assert.equal(btn.className, 'icon-button');
    assert.ok(btn.hasAttribute('data-state'), 'Radix should mark the trigger with data-state');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test('PastAtaView deletes a session only after confirmation', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const deleted = [];
  const view = () =>
    React.createElement(
      TooltipProvider,
      null,
      React.createElement(PastAtaView, {
        record: sampleRecord,
        isCurrent: false,
        now: Date.now(),
        onBack() {},
        onLoad() {},
        onDelete: (r) => deleted.push(r),
        ataProps: noopAta,
        footerProps: noopFooter,
      }),
    );
  await act(async () => root.render(view()));
  try {
    assert.ok(!host.textContent.includes('Apagar esta sessão?'), 'no confirm prompt before clicking delete');

    await act(async () => click(host.querySelector('[aria-label="Apagar sessão"]')));
    assert.ok(host.textContent.includes('Apagar esta sessão?'), 'confirm prompt appears after clicking delete');
    assert.equal(deleted.length, 0, 'nothing deleted yet');

    await act(async () => click(host.querySelector('.button--danger')));
    assert.equal(deleted.length, 1, 'delete fires only after confirming');
    assert.equal(deleted[0].huddleId, 'h-del');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test('Tooltip with no label renders the child untouched', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(React.createElement(Tooltip, { label: '' }, React.createElement('button', { id: 'bare-btn' }, 'x'))),
  );
  try {
    const btn = document.getElementById('bare-btn');
    assert.ok(btn && !btn.hasAttribute('data-state'), 'child should be rendered as-is with no trigger wiring');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
