import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost' });
global.window = dom.window;
global.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

for (const name of ['scrollIntoView', 'hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
  if (!dom.window.HTMLElement.prototype[name]) dom.window.HTMLElement.prototype[name] = function () {};
}
global.ResizeObserver = dom.window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Minimal chrome stub: no huddle in storage, no Slack tabs, Drive not connected.
global.chrome = {
  runtime: {
    getManifest: () => ({ version: '9.9.9' }),
    sendMessage: async () => {},
  },
  storage: {
    session: { get: async () => ({}), set: async () => {}, remove: async () => {} },
    local: { get: async () => ({}), set: async () => {}, remove: async () => {} },
    onChanged: { addListener() {}, removeListener() {} },
  },
  tabs: { query: async () => [], sendMessage: async () => ({}), update: async () => {}, get: async () => ({}) },
  windows: { update: async () => {} },
  identity: { getAuthToken: async () => null, getProfileUserInfo: async () => ({ email: null }) },
};

const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { App } = await import('../src/sidepanel/App.jsx');
const { TooltipProvider } = await import('../src/sidepanel/ui/Tooltip.jsx');
const tree = () => React.createElement(TooltipProvider, null, React.createElement(App));

test('App boots to the idle screen with a mocked chrome and no huddle', async () => {
  const container = document.getElementById('app');
  const root = createRoot(container);
  await act(async () => {
    root.render(tree());
  });
  // Let the async boot() reads + effects settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  const html = container.innerHTML;
  // Always unmount so App's intervals are cleared and the test runner can exit.
  await act(async () => {
    root.unmount();
  });

  // App defaults to English (DEFAULT_SETTINGS.language = 'English'), so the idle screen renders in
  // English here.
  assert.match(html, /No active huddle/);
  assert.match(html, /Go to Slack/);
  assert.match(html, /Huddle AI/);
});
