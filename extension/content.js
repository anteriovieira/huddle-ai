// Bridge between page-hook.js (Slack's JS world) and the extension.
// Captions found in the page go to the background worker; side panel requests
// (thread drafts, diagnostics) go to the page and their answers come back.
(() => {
  if (globalThis.__huddleAiBridge) return;
  globalThis.__huddleAiBridge = true;

  const REQUEST_TIMEOUT_MS = 5000;
  const origin = window.location.origin;
  const pending = new Map(); // request id -> sendResponse
  let nextId = 0;

  // Sends the caption source (and any future scanner config) into the page's JS world,
  // where page-hook.js keeps it on window.__huddleAiConfig for the scanner to read.
  function pushConfig(settings) {
    const config = { captionSource: settings?.captionSource ?? 'auto' };
    window.postMessage({ __huddleAi: 'config', config }, origin);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (data?.__huddleAi === 'config-request') {
      chrome.storage?.local.get('settings').then((stored) => pushConfig(stored.settings)).catch(() => {});
      return;
    }
    if (data?.__huddleAi === 'page') {
      if (!chrome.runtime?.id) return; // extension reloaded; this copy is orphaned
      chrome.runtime.sendMessage(data.message).catch(() => {});
    } else if (data?.__huddleAi === 'page-response') {
      const sendResponse = pending.get(data.id);
      if (!sendResponse) return;
      pending.delete(data.id);
      sendResponse(data.response);
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Lets the side panel confirm the content scripts are live in this tab (they only
    // inject on tabs loaded after the extension). No answer means the tab needs a reload.
    if (message?.type === 'huddle:ping') {
      sendResponse({ ok: true });
      return false;
    }
    if (!['thread:draft', 'thread:open', 'debug:dump'].includes(message?.type)) return false;
    const id = ++nextId;
    pending.set(id, sendResponse);
    window.postMessage({ __huddleAi: 'extension', id, request: message }, origin);
    setTimeout(() => {
      if (pending.delete(id)) sendResponse(null);
    }, REQUEST_TIMEOUT_MS);
    return true;
  });

  // Push config now (covers page-hook having loaded before its request reached us)
  // and again whenever the user changes the caption source in the side panel.
  chrome.storage?.local.get('settings').then((stored) => pushConfig(stored.settings)).catch(() => {});
  chrome.storage?.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) pushConfig(changes.settings.newValue);
  });

  chrome.runtime
    .sendMessage({ type: 'log', source: 'ponte', level: 'info', message: 'Ponte da extensão ativa', data: { url: location.href } })
    .catch(() => {});
})();
