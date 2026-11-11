// Keeps the current huddle and its captions in chrome.storage.session.
// The side panel renders from that storage and owns the `insights` and `minutes` keys.

const STATE_KEY = 'state';
const HISTORY_KEY = 'history';
const HISTORY_LIMIT = 20;

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

function emptyState() {
  return { huddle: null, utterances: [] };
}

// Serializes read-modify-write cycles so concurrent caption updates don't drop each other.
let queue = Promise.resolve();
function update(mutate) {
  queue = queue
    .then(async () => {
      const { [STATE_KEY]: state = emptyState() } = await chrome.storage.session.get(STATE_KEY);
      const next = await mutate(state);
      if (next) await chrome.storage.session.set({ [STATE_KEY]: next });
    })
    .catch((error) => console.error('[huddle-ai]', error));
  return queue;
}

async function archive(state) {
  if (!state.huddle || state.huddle.archived || state.utterances.length === 0) return;
  const { settings = {} } = await chrome.storage.local.get('settings');
  if (settings.saveHistory === false) return;
  const { insights = null, minutes = null, chats = null } = await chrome.storage.session.get(['insights', 'minutes', 'chats']);
  const { [HISTORY_KEY]: history = [] } = await chrome.storage.local.get(HISTORY_KEY);
  const entry = {
    huddle: state.huddle,
    utterances: state.utterances,
    insights: insights?.huddleId === state.huddle.id ? insights.data : null,
    minutes: minutes?.huddleId === state.huddle.id ? minutes : null,
    chats: chats?.huddleId === state.huddle.id ? chats.list : null,
  };
  await chrome.storage.local.set({ [HISTORY_KEY]: [entry, ...history].slice(0, HISTORY_LIMIT) });
}

async function endHuddle(state) {
  const huddle = { ...state.huddle, active: false, endedAt: Date.now() };
  await archive({ ...state, huddle });
  return { ...state, huddle: { ...huddle, archived: true } };
}

async function onStatus(state, message, tabId) {
  if (message.active) {
    if (state.huddle?.id !== message.huddleId) {
      await archive(state);
      await chrome.storage.session.remove(['insights', 'minutes']);
      return {
        huddle: {
          id: message.huddleId,
          title: message.title,
          captions: message.captions,
          language: message.language,
          tabId,
          startedAt: Date.now(),
          active: true,
        },
        utterances: [],
      };
    }
    return {
      ...state,
      huddle: {
        ...state.huddle,
        title: message.title ?? state.huddle.title,
        captions: message.captions,
        language: message.language ?? state.huddle.language,
        tabId,
        active: true,
      },
    };
  }
  if (state.huddle?.id === message.huddleId && state.huddle.active) return endHuddle(state);
  return null;
}

// Logs from every part of the extension, newest last, for the panel's log view.
const LOGS_KEY = 'logs';
const LOGS_LIMIT = 400;
let logQueue = Promise.resolve();
function addLog(entry) {
  logQueue = logQueue
    .then(async () => {
      const { [LOGS_KEY]: logs = [] } = await chrome.storage.session.get(LOGS_KEY);
      logs.push({ at: Date.now(), source: 'extensão', level: 'info', ...entry });
      await chrome.storage.session.set({ [LOGS_KEY]: logs.slice(-LOGS_LIMIT) });
    })
    .catch((error) => console.error('[huddle-ai]', error));
}

function onCaption(state, message) {
  if (state.huddle?.id !== message.huddleId) {
    addLog({ level: 'warn', message: 'Fala recebida de um huddle que não é o atual (ignorada)', data: { huddle: message.huddleId } });
    return null;
  }
  const { id, speaker, text } = message.utterance;
  const now = Date.now();
  const utterances = state.utterances.slice();
  const index = utterances.findIndex((u) => u.id === id);
  if (index >= 0) utterances[index] = { ...utterances[index], speaker, text, updatedAt: now };
  else utterances.push({ id, speaker, text, at: now - state.huddle.startedAt, updatedAt: now });
  return { ...state, utterances };
}

// The huddle's Slack thread, as last read by the scanner: { messages, visible, readAt }.
function onThread(state, message) {
  if (state.huddle?.id !== message.huddleId) return null;
  return { ...state, thread: { messages: message.messages, visible: message.visible, readAt: Date.now() } };
}

// Injects the capture scripts into an already-open Slack tab (one loaded before the
// extension, so the manifest content scripts never ran there). Mirrors the manifest:
// scanner + page-hook in the page's own JS world, then the isolated-world bridge.
// Lets the side panel connect without a full page reload; the user only reopens the
// huddle so the freshly installed window.open hook can capture its popup.
async function connectTab(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', injectImmediately: true, files: ['scanner.js', 'page-hook.js'] });
  await chrome.scripting.executeScript({ target: { tabId }, injectImmediately: true, files: ['content.js'] });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'connect:tab') {
    const tabId = message.tabId ?? sender.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false, error: 'aba não informada' });
      return false;
    }
    connectTab(tabId)
      .then(() => {
        addLog({ source: 'background', message: 'Scripts injetados na aba do Slack', data: { aba: tabId } });
        sendResponse({ ok: true });
      })
      .catch((error) => {
        addLog({ level: 'error', source: 'background', message: `Falha ao injetar na aba: ${error.message}`, data: { aba: tabId } });
        sendResponse({ ok: false, error: String(error?.message ?? error) });
      });
    return true; // resposta assíncrona
  }
  if (message?.type === 'huddle:status') {
    addLog({
      source: 'background',
      message: message.active ? 'Huddle ativo' : 'Huddle encerrado',
      data: { titulo: message.title, legendas: message.captions, idioma: message.language, aba: sender.tab?.id },
    });
    update((state) => onStatus(state, message, sender.tab?.id));
  } else if (message?.type === 'caption:upsert') {
    update((state) => onCaption(state, message));
  } else if (message?.type === 'thread:snapshot') {
    update((state) => onThread(state, message));
  } else if (message?.type === 'log') {
    addLog({ source: message.source, level: message.level, message: message.message, data: message.data });
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  update((state) => (state.huddle?.active && state.huddle.tabId === tabId ? endHuddle(state) : null));
});
