import {
  ataContent,
  ataEmpty,
  ataFooter,
  ataInfo,
  ataLoading,
  atasList,
  formatDateTime,
  minutesAsText,
  minutesMeta,
  tagCounts,
} from './ata.js';
import { ago, avatar, copy, copyWithIcon, download, h, icon, markdown } from './dom.js';
import * as drive from './drive.js';
import { MODELS, analyze, askMeeting, formatClock, formatTranscript, generateMinutes, titleChat } from './insights.js';

const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'claude-opus-5-5',
  language: 'Português',
  freq: 30,
  userName: '',
  detect: { actions: true, decisions: true, questions: true, suggestions: false, alerts: true, references: true, acronyms: true },
  saveHistory: true,
  autoMinutes: true,
  captionSource: 'auto',
};
// How long the group must be off the agenda before the drift warning shows (ms).
const DRIFT_THRESHOLD_MS = 90 * 1000;
const ALERT_META = {
  mention: { tone: 'purple', icon: 'at', title: 'Te mencionaram', tag: 'menção' },
  action: { tone: 'green', icon: 'check', title: 'Ação atribuída a você', tag: 'ação' },
  question: { tone: 'yellow', icon: 'question', title: 'Pergunta em aberto', tag: 'pergunta' },
};
const REF_META = {
  book: { tone: 'purple', icon: 'book' },
  app: { tone: 'blue', icon: 'app' },
  tool: { tone: 'green', icon: 'tool' },
  link: { tone: 'blue', icon: 'link' },
  article: { tone: 'yellow', icon: 'doc' },
  other: { tone: 'yellow', icon: 'bulb' },
};
const LANGUAGES = ['Português', 'English', 'Español'];
// How the page scanner finds captions. 'auto' reads the Captions tab panel when it is
// open (full transcript) and otherwise the overlay, so capture starts as soon as
// captions are on — no need to open the tab. 'panel'/'overlay' force one source.
const CAPTION_SOURCES = [
  ['auto', 'Automático (recomendado)'],
  ['panel', 'Painel de legendas (aba Captions)'],
  ['overlay', 'Legendas sobre os vídeos'],
];
const FREQUENCIES = [15, 30, 60];
const MARK_LABELS = { action: 'Ação', decision: 'Decisão', question: 'Pergunta' };
const LEVEL_LABELS = { debug: 'debug', info: 'info', warn: 'aviso', error: 'erro' };
const MIN_UTTERANCES_FOR_MINUTES = 3;

// ---------------------------------------------------------------------------
// State

let state = { huddle: null, utterances: [] };
let insights = null; // { huddleId, updatedAt, data }
let minutes = null; // { huddleId, generatedAt, model, meta, data }
let history = []; // archived huddles, newest first (chrome.storage.local)
let settings = DEFAULT_SETTINGS;
let slackOpen = false;
let slackReloadTabId = null; // a Slack tab that predates the extension and needs reloading
let logs = [];
let driveState = { connected: false, email: null }; // Google Drive connection
// Chat with the meeting: per-huddle set of conversation tabs.
// { huddleId, list: [{ id, title, messages: [{ role, text }] }] }
let chats = { huddleId: null, list: [] };

const ui = {
  tab: 'insights',
  settingsOpen: false,
  logsOpen: false,
  logsReturnToSettings: false,
  atasOpen: false,
  atasQuery: '',
  atasTag: null,
  viewingAta: null, // a past minutes record opened from the list
  follow: true,
  notice: null,
  flash: null,
  topicExpanded: false,
  chatOpen: false,
  chatExpanded: false,
  activeChatId: null,
  chatDrafts: {}, // unsent input text, keyed by chat id
  chatInputFocused: false,
  chatBusy: new Set(), // chat ids waiting on a reply
  chatStream: null, // { chatId, text } while an answer is streaming in
  importOpen: false,
  importError: null,
};
const analysis = { running: false, error: null, lastRunAt: 0, lastKey: '' };
const minutesJob = { running: false, startedAt: 0, error: null, failedFor: null };
const done = new Set(); // action items and next steps the user ticked
const acked = new Set(); // personal alerts the user accepted/dismissed, keyed by text

const app = document.getElementById('app');

function logEvent(level, message, data) {
  chrome.runtime.sendMessage({ type: 'log', source: 'painel', level, message, data }).catch(() => {});
}

function currentInsights() {
  return insights?.huddleId === state.huddle?.id ? insights : null;
}

function currentMinutes() {
  return minutes?.huddleId === state.huddle?.id ? minutes : null;
}

// Every saved minutes record, newest first: the archive plus the current huddle's.
function allMinutes() {
  const records = history.map((entry) => entry.minutes).filter(Boolean);
  const current = currentMinutes();
  if (current && !records.some((record) => record.huddleId === current.huddleId)) records.unshift(current);
  return records.sort((a, b) => b.meta.startedAt - a.meta.startedAt);
}

function speakers() {
  return new Set(state.utterances.map((u) => u.speaker)).size;
}

// ---------------------------------------------------------------------------
// Chat with the meeting

let chatSeq = 0;
function newChat(index = 1) {
  return { id: `c${Date.now().toString(36)}${chatSeq++}`, title: `Chat ${index}`, messages: [] };
}

// Names a chat tab from its first question, using the model. Best-effort and async:
// the tab keeps "Chat N" until (and unless) a title comes back.
async function nameChat(chatId, question) {
  let title;
  try {
    title = await titleChat({ settings, question });
  } catch (error) {
    logEvent('warn', `Não consegui gerar o título do chat: ${error.message}`);
    return;
  }
  if (!title) {
    logEvent('debug', 'Título do chat veio vazio');
    return;
  }
  const chat = chats.list.find((c) => c.id === chatId);
  if (!chat || !/^Chat \d+$/.test(chat.title)) return; // gone, or the user renamed it
  chat.title = title;
  logEvent('info', `Chat renomeado para "${title}"`);
  saveChats();
  render();
}

// Reset the chat set when the huddle changes; keep one empty tab ready.
function ensureChats() {
  const huddleId = state.huddle?.id ?? null;
  if (chats.huddleId !== huddleId) chats = { huddleId, list: [] };
  if (!chats.list.length) chats.list = [newChat(1)];
  if (!chats.list.some((chat) => chat.id === ui.activeChatId)) ui.activeChatId = chats.list[0].id;
  return chats;
}

function activeChat() {
  return chats.list.find((chat) => chat.id === ui.activeChatId) ?? null;
}

function saveChats() {
  chrome.storage.session.set({ chats }).catch(() => {});
}

function toggleChat() {
  ui.chatOpen = !ui.chatOpen;
  if (ui.chatOpen) ensureChats();
  render();
  if (ui.chatOpen) focusChatInput();
}

function addChat() {
  ensureChats();
  const chat = newChat(chats.list.length + 1);
  chats.list.push(chat);
  ui.activeChatId = chat.id;
  saveChats();
  render();
  focusChatInput();
}

function closeChat(id) {
  chats.list = chats.list.filter((chat) => chat.id !== id);
  delete ui.chatDrafts[id];
  ui.chatBusy.delete(id);
  if (!chats.list.length) chats.list = [newChat(1)];
  if (ui.activeChatId === id) ui.activeChatId = chats.list[0].id;
  saveChats();
  render();
}

function selectChat(id) {
  ui.activeChatId = id;
  render();
  focusChatInput();
}

function focusChatInput() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  input.focus();
  const end = input.value.length;
  input.setSelectionRange(end, end);
}

async function sendChat() {
  const chat = activeChat();
  if (!chat) return;
  const question = (ui.chatDrafts[chat.id] ?? '').trim();
  if (!question) return;
  if (!settings.apiKey) {
    flash('Adicione sua chave da API nas configurações para conversar com a reunião.');
    return;
  }
  if (ui.chatBusy.has(chat.id)) return;
  const history = chat.messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, text: m.text }));
  // First question names the tab via the model (unless the user already renamed it).
  const firstQuestion = !chat.messages.some((m) => m.role === 'user');
  chat.messages.push({ role: 'user', text: question });
  ui.chatDrafts[chat.id] = '';
  ui.chatBusy.add(chat.id);
  ui.chatStream = { chatId: chat.id, text: '' };
  saveChats();
  render();
  scrollChat();
  if (firstQuestion && /^Chat \d+$/.test(chat.title)) nameChat(chat.id, question); // in parallel
  logEvent('info', `Pergunta ao huddle (${state.utterances.length} falas)`);
  try {
    const answer = await askMeeting({
      settings,
      utterances: state.utterances,
      history,
      question,
      onText: (delta) => onChatDelta(chat.id, delta),
    });
    chat.messages.push({ role: 'assistant', text: answer });
  } catch (error) {
    chat.messages.push({ role: 'error', text: error.message });
    logEvent('error', `Falha no chat: ${error.message}`);
  } finally {
    ui.chatBusy.delete(chat.id);
    ui.chatStream = null;
    saveChats();
    render();
    scrollChat();
  }
}

// Appends a streamed chunk to the live answer, patching the bubble in place so the text
// grows smoothly without a full re-render (which would fight the focused input).
function onChatDelta(chatId, delta) {
  if (ui.chatStream?.chatId !== chatId) return;
  ui.chatStream.text += delta;
  const bubble = document.getElementById('chat-stream');
  if (bubble) {
    bubble.replaceChildren(markdown(ui.chatStream.text));
    scrollChat();
  } else {
    render();
  }
}

function scrollChat() {
  const log = document.getElementById('chat-log');
  if (log) log.scrollTop = log.scrollHeight;
}

// ---------------------------------------------------------------------------
// Views

function header() {
  const huddle = state.huddle;
  return h(
    'header',
    { class: 'header' },
    icon('headphones', 'icon icon--title'),
    h(
      'div',
      { class: 'header__titles' },
      h('span', { class: 'header__app' }, 'Huddle AI'),
      h('span', { class: 'header__sub' }, `v${chrome.runtime.getManifest().version}`),
    ),
    huddle &&
      (huddle.active
        ? h('span', { class: 'pill pill--live' }, h('span', { class: 'dot' }), h('span', { id: 'clock' }, formatClock(Date.now() - huddle.startedAt)))
        : h('span', { class: 'pill' }, 'Encerrado')),
    huddle &&
      h(
        'button',
        {
          class: ui.chatOpen ? 'icon-button icon-button--on' : 'icon-button',
          type: 'button',
          'aria-label': 'Chat com a reunião',
          'aria-pressed': String(ui.chatOpen),
          title: 'Perguntar à reunião',
          onClick: toggleChat,
        },
        icon('chat'),
      ),
    h('button', { class: 'icon-button', type: 'button', 'aria-label': 'Logs', title: 'Logs', onClick: openLogs }, icon('logs')),
    h(
      'button',
      { class: 'icon-button', type: 'button', 'aria-label': 'Configurações', title: 'Configurações', onClick: openSettings },
      icon('settings'),
    ),
  );
}

function tabs() {
  const items = [
    ['insights', 'Insights'],
    ['captions', 'Captions'],
    ['ata', 'Ata'],
  ];
  return h(
    'nav',
    { class: 'tabs', role: 'tablist', 'aria-label': 'Seções' },
    items.map(([id, label]) =>
      h(
        'button',
        {
          class: 'tab',
          type: 'button',
          role: 'tab',
          'aria-selected': String(ui.tab === id),
          onClick: () => {
            ui.tab = id;
            ui.follow = true;
            render();
          },
        },
        label,
      ),
    ),
  );
}

function infoBar() {
  if (ui.tab === 'insights') {
    if (!settings.apiKey) {
      return h(
        'div',
        { class: 'info' },
        'Adicione sua chave da API para gerar insights. ',
        h('button', { class: 'link', type: 'button', onClick: openSettings }, 'Configurar'),
      );
    }
    if (analysis.error) return h('div', { class: 'info info--error', role: 'status' }, analysis.error);
    if (analysis.running) return h('div', { class: 'info', role: 'status' }, 'Analisando as últimas falas…');
    return h(
      'div',
      { class: 'info' },
      `Analisando legendas a cada ${settings.freq} s. `,
      h('button', { class: 'link', type: 'button', onClick: openSettings }, 'Alterar'),
    );
  }
  if (ui.tab === 'captions') {
    const count = state.utterances.length;
    return h(
      'div',
      { class: 'info info--row' },
      h(
        'span',
        null,
        !state.huddle.captions
          ? 'Abra a aba Captions na janela do huddle para começar.'
          : state.huddle.language
            ? `Lendo legendas em ${state.huddle.language} do huddle · ${count} ${count === 1 ? 'fala' : 'falas'}.`
            : `Lendo legendas do huddle · ${count} ${count === 1 ? 'fala' : 'falas'}.`,
      ),
      h(
        'button',
        { class: 'icon-button', type: 'button', 'aria-label': 'Baixar transcrição', onClick: downloadTranscript },
        icon('download'),
      ),
    );
  }
  const record = currentMinutes();
  if (record && !minutesJob.running) {
    return ataInfo(record, { ago, onRegenerate: runMinutes, onOpenList: openAtas });
  }
  return null;
}

function section(title, count, items) {
  if (!items.length) return null;
  return h(
    'section',
    { class: 'section', 'aria-label': title },
    h('h3', { class: 'section__title' }, title, count != null && h('span', { class: 'count' }, String(count))),
    items,
  );
}

function iconRow(name, tone, text) {
  return h('div', { class: 'row' }, h('span', { class: `badge-icon badge-icon--${tone}` }, icon(name)), h('span', null, text));
}

function referenceRow(ref) {
  const meta = REF_META[ref.kind] ?? REF_META.other;
  const isUrl = /^https?:\/\//i.test(ref.title);
  const title = isUrl
    ? h('a', { class: 'ref__title link', href: ref.title, target: '_blank', rel: 'noopener noreferrer' }, ref.title)
    : h('span', { class: 'ref__title' }, ref.title);
  return h(
    'div',
    { class: 'row' },
    h('span', { class: `badge-icon badge-icon--${meta.tone}` }, icon(meta.icon)),
    h(
      'span',
      { class: 'row__stack' },
      h('span', null, title, ref.by && h('span', { class: 'muted small' }, ` · ${ref.by}`)),
      ref.description && h('span', { class: 'muted small' }, ref.description),
    ),
  );
}

function acronymRow(item) {
  return h(
    'div',
    { class: 'row' },
    h('span', { class: 'badge-icon badge-icon--blue' }, icon('hash')),
    h(
      'span',
      { class: 'row__stack' },
      h('span', { class: 'strong' }, item.term),
      item.meaning && h('span', { class: 'muted small' }, item.meaning),
    ),
  );
}

// How long the group has been off the agenda, in whole minutes, or null when on track.
function driftMinutes(focus) {
  if (!focus || focus.on_agenda) return null;
  const since = state.utterances[focus.since_line - 1];
  if (!since) return null;
  const elapsed = state.huddle.active ? Date.now() - state.huddle.startedAt : state.utterances.at(-1).at;
  const ms = elapsed - since.at;
  return ms >= DRIFT_THRESHOLD_MS ? Math.round(ms / 60000) : null;
}

// The "Alertas pra você" block: personal mentions, assigned actions and questions.
function alertsSection(alerts) {
  const pending = alerts.filter((alert) => !acked.has(alert.text));
  if (!pending.length) return null;
  return h(
    'section',
    { class: 'section', 'aria-label': 'Alertas pra você' },
    h('h3', { class: 'section__title' }, 'Alertas pra você', h('span', { class: 'count' }, String(pending.length))),
    pending.map((alert) => {
      const meta = ALERT_META[alert.kind];
      const at = state.utterances[alert.line - 1];
      return h(
        'article',
        { class: `alert alert--${meta.tone}` },
        h(
          'div',
          { class: 'alert__head' },
          h('span', { class: `badge-icon badge-icon--${meta.tone}` }, icon(meta.icon)),
          h('span', { class: 'alert__title' }, meta.title),
          h('span', { class: 'muted small alert__when' }, [at ? formatClock(at.at) : null, alert.from].filter(Boolean).join(' · ')),
        ),
        h('p', { class: 'alert__text' }, alert.text),
        h(
          'div',
          { class: 'alert__foot' },
          h('span', { class: `tag tag--${alert.kind}` }, meta.tag),
          h(
            'div',
            { class: 'alert__actions' },
            alert.kind === 'action' &&
              h(
                'button',
                { class: 'button button--small', type: 'button', onClick: () => editAlert(alert) },
                icon('pencil'),
                'Editar',
              ),
            h(
              'button',
              { class: 'button button--small button--accept', type: 'button', onClick: () => acceptAlert(alert) },
              icon('check'),
              alert.kind === 'action' ? 'Aceitar' : 'Ok',
            ),
          ),
        ),
      );
    }),
  );
}

// The "O que já rolou" timeline: every topic in order, the last one marked as current.
function topicTimeline(topics, active) {
  const lastIndex = topics.length - 1;
  return h(
    'div',
    { class: 'timeline' },
    h('span', { class: 'timeline__heading muted small strong' }, 'O que já rolou'),
    topics.map((topic, index) => {
      const now = index === lastIndex;
      const at = state.utterances[topic.line - 1];
      return h(
        'div',
        { class: now ? 'tl tl--now' : 'tl' },
        h('span', { class: 'tl__dot' }),
        h(
          'div',
          { class: 'tl__body' },
          h(
            'div',
            { class: 'tl__head' },
            h('span', { class: 'tl__title' }, now && active ? `Agora: ${topic.title}` : topic.title),
            at && h('span', { class: 'tl__time muted small' }, formatClock(at.at)),
          ),
          topic.note && h('p', { class: 'tl__note muted small' }, topic.note),
        ),
      );
    }),
  );
}

// Merged topic card: the current/last topic, a drift warning, and — when expanded —
// the full timeline of topics discussed so far.
function topicCard(data, updatedAt) {
  const active = state.huddle.active;
  const raw = data.topics ?? [];
  // Older insights have no topics list; fall back to the current topic so the
  // timeline (and its toggle) still show something.
  const topics = raw.length ? raw : [{ title: data.topic.title, note: data.topic.summary, line: state.utterances.length }];
  const drift = driftMinutes(data.focus);
  const canExpand = topics.length >= 1;
  const expanded = ui.topicExpanded && canExpand;
  return h(
    'section',
    { class: 'card', 'aria-label': 'Tópico atual' },
    h(
      'div',
      { class: 'card__meta' },
      h('span', { class: 'accent' }, active ? 'Falando agora' : 'Último tópico'),
      h('span', { class: 'muted', id: 'updated-ago' }, ago(updatedAt)),
    ),
    h('h2', { class: 'card__title' }, data.topic.title),
    h('p', { class: 'card__body' }, data.topic.summary),
    drift != null &&
      h('div', { class: 'drift' }, icon('warn'), h('span', null, `Disperso há ${drift} min — longe da pauta`)),
    expanded && topicTimeline(topics, active),
    canExpand &&
      h(
        'button',
        {
          class: 'topic__toggle',
          type: 'button',
          'aria-expanded': String(expanded),
          onClick: () => {
            ui.topicExpanded = !ui.topicExpanded;
            render();
          },
        },
        icon(expanded ? 'collapse' : 'expand'),
        expanded ? 'Ocultar tópicos' : `Ver tópicos discutidos (${topics.length})`,
      ),
  );
}

function insightsView() {
  const current = currentInsights();
  if (!current) {
    if (!settings.apiKey) {
      return h(
        'div',
        { class: 'empty' },
        h('p', null, 'Configure sua chave da API Anthropic para gerar os insights.'),
        h('button', { class: 'button button--primary', type: 'button', onClick: openSettings }, 'Configurar chave'),
      );
    }
    return h(
      'div',
      { class: 'empty' },
      h('p', null, state.utterances.length ? 'Gerando os primeiros insights…' : 'Os insights aparecem depois das primeiras falas.'),
    );
  }
  const data = current.data;
  return h(
    'div',
    { class: 'stack' },
    settings.detect.alerts && alertsSection(data.alerts ?? []),
    topicCard(data, current.updatedAt),
    section('Pontos levantados', null, data.points.map((text) => iconRow('bulb', 'blue', text))),
    settings.detect.actions &&
      section(
        'Ações',
        data.actions.length,
        data.actions.map((action) => {
          const key = action.text;
          return h(
            'label',
            { class: 'row row--check' },
            h('input', {
              type: 'checkbox',
              checked: done.has(key),
              onChange: (event) => (event.target.checked ? done.add(key) : done.delete(key)),
            }),
            h(
              'span',
              { class: 'row__stack' },
              h('span', null, action.text),
              action.owner && h('span', { class: 'muted small' }, action.owner),
            ),
          );
        }),
      ),
    settings.detect.decisions && section('Decisões', data.decisions.length, data.decisions.map((text) => iconRow('check', 'green', text))),
    settings.detect.questions && section('Em aberto', null, data.open_questions.map((text) => iconRow('question', 'yellow', text))),
    settings.detect.suggestions && section('Sugestões para você', null, data.suggestions.map((text) => iconRow('spark', 'purple', text))),
    settings.detect.references &&
      section('Referências mencionadas', (data.references ?? []).length, (data.references ?? []).map(referenceRow)),
    settings.detect.acronyms && section('Siglas', (data.acronyms ?? []).length, (data.acronyms ?? []).map(acronymRow)),
  );
}

function captionsView() {
  if (!state.utterances.length) {
    return h('div', { class: 'empty' }, h('p', null, 'Nenhuma fala ainda. As legendas aparecem aqui enquanto as pessoas falam.'));
  }
  const marks = new Map((currentInsights()?.data.marks ?? []).map((mark) => [mark.line, mark.kind]));
  const lastIndex = state.utterances.length - 1;
  return h(
    'ol',
    { class: 'captions', 'aria-label': 'Legendas' },
    state.utterances.map((u, index) => {
      const mark = marks.get(index + 1);
      const live = state.huddle.active && index === lastIndex;
      return h(
        'li',
        { class: live ? 'caption caption--live' : 'caption' },
        avatar(u.speaker),
        h(
          'div',
          { class: 'caption__body' },
          h(
            'div',
            { class: 'caption__meta' },
            h('span', { class: 'caption__name' }, u.speaker),
            h('span', { class: live ? 'accent small strong' : 'muted small' }, live ? 'agora' : formatClock(u.at)),
          ),
          h('p', { class: 'caption__text' }, u.text),
          mark && h('span', { class: `tag tag--${mark}` }, `${MARK_LABELS[mark]} detectada`),
        ),
      );
    }),
  );
}

function ataContext(record) {
  const isCurrent = record.huddleId === state.huddle?.id;
  return {
    done,
    flash: ui.flash,
    canPost: isCurrent && !!state.huddle?.active,
    onCopy: (event) => copyText(minutesAsText(record), event.currentTarget),
    onPost: () => postToThread(minutesAsText(record, 'slack')),
    onDownload: () => downloadMinutes(record),
    uploaded: record.drive ?? null,
    driveBusy: ui.driveBusy === record.huddleId,
    onDrive: () => uploadToDrive(record),
  };
}

function ataView() {
  if (minutesJob.running) {
    return ataLoading({ startedAt: minutesJob.startedAt, utterances: state.utterances.length, participants: speakers() });
  }
  const record = currentMinutes();
  if (record) return ataContent(record, ataContext(record));
  return ataEmpty({
    active: state.huddle.active,
    error: minutesJob.error,
    autoMinutes: settings.autoMinutes,
    utterances: state.utterances.length,
    participants: speakers(),
    hasKey: !!settings.apiKey,
    canGenerate: !!settings.apiKey && state.utterances.length >= MIN_UTTERANCES_FOR_MINUTES,
    onToggleAuto: setAutoMinutes,
    onGenerate: runMinutes,
    onOpenList: openAtas,
  });
}

function footer() {
  if (ui.tab === 'ata') {
    const record = currentMinutes();
    return record && !minutesJob.running ? ataFooter(record, ataContext(record)) : null;
  }
  if (ui.tab !== 'insights') return null;
  const last = state.utterances.at(-1);
  const current = currentInsights();
  return h(
    'footer',
    { class: 'footer' },
    last &&
      h(
        'div',
        { class: 'ticker' },
        avatar(last.speaker, 'sm'),
        h('span', { class: 'ticker__text' }, h('b', null, last.speaker.split(/\s+/)[0]), ` ${last.text}`),
      ),
    h(
      'div',
      { class: 'buttons' },
      h(
        'button',
        {
          class: 'button button--primary',
          type: 'button',
          disabled: !current,
          onClick: (event) => copy(insightsAsText(current.data), event.currentTarget),
        },
        'Copiar resumo',
      ),
      h(
        'button',
        {
          class: 'button',
          type: 'button',
          disabled: !current || !state.huddle.active,
          onClick: () => postToThread(insightsAsText(current.data)),
        },
        'Postar no thread',
      ),
    ),
    ui.flash && h('p', { class: 'muted small', role: 'status' }, ui.flash),
  );
}

function chatMessage(message) {
  if (message.role === 'error') {
    return h('div', { class: 'chat-msg chat-msg--error' }, message.text);
  }
  const mine = message.role === 'user';
  if (mine) return h('div', { class: 'chat-msg chat-msg--user' }, h('p', { class: 'chat-bubble' }, message.text));
  return h('div', { class: 'chat-msg chat-msg--bot' }, h('div', { class: 'chat-bubble chat-bubble--md' }, markdown(message.text)));
}

// While a reply is in flight: the streaming answer (a plain bot bubble filled as text
// arrives), or — before the first token — a Claude-style "Pensando" indicator, no bubble.
function chatPending(chatId) {
  const stream = ui.chatStream?.chatId === chatId ? ui.chatStream.text : '';
  if (stream) {
    return h('div', { class: 'chat-msg chat-msg--bot' }, h('div', { class: 'chat-bubble chat-bubble--md', id: 'chat-stream' }, markdown(stream)));
  }
  return h('div', { class: 'chat-thinking' }, icon('spark', 'icon chat-thinking__icon'), h('span', null, 'Pensando'));
}

function chatDock() {
  ensureChats();
  const chat = activeChat();
  const busy = ui.chatBusy.has(chat.id);
  const draft = ui.chatDrafts[chat.id] ?? '';
  return h(
    'section',
    { class: ui.chatExpanded ? 'chatdock chatdock--expanded' : 'chatdock', 'aria-label': 'Chat com a reunião' },
    h(
      'div',
      { class: 'chatdock__bar' },
      h(
        'div',
        { class: 'chatdock__tabs', role: 'tablist' },
        chats.list.map((item) =>
          h(
            'span',
            { class: item.id === ui.activeChatId ? 'chattab chattab--active' : 'chattab' },
            h(
              'button',
              { class: 'chattab__label', type: 'button', role: 'tab', 'aria-selected': String(item.id === ui.activeChatId), onClick: () => selectChat(item.id) },
              item.title,
            ),
            h('button', { class: 'chattab__close', type: 'button', 'aria-label': `Fechar ${item.title}`, onClick: () => closeChat(item.id) }, icon('close')),
          ),
        ),
        h('button', { class: 'chatdock__add', type: 'button', 'aria-label': 'Novo chat', title: 'Novo chat', onClick: addChat }, icon('plus')),
      ),
      h(
        'div',
        { class: 'chatdock__controls' },
        h(
          'button',
          {
            class: 'icon-button icon-button--sm',
            type: 'button',
            'aria-label': ui.chatExpanded ? 'Recolher' : 'Expandir',
            title: ui.chatExpanded ? 'Recolher' : 'Expandir',
            onClick: () => {
              ui.chatExpanded = !ui.chatExpanded;
              render();
            },
          },
          icon(ui.chatExpanded ? 'collapse' : 'expand'),
        ),
        h(
          'button',
          { class: 'icon-button icon-button--sm', type: 'button', 'aria-label': 'Fechar chat', title: 'Fechar', onClick: toggleChat },
          icon('close'),
        ),
      ),
    ),
    h(
      'div',
      { class: 'chatdock__log', id: 'chat-log' },
      chat.messages.length
        ? [chat.messages.map(chatMessage), busy && chatPending(chat.id)]
        : h(
            'div',
            { class: 'chatdock__empty' },
            h('p', null, 'Nenhuma mensagem ainda'),
            h('p', { class: 'muted small' }, 'Pergunte sobre o que foi dito no huddle até agora.'),
          ),
    ),
    h(
      'form',
      {
        class: 'chatdock__input',
        onSubmit: (event) => {
          event.preventDefault();
          sendChat();
        },
      },
      h(
        'div',
        { class: 'chatdock__field' },
        h('input', {
          id: 'chat-input',
          type: 'text',
          value: draft,
          autocomplete: 'off',
          placeholder: 'Faça uma pergunta rápida',
          'aria-label': 'Pergunta para a reunião',
          onInput: (event) => {
            ui.chatDrafts[chat.id] = event.target.value;
            const send = document.getElementById('chat-send');
            if (send) send.disabled = busy || !event.target.value.trim();
          },
          onFocus: () => (ui.chatInputFocused = true),
          onBlur: () => {
            ui.chatInputFocused = false;
            flushPendingRender(); // apply any live updates we held back while typing
          },
        }),
        h('button', { id: 'chat-send', class: 'chatdock__send', type: 'submit', 'aria-label': 'Enviar', disabled: busy || !draft.trim() }, icon('enter')),
      ),
    ),
  );
}

function liveView() {
  const content = ui.tab === 'insights' ? insightsView() : ui.tab === 'captions' ? captionsView() : ataView();
  const main = h('main', { class: `main main--${ui.tab}`, id: 'main' }, content);
  const parts = [header(), tabs(), infoBar(), main, footer()];
  if (ui.chatOpen) parts.push(chatDock());
  if (ui.tab === 'captions' && state.huddle.active && state.utterances.length) {
    parts.push(
      h(
        'button',
        {
          class: ui.follow ? 'follow' : 'follow follow--paused',
          type: 'button',
          'aria-pressed': String(ui.follow),
          onClick: () => {
            ui.follow = true;
            scrollCaptions();
          },
        },
        h('span', { class: 'dot' }),
        ui.follow ? 'Seguindo ao vivo' : 'Voltar ao vivo',
      ),
    );
  }
  return parts;
}

function checkItem(ok, title, detail) {
  return h(
    'div',
    { class: 'check' },
    h('span', { class: ok ? 'check__mark check__mark--ok' : 'check__mark' }, ok && icon('check')),
    h('span', { class: 'row__stack' }, h('span', { class: 'strong' }, title), h('span', { class: 'muted small' }, detail)),
  );
}

function idleView() {
  const saved = allMinutes().length;
  return [
    header(),
    h(
      'main',
      { class: 'idle' },
      h(
        'div',
        { class: 'idle__hero' },
        h('div', { class: 'idle__icon' }, icon('headphones')),
        h('h1', null, 'Nenhum huddle ativo'),
        h('p', null, 'Entre num huddle pelo Slack no navegador e abra a aba ', h('b', null, 'Captions'), '. Os insights aparecem aqui.'),
      ),
      slackReloadTabId != null &&
        h(
          'div',
          { class: 'banner' },
          h('span', { class: 'badge-icon badge-icon--yellow' }, icon('warn')),
          h(
            'div',
            { class: 'row__stack' },
            h('span', { class: 'strong' }, 'Já tem um huddle rolando?'),
            h(
              'span',
              { class: 'muted small' },
              'Esta aba do Slack foi aberta antes da extensão, então um huddle já em andamento não é capturado. Recarregue a aba para começar.',
            ),
            h('button', { class: 'button button--primary button--block', type: 'button', onClick: reloadSlackTab }, icon('download'), 'Recarregar aba do Slack'),
          ),
        ),
      h(
        'section',
        { class: 'checklist', 'aria-label': 'O que falta' },
        checkItem(slackOpen, 'Slack aberto no navegador', 'app.slack.com'),
        checkItem(false, 'Janela do huddle aberta', 'Inicie ou entre num huddle'),
        checkItem(false, 'Captions ativadas', 'Aba Captions na janela do huddle'),
      ),
      slackOpen &&
        h(
          'p',
          { class: 'muted small center' },
          'Huddle já aberto e nada aqui? Recarregue a aba do Slack (o huddle precisa ser aberto depois da extensão) e entre de novo.',
        ),
      h(
        'div',
        { class: 'idle__footer' },
        h('button', { class: 'button button--primary button--block', type: 'button', onClick: goToSlack }, 'Ir para o Slack'),
        h('button', { class: 'button button--block', type: 'button', onClick: openImport }, icon('upload'), 'Importar transcrição'),
        saved > 0 &&
          h('button', { class: 'button button--block', type: 'button', onClick: openAtas }, `Sessões anteriores (${saved})`),
        h(
          'p',
          { class: 'muted small center' },
          'As legendas ficam no seu navegador. Só o texto analisado é enviado à API da Anthropic para gerar os insights.',
        ),
      ),
    ),
  ];
}

function selectTag(tag) {
  ui.atasTag = ui.atasTag === tag ? null : tag;
  render();
}

function atasView() {
  const records = allMinutes();
  const tags = tagCounts(records);
  if (ui.atasTag && !tags.some(([t]) => t === ui.atasTag)) ui.atasTag = null;
  const list = h('div', { id: 'atas-list' }, atasList(records, ui.atasQuery, ui.atasTag, openPastAta, loadSession));
  return [
    h(
      'header',
      { class: 'header' },
      h('button', { class: 'icon-button', type: 'button', 'aria-label': 'Voltar', onClick: closeAtas }, icon('back')),
      h('h1', { class: 'header__app' }, 'Sessões anteriores'),
      h('span', { class: 'muted small' }, `${records.length} ${records.length === 1 ? 'sessão' : 'sessões'}`),
      h(
        'button',
        { class: 'icon-button', type: 'button', 'aria-label': 'Importar transcrição', title: 'Importar transcrição', onClick: openImport },
        icon('upload'),
      ),
    ),
    h(
      'div',
      { class: 'searchbar' },
      h(
        'label',
        { class: 'search' },
        icon('search'),
        h('input', {
          type: 'search',
          placeholder: 'Buscar por tag, pessoa ou assunto',
          'aria-label': 'Buscar sessões',
          value: ui.atasQuery,
          onInput: (event) => {
            ui.atasQuery = event.target.value;
            document.getElementById('atas-list')?.replaceChildren(...[atasList(allMinutes(), ui.atasQuery, ui.atasTag, openPastAta, loadSession)].flat());
          },
        }),
      ),
    ),
    tags.length > 0 &&
      h(
        'div',
        { class: 'tagbar', role: 'group', 'aria-label': 'Filtrar por tag' },
        ui.atasTag &&
          h('button', { class: 'chip chip--clear', type: 'button', onClick: () => selectTag(ui.atasTag) }, icon('close'), 'Limpar'),
        tags.map(([tag, count]) =>
          h(
            'button',
            { class: ui.atasTag === tag ? 'chip chip--on' : 'chip', type: 'button', 'aria-pressed': String(ui.atasTag === tag), onClick: () => selectTag(tag) },
            tag,
            h('span', { class: 'chip__count' }, String(count)),
          ),
        ),
      ),
    h('main', { class: 'main main--atas', id: 'main' }, list),
    h(
      'footer',
      { class: 'footer' },
      h('p', { class: 'muted small' }, 'As sessões ficam só neste navegador. Apague em Configurações › Privacidade.'),
    ),
  ];
}

function pastAtaView() {
  const record = ui.viewingAta;
  return [
    h(
      'header',
      { class: 'header' },
      h('button', { class: 'icon-button', type: 'button', 'aria-label': 'Voltar', onClick: closePastAta }, icon('back')),
      h(
        'div',
        { class: 'header__titles' },
        h('span', { class: 'header__app' }, 'Sessão'),
        h('span', { class: 'header__sub' }, formatDateTime(record.meta.startedAt)),
      ),
      record.huddleId === state.huddle?.id
        ? h('span', { class: 'pill' }, 'No app')
        : h(
            'button',
            { class: 'button button--small button--primary', type: 'button', onClick: () => loadSession(record) },
            icon('download'),
            'Carregar',
          ),
    ),
    h('main', { class: 'main', id: 'main' }, ataContent(record, ataContext(record))),
    ataFooter(record, ataContext(record)),
  ];
}

function importView() {
  return [
    h(
      'header',
      { class: 'header' },
      h('button', { class: 'icon-button', type: 'button', 'aria-label': 'Voltar', onClick: closeImport }, icon('back')),
      h('h1', { class: 'header__app' }, 'Importar transcrição'),
    ),
    h(
      'main',
      { class: 'main', id: 'main' },
      h(
        'form',
        { class: 'settings', id: 'import-form', onSubmit: importSession },
        h(
          'p',
          { class: 'muted small' },
          'Cole aqui a transcrição de uma reunião que não passou pela extensão. Ela vira uma sessão carregada no app, com ata e insights gerados. Linhas no formato ',
          h('b', null, 'Nome: fala'),
          ' são separadas por pessoa.',
        ),
        field(
          'Título (opcional)',
          'import-title',
          h('input', { id: 'import-title', type: 'text', autocomplete: 'off', placeholder: 'Ex.: Planejamento Q4' }),
        ),
        field(
          'Transcrição',
          'import-text',
          h('textarea', { id: 'import-text', class: 'textarea', rows: 12, placeholder: 'Ana: acho que o Lucas pode tocar billing.\nLucas: consigo entregar até sexta.\n…' }),
        ),
        ui.importError && h('div', { class: 'notice notice--error', role: 'status' }, ui.importError),
      ),
    ),
    h(
      'footer',
      { class: 'footer footer--row' },
      h('span', { class: 'muted small' }, settings.apiKey ? 'Gera a ata e os insights.' : 'Adicione a chave da API para gerar.'),
      h('button', { class: 'button', type: 'button', onClick: closeImport }, 'Cancelar'),
      h('button', { class: 'button button--primary', type: 'submit', form: 'import-form' }, icon('upload'), 'Importar'),
    ),
  ];
}

function field(label, id, control, hint) {
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint && h('span', { class: 'muted small' }, hint));
}

function select(id, options, value) {
  return h(
    'select',
    { id },
    options.map(([optionValue, label]) => h('option', { value: optionValue, selected: String(optionValue) === String(value) }, label)),
  );
}

function toggle(id, label, checked) {
  return h('label', { class: 'toggle' }, h('input', { type: 'checkbox', id, checked }), h('span', null, label));
}

function settingsView() {
  const form = h(
    'form',
    { class: 'settings', id: 'settings-form', onSubmit: saveSettings },
    h(
      'section',
      { class: 'stack' },
      h('h2', { class: 'section__title' }, 'Inteligência'),
      field(
        'Chave da API Anthropic',
        'apiKey',
        h('input', { id: 'apiKey', type: 'password', value: settings.apiKey, autocomplete: 'off', placeholder: 'sk-ant-…' }),
        'Fica só neste navegador (chrome.storage.local).',
      ),
      field('Modelo', 'model', select('model', MODELS.map((m) => [m.id, m.label]), settings.model)),
      h(
        'div',
        { class: 'field-row' },
        field('Idioma', 'language', select('language', LANGUAGES.map((l) => [l, l]), settings.language)),
        field('Analisar a cada', 'freq', select('freq', FREQUENCIES.map((f) => [f, `${f} s`]), settings.freq)),
      ),
      field(
        'Seu nome no huddle',
        'userName',
        h('input', { id: 'userName', type: 'text', value: settings.userName, autocomplete: 'off', placeholder: 'Como você aparece nas legendas' }),
        'Usado para separar os "Alertas pra você" — menções, ações e perguntas dirigidas a você.',
      ),
    ),
    h('hr'),
    h(
      'section',
      { class: 'stack' },
      h('h2', { class: 'section__title' }, 'Legendas'),
      field(
        'Como capturar',
        'captionSource',
        select('captionSource', CAPTION_SOURCES, settings.captionSource),
        'Automático começa a capturar assim que a legenda liga, sem precisar abrir a aba Captions: usa o painel quando a aba está aberta (transcrição completa) e as legendas sobre os vídeos quando não. Vale ao reler a aba do Slack.',
      ),
    ),
    h('hr'),
    h(
      'section',
      { class: 'stack stack--tight' },
      h('h2', { class: 'section__title' }, 'Insights'),
      toggle('detect-alerts', 'Alertas pra você (menções, ações, perguntas)', settings.detect.alerts),
      toggle('detect-actions', 'Ações e responsáveis', settings.detect.actions),
      toggle('detect-decisions', 'Decisões', settings.detect.decisions),
      toggle('detect-questions', 'Perguntas em aberto', settings.detect.questions),
      toggle('detect-suggestions', 'Sugestões do que falar', settings.detect.suggestions),
      toggle('detect-references', 'Referências (livros, apps, links)', settings.detect.references),
      toggle('detect-acronyms', 'Siglas citadas', settings.detect.acronyms),
    ),
    h('hr'),
    h(
      'section',
      { class: 'stack stack--tight' },
      h('h2', { class: 'section__title' }, 'Ata'),
      toggle('autoMinutes', 'Gerar a ata ao encerrar o huddle', settings.autoMinutes),
    ),
    h('hr'),
    h(
      'section',
      { class: 'stack stack--tight' },
      h('h2', { class: 'section__title' }, 'Google Drive'),
      driveState.connected
        ? h(
            'p',
            { class: 'muted small' },
            driveState.email ? `Conectado como ${driveState.email}. ` : 'Conectado. ',
            'Envie a ata de qualquer huddle ao Drive pelo botão de nuvem na aba Ata.',
          )
        : h(
            'p',
            { class: 'muted small' },
            'Conecte para enviar as atas ao seu Drive. A extensão só acessa os arquivos que ela mesma cria (escopo drive.file).',
          ),
      h(
        'div',
        { class: 'buttons buttons--start' },
        driveState.connected
          ? h('button', { id: 'drive-connect-btn', class: 'button', type: 'button', onClick: disconnectDrive }, 'Desconectar')
          : ui.driveConnecting
            ? h(
                'button',
                { id: 'drive-connect-btn', class: 'button button--primary', type: 'button', disabled: true },
                h('span', { class: 'spinner', 'aria-hidden': 'true' }),
                'Abrindo janela do Google…',
              )
            : h('button', { id: 'drive-connect-btn', class: 'button button--primary', type: 'button', onClick: connectDrive }, 'Conectar Google Drive'),
      ),
    ),
    h('hr'),
    h(
      'section',
      { class: 'stack stack--tight' },
      h('h2', { class: 'section__title' }, 'Privacidade'),
      toggle('saveHistory', 'Salvar histórico de huddles e sessões', settings.saveHistory),
      h(
        'div',
        { class: 'buttons buttons--start' },
        h('button', { class: 'button button--danger', type: 'button', onClick: clearHistory }, 'Apagar histórico'),
        h('button', { class: 'button', type: 'button', onClick: runDiagnostics }, 'Diagnóstico'),
        h('button', { class: 'button', type: 'button', onClick: openLogs }, 'Ver logs'),
      ),
      ui.notice && h('p', { class: 'muted small', role: 'status' }, ui.notice),
    ),
  );
  return [
    h(
      'header',
      { class: 'header' },
      h('button', { class: 'icon-button', type: 'button', 'aria-label': 'Voltar', onClick: closeSettings }, icon('back')),
      h('h1', { class: 'header__app' }, 'Configurações'),
    ),
    h('main', { class: 'main', id: 'settings-main' }, form),
    h(
      'footer',
      { class: 'footer footer--row' },
      h('span', { class: 'muted small' }, `v${chrome.runtime.getManifest().version}`),
      h('button', { class: 'button', type: 'button', onClick: closeSettings }, 'Cancelar'),
      h('button', { class: 'button button--primary', type: 'submit', form: 'settings-form' }, 'Salvar'),
    ),
  ];
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('pt-BR', { hour12: false });
}

function logEntryAsText(entry) {
  const data = entry.data == null ? '' : ` ${JSON.stringify(entry.data)}`;
  return `${formatTime(entry.at)} [${entry.level}] ${entry.source}: ${entry.message}${data}`;
}

function logsAsText() {
  return logs.map(logEntryAsText).join('\n');
}

function logsView() {
  return [
    h(
      'header',
      { class: 'header' },
      h('button', { class: 'icon-button', type: 'button', 'aria-label': 'Voltar', onClick: closeLogs }, icon('back')),
      h('h1', { class: 'header__app' }, 'Logs'),
      h('span', { class: 'muted small' }, `${logs.length} eventos`),
      h(
        'button',
        {
          class: 'icon-button',
          type: 'button',
          'aria-label': 'Copiar todos os logs',
          title: 'Copiar todos os logs',
          disabled: !logs.length,
          onClick: (event) => copyWithIcon(logsAsText(), event.currentTarget),
        },
        icon('copy'),
      ),
    ),
    h(
      'main',
      { class: 'main main--logs', id: 'main' },
      logs.length
        ? h(
            'ol',
            { class: 'logs', 'aria-label': 'Eventos' },
            logs.map((entry) =>
              h(
                'li',
                { class: `log log--${entry.level}` },
                h(
                  'div',
                  { class: 'log__meta' },
                  h('span', { class: 'log__time' }, formatTime(entry.at)),
                  h('span', { class: `log__level log__level--${entry.level}` }, LEVEL_LABELS[entry.level] ?? entry.level),
                  h('span', { class: 'log__source' }, entry.source),
                  h(
                    'button',
                    {
                      class: 'log__copy',
                      type: 'button',
                      'aria-label': 'Copiar este evento',
                      title: 'Copiar este evento',
                      onClick: (event) => copyWithIcon(logEntryAsText(entry), event.currentTarget),
                    },
                    icon('copy'),
                  ),
                ),
                h('p', { class: 'log__message' }, entry.message),
                entry.data != null && h('pre', { class: 'log__data' }, JSON.stringify(entry.data, null, 1)),
              ),
            ),
          )
        : h(
            'div',
            { class: 'empty' },
            h('p', null, 'Nenhum evento ainda. Recarregue a aba do Slack depois de recarregar a extensão para os logs começarem.'),
          ),
    ),
    h(
      'footer',
      { class: 'footer' },
      h(
        'div',
        { class: 'buttons' },
        h(
          'button',
          { class: 'button button--primary', type: 'button', disabled: !logs.length, onClick: (event) => copy(logsAsText(), event.currentTarget) },
          'Copiar logs',
        ),
        h('button', { class: 'button', type: 'button', disabled: !logs.length, onClick: clearLogs }, 'Limpar'),
      ),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Rendering

function scrollCaptions() {
  const main = document.getElementById('main');
  if (main) main.scrollTop = main.scrollHeight;
}

function currentView() {
  if (ui.logsOpen) return logsView();
  if (ui.settingsOpen) return settingsView();
  if (ui.importOpen) return importView();
  if (ui.viewingAta) return pastAtaView();
  if (ui.atasOpen) return atasView();
  return state.huddle ? liveView() : idleView();
}

function render() {
  renderPending = false;
  const main = document.getElementById('main');
  const previousScroll = main?.scrollTop ?? 0;
  const wasAtBottom = !main || main.scrollHeight - main.scrollTop - main.clientHeight < 40;

  // Keep the chat input usable across the frequent live re-renders (each new caption
  // rebuilds the DOM). Capture focus + caret BEFORE the rebuild — the removed input's
  // blur event would otherwise clear any flag we relied on.
  const chatInput = document.getElementById('chat-input');
  const chatHadFocus = !!chatInput && document.activeElement === chatInput;
  const chatCaret = chatHadFocus ? [chatInput.selectionStart, chatInput.selectionEnd] : null;

  app.replaceChildren(...currentView().filter(Boolean));

  const nextMain = document.getElementById('main');
  if (!nextMain) return;
  if (ui.logsOpen) {
    if (wasAtBottom) nextMain.scrollTop = nextMain.scrollHeight;
    else nextMain.scrollTop = previousScroll;
    return;
  }
  if (ui.tab === 'captions' && ui.follow && !ui.settingsOpen && !ui.atasOpen && !ui.viewingAta) scrollCaptions();
  else nextMain.scrollTop = previousScroll;
  nextMain.addEventListener('scroll', onMainScroll, { passive: true });

  if (ui.chatOpen && !ui.settingsOpen && !ui.atasOpen && !ui.viewingAta) {
    scrollChat();
    if (chatHadFocus) {
      const next = document.getElementById('chat-input');
      if (next) {
        next.focus();
        if (chatCaret) next.setSelectionRange(chatCaret[0], chatCaret[1]);
      }
    }
  }
}

function onMainScroll(event) {
  if (ui.tab !== 'captions' || ui.settingsOpen || ui.atasOpen || ui.viewingAta) return;
  const main = event.currentTarget;
  const atBottom = main.scrollHeight - main.scrollTop - main.clientHeight < 40;
  if (atBottom !== ui.follow) {
    ui.follow = atBottom;
    render();
  }
}

// Coalesces the frequent storage-driven re-renders (a live huddle writes state on every
// caption) into at most one rebuild per animation frame. Each render rebuilds the whole
// panel, so doing it mid-interaction drops clicks (the button node is replaced before the
// click resolves) and resets scrollTop. We hold renders while the user is touching the UI.
let renderScheduled = false;
let renderPending = false;
let pointerDown = false;
let lastScrollAt = 0;
let scrollSettleTimer = null;

// A rebuild now would fight something the user is doing.
function interactionBlocksRender() {
  if (document.activeElement?.id === 'chat-input') return true; // typing in the chat
  if (pointerDown) return true; // pressing a button / dragging the scrollbar
  if (Date.now() - lastScrollAt < 250) return true; // actively scrolling
  return false;
}

function scheduleRender() {
  if (interactionBlocksRender()) {
    renderPending = true;
    return;
  }
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    render();
  });
}

function flushPendingRender() {
  if (!renderPending) return;
  renderPending = false;
  scheduleRender();
}

// Tracks interaction globally so scheduleRender can hold off; applies the held render once
// the pointer lifts or scrolling settles.
function watchInteraction() {
  document.addEventListener('pointerdown', () => (pointerDown = true), true);
  document.addEventListener('pointerup', () => {
    pointerDown = false;
    flushPendingRender();
  }, true);
  document.addEventListener('pointercancel', () => {
    pointerDown = false;
    flushPendingRender();
  }, true);
  document.addEventListener(
    'scroll',
    () => {
      lastScrollAt = Date.now();
      clearTimeout(scrollSettleTimer);
      scrollSettleTimer = setTimeout(flushPendingRender, 300);
    },
    { capture: true, passive: true },
  );
}

// Re-renders from storage changes, except on screens with inputs being typed into.
function refresh() {
  if (!ui.settingsOpen && !ui.atasOpen && !ui.importOpen) scheduleRender();
}

// ---------------------------------------------------------------------------
// Actions

function openSettings() {
  ui.settingsOpen = true;
  ui.notice = null;
  render();
}

function closeSettings() {
  ui.settingsOpen = false;
  render();
}

// Logs open from the header or from settings; going back returns to where they came from.
function openLogs() {
  ui.logsReturnToSettings = ui.settingsOpen;
  ui.settingsOpen = false;
  ui.logsOpen = true;
  app.replaceChildren(); // start scrolled to the newest entry
  render();
}

function closeLogs() {
  ui.logsOpen = false;
  ui.settingsOpen = ui.logsReturnToSettings;
  render();
}

async function clearLogs() {
  await chrome.storage.session.remove('logs');
}

function openAtas() {
  ui.atasOpen = true;
  ui.viewingAta = null;
  app.replaceChildren(); // start at the top of the list
  render();
}

function closeAtas() {
  ui.atasOpen = false;
  ui.atasQuery = '';
  ui.atasTag = null;
  render();
}

function openPastAta(record) {
  ui.viewingAta = record;
  app.replaceChildren();
  render();
}

function closePastAta() {
  ui.viewingAta = null;
  app.replaceChildren();
  render();
}

// ---------------------------------------------------------------------------
// Import a transcript captured outside the extension

// "12:00" / "01:02:03" / "[00:12]" -> milliseconds, or null.
function parseStamp(value) {
  const parts = value.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  const sec = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  return sec * 1000;
}

// A short, punctuation-free label is probably a speaker name, not a sentence with a colon.
function looksLikeSpeaker(name) {
  const text = name.trim();
  return !!text && text.length <= 40 && !/[.!?]/.test(text) && text.split(/\s+/).length <= 5;
}

// Turns pasted transcript text into utterances. Handles "Name: text" lines (with an
// optional leading [hh:mm:ss] stamp) and folds continuation lines into the last speaker.
// Falls back to one line per utterance when no speaker labels are found.
function parseTranscript(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const line = /^\s*(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+)?([^:]{1,40}?)\s*:\s*(.+?)\s*$/;
  const out = [];
  let base = null;
  let matchedAny = false;
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const match = trimmed.match(line);
    if (match && looksLikeSpeaker(match[2])) {
      matchedAny = true;
      const stamp = match[1] ? parseStamp(match[1]) : null;
      if (stamp != null && base == null) base = stamp;
      const at = stamp != null && base != null ? stamp - base : (out.at(-1)?.at ?? 0);
      out.push({ id: `imp-${out.length}`, speaker: match[2].trim(), text: match[3].trim(), at });
    } else if (out.length) {
      out[out.length - 1].text += ` ${trimmed}`;
    } else {
      out.push({ id: `imp-${out.length}`, speaker: 'Transcrição', text: trimmed, at: 0 });
    }
  }
  if (!matchedAny) {
    return lines
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l, i) => ({ id: `imp-${i}`, speaker: 'Transcrição', text: l, at: 0 }));
  }
  return out;
}

function openImport() {
  ui.importOpen = true;
  ui.importError = null;
  ui.atasOpen = false;
  ui.viewingAta = null;
  app.replaceChildren();
  render();
}

function closeImport() {
  ui.importOpen = false;
  render();
}

// Writes an imported huddle into the history archive so it lists like any other session.
async function archiveImported(huddle, utterances) {
  if (!settings.saveHistory) return;
  const { history: saved = [] } = await chrome.storage.local.get('history');
  const entry = { huddle, utterances, insights: null, minutes: null };
  await chrome.storage.local.set({ history: [entry, ...saved].slice(0, 20) });
}

// Updates an archived entry's insights after they are generated.
async function saveInsightsToHistory(huddleId, data) {
  if (!settings.saveHistory) return;
  const { history: saved = [] } = await chrome.storage.local.get('history');
  const index = saved.findIndex((entry) => entry.huddle?.id === huddleId);
  if (index < 0) return;
  saved[index] = { ...saved[index], insights: data };
  await chrome.storage.local.set({ history: saved });
}

// Generates the insights for a just-loaded huddle (the live loop only runs while active).
async function analyzeOnce(huddleId) {
  if (!settings.apiKey || analysis.running) return;
  analysis.running = true;
  analysis.error = null;
  refresh();
  try {
    const data = await analyze({ settings, utterances: state.utterances, previous: null });
    if (state.huddle?.id !== huddleId) return;
    const record = { huddleId, updatedAt: Date.now(), data };
    insights = record;
    await chrome.storage.session.set({ insights: record });
    await saveInsightsToHistory(huddleId, data);
  } catch (error) {
    analysis.error = error.message;
    logEvent('error', `Falha na análise da importação: ${error.message}`);
  } finally {
    analysis.running = false;
    refresh();
  }
}

async function importSession(event) {
  event.preventDefault();
  const title = document.getElementById('import-title').value.trim();
  const text = document.getElementById('import-text').value;
  const utterances = parseTranscript(text);
  if (utterances.length === 0) {
    ui.importError = 'Cole a transcrição no campo de texto para importar.';
    render();
    return;
  }
  const now = Date.now();
  const span = utterances.at(-1).at || (utterances.length - 1) * 1000;
  const huddle = {
    id: `import-${now.toString(36)}`,
    title: title || 'Sessão importada',
    captions: true,
    language: null,
    startedAt: now - span,
    endedAt: now,
    active: false,
    archived: true,
    loaded: true,
    imported: true,
  };
  const nextState = { huddle, utterances };
  state = nextState;
  insights = null;
  minutes = null;
  await chrome.storage.session.set({ state: nextState });
  await chrome.storage.session.remove(['insights', 'minutes']);
  await archiveImported(huddle, utterances);
  analysis.lastKey = transcriptKey(); // inactive — don't let the live loop re-run it
  analysis.error = null;
  minutesJob.error = null;
  minutesJob.failedFor = null;
  ui.importOpen = false;
  ui.tab = 'insights';
  app.replaceChildren();
  render();
  logEvent('info', `Transcrição importada: ${utterances.length} falas, ${speakers()} participantes`);
  if (!settings.apiKey) {
    flash('Transcrição importada. Adicione a chave da API para gerar a ata e os insights.');
    return;
  }
  flash('Transcrição importada. Gerando a ata e os insights…');
  analyzeOnce(huddle.id); // insights in the background
  runMinutes(); // ata (switches to the Ata tab to show progress)
}

// Loads a past session into the app: its transcript, insights and minutes become the
// current state, so the panel shows what it showed that day and the chat can answer about it.
async function loadSession(record) {
  if (record.huddleId === state.huddle?.id) {
    flash('Esta sessão já está carregada no app.');
    return;
  }
  const entry = history.find((item) => (item.huddle?.id ?? item.minutes?.huddleId) === record.huddleId);
  if (!entry?.huddle) {
    flash('Não encontrei os dados completos desta sessão.');
    return;
  }
  const huddle = { ...entry.huddle, active: false, archived: true, loaded: true };
  const nextState = { huddle, utterances: entry.utterances ?? [] };
  const nextInsights = entry.insights ? { huddleId: huddle.id, updatedAt: entry.minutes?.generatedAt ?? Date.now(), data: entry.insights } : null;
  const nextMinutes = entry.minutes ?? null;

  await chrome.storage.session.set({ state: nextState });
  if (nextInsights) await chrome.storage.session.set({ insights: nextInsights });
  else await chrome.storage.session.remove('insights');
  if (nextMinutes) await chrome.storage.session.set({ minutes: nextMinutes });
  else await chrome.storage.session.remove('minutes');

  state = nextState;
  insights = nextInsights;
  minutes = nextMinutes;
  analysis.lastKey = transcriptKey(); // don't re-analyze a loaded (inactive) session
  analysis.error = null;
  minutesJob.error = null;
  minutesJob.failedFor = null;
  ui.viewingAta = null;
  ui.atasOpen = false;
  ui.atasQuery = '';
  ui.tab = 'insights';
  app.replaceChildren();
  render();
  flash('Sessão carregada. Pergunte sobre ela no chat ou veja as abas.');
}

async function saveSettings(event) {
  event.preventDefault();
  const value = (id) => document.getElementById(id).value;
  const checked = (id) => document.getElementById(id).checked;
  settings = {
    apiKey: value('apiKey').trim(),
    model: value('model'),
    language: value('language'),
    freq: Number(value('freq')),
    userName: value('userName').trim(),
    captionSource: value('captionSource'),
    detect: {
      alerts: checked('detect-alerts'),
      actions: checked('detect-actions'),
      decisions: checked('detect-decisions'),
      questions: checked('detect-questions'),
      suggestions: checked('detect-suggestions'),
      references: checked('detect-references'),
      acronyms: checked('detect-acronyms'),
    },
    autoMinutes: checked('autoMinutes'),
    saveHistory: checked('saveHistory'),
  };
  await chrome.storage.local.set({ settings });
  analysis.error = null;
  analysis.lastKey = ''; // re-analyze with the new settings
  minutesJob.failedFor = null;
  closeSettings();
}

async function setAutoMinutes(value) {
  settings = { ...settings, autoMinutes: value };
  await chrome.storage.local.set({ settings });
}

async function clearHistory() {
  await chrome.storage.local.remove('history');
  ui.notice = 'Histórico e sessões apagados.';
  render();
}

async function runDiagnostics() {
  const tabId = state.huddle?.tabId ?? (await chrome.tabs.query({ url: 'https://app.slack.com/*' }))[0]?.id;
  if (!tabId) {
    ui.notice = 'Nenhuma aba do Slack aberta.';
    render();
    return;
  }
  try {
    const dump = await chrome.tabs.sendMessage(tabId, { type: 'debug:dump' });
    if (!dump) throw new Error('sem resposta; recarregue a aba do Slack');
    await navigator.clipboard.writeText(JSON.stringify(dump, null, 2));
    ui.notice = dump.huddle
      ? `Huddle encontrado, legendas ${dump.captionsFound ? 'encontradas' : 'não encontradas'}, ${dump.rows} falas. O diagnóstico foi copiado para a área de transferência.`
      : `Nenhuma janela de huddle detectada (${dump.popupsTracked} janelas acompanhadas). Recarregue a aba do Slack e abra o huddle de novo.`;
  } catch (error) {
    ui.notice = `Não consegui ler o Slack (${error.message}).`;
  }
  render();
}

let flashTimer = null;
function flash(text) {
  ui.flash = text;
  refresh();
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    ui.flash = null;
    refresh();
  }, 8000);
}

async function copyText(text, button) {
  if (button.classList.contains('button--small')) {
    await navigator.clipboard.writeText(text);
    const children = [...button.childNodes];
    button.replaceChildren(icon('check'), 'Copiado');
    setTimeout(() => button.replaceChildren(...children), 1500);
  } else {
    await copy(text, button);
  }
}

// Drafts the text in the huddle's Thread composer; the user reviews and sends it in Slack.
async function postToThread(text) {
  const tabId = state.huddle?.tabId;
  if (!tabId) return flash('Janela do huddle não encontrada.');
  try {
    const result = await chrome.tabs.sendMessage(tabId, { type: 'thread:draft', text });
    if (!result?.ok) throw new Error(result?.error ?? 'sem resposta da janela do huddle');
    flash('Texto colocado no thread do huddle. Revise e envie no Slack, depois volte para a aba Captions.');
  } catch (error) {
    flash(`Não consegui postar no thread: ${error.message}`);
  }
}

// Accept/dismiss a personal alert. An accepted action also joins the Ações checklist.
function acceptAlert(alert) {
  acked.add(alert.text);
  if (alert.kind === 'action') done.delete(alert.text); // keep it open in the checklist
  flash(alert.kind === 'action' ? 'Ação aceita.' : 'Alerta marcado como visto.');
  render();
}

// Draft the alert's text into the huddle thread so the user can edit and send a reply.
function editAlert(alert) {
  acked.add(alert.text);
  postToThread(alert.text);
  render();
}

async function goToSlack() {
  const [tab] = await chrome.tabs.query({ url: 'https://app.slack.com/*' });
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: 'https://app.slack.com/' });
  }
}

function fileStamp(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

function downloadTranscript() {
  download(`huddle-${fileStamp(state.huddle.startedAt)}.txt`, `${state.huddle.title ?? 'Huddle'}\n\n${formatTranscript(state.utterances)}\n`);
}

function downloadMinutes(record) {
  download(`ata-${fileStamp(record.meta.startedAt)}.md`, `${minutesAsText(record)}\n`, 'text/markdown');
}

// ---------------------------------------------------------------------------
// Google Drive

async function refreshDriveStatus() {
  try {
    driveState = await drive.status();
  } catch {
    driveState = { connected: false, email: null };
  }
  refresh();
}

async function connectDrive() {
  // Disable the button and show progress in place (no re-render), so the view does not jump
  // while Chrome opens the Google auth window — which can take a moment.
  const scrollTop = document.getElementById('settings-main')?.scrollTop ?? 0;
  ui.driveConnecting = true;
  const btn = document.getElementById('drive-connect-btn');
  if (btn) {
    btn.disabled = true;
    btn.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Abrindo janela do Google…');
  }
  try {
    driveState = await drive.connect();
    ui.notice = driveState.email ? `Conectado como ${driveState.email}.` : 'Google Drive conectado.';
  } catch (error) {
    ui.notice = error.message;
  } finally {
    ui.driveConnecting = false;
  }
  render();
  const next = document.getElementById('settings-main');
  if (next) next.scrollTop = scrollTop;
}

async function disconnectDrive() {
  const scrollTop = document.getElementById('settings-main')?.scrollTop ?? 0;
  await drive.disconnect();
  driveState = { connected: false, email: null };
  ui.notice = 'Google Drive desconectado.';
  render();
  const next = document.getElementById('settings-main');
  if (next) next.scrollTop = scrollTop;
}

// Writes the upload result onto the current (session) and archived (history) minutes record.
async function persistDrive(record, info) {
  const { minutes: sessionMinutes } = await chrome.storage.session.get('minutes');
  if (sessionMinutes?.huddleId === record.huddleId) {
    await chrome.storage.session.set({ minutes: { ...sessionMinutes, drive: info } });
  }
  const { history: saved = [] } = await chrome.storage.local.get('history');
  const index = saved.findIndex((entry) => entry.minutes?.huddleId === record.huddleId);
  if (index >= 0 && saved[index].minutes) {
    saved[index] = { ...saved[index], minutes: { ...saved[index].minutes, drive: info } };
    await chrome.storage.local.set({ history: saved });
  }
}

// Uploads the minutes as a Markdown file to the user's Drive. The first upload prompts for consent.
async function uploadToDrive(record) {
  if (ui.driveBusy) return;
  ui.driveBusy = record.huddleId;
  render();
  try {
    const name = `ata-${fileStamp(record.meta.startedAt)}.md`;
    const file = await drive.upload({ name, content: `${minutesAsText(record)}\n`, mimeType: 'text/markdown' });
    const info = { fileId: file.id, link: file.webViewLink ?? null, at: Date.now() };
    record.drive = info; // reflect immediately in the open view
    if (ui.viewingAta?.huddleId === record.huddleId) ui.viewingAta = { ...ui.viewingAta, drive: info };
    await persistDrive(record, info);
    if (!driveState.connected) await refreshDriveStatus();
    logEvent('info', 'Ata enviada ao Google Drive', { arquivo: file.name ?? name });
    flash('Ata enviada ao Google Drive.');
  } catch (error) {
    logEvent('error', `Falha ao enviar ao Drive: ${error.message}`);
    flash(`Não consegui enviar ao Drive: ${error.message}`);
  } finally {
    ui.driveBusy = null;
    render();
  }
}

function insightsAsText(data) {
  const list = (title, items) => (items.length ? [`*${title}*`, ...items.map((item) => `• ${item}`), ''] : []);
  return [
    `*${data.topic.title}*`,
    data.topic.summary,
    '',
    ...list('Pontos levantados', data.points),
    ...(settings.detect.actions ? list('Ações', data.actions.map((a) => (a.owner ? `${a.text} (${a.owner})` : a.text))) : []),
    ...(settings.detect.decisions ? list('Decisões', data.decisions) : []),
    ...(settings.detect.questions ? list('Em aberto', data.open_questions) : []),
    ...(settings.detect.references
      ? list('Referências', (data.references ?? []).map((r) => [r.title, r.by, r.description].filter(Boolean).join(' — ')))
      : []),
    ...(settings.detect.acronyms ? list('Siglas', (data.acronyms ?? []).map((a) => (a.meaning ? `${a.term}: ${a.meaning}` : a.term))) : []),
  ]
    .join('\n')
    .trim();
}

// Adds the minutes to the archived huddle when the background already archived it.
async function saveMinutesToHistory(record) {
  if (!settings.saveHistory) return;
  const { history: saved = [] } = await chrome.storage.local.get('history');
  const index = saved.findIndex((entry) => entry.huddle?.id === record.huddleId);
  if (index < 0) return;
  saved[index] = { ...saved[index], minutes: record };
  await chrome.storage.local.set({ history: saved });
}

async function runMinutes() {
  if (minutesJob.running || !state.huddle || !settings.apiKey) return;
  const huddle = state.huddle;
  const utterances = state.utterances;
  minutesJob.running = true;
  minutesJob.startedAt = Date.now();
  minutesJob.error = null;
  ui.tab = 'ata';
  render();
  logEvent('info', `Gerando ata de ${utterances.length} falas com ${settings.model}`);
  try {
    const meta = minutesMeta(huddle, utterances);
    const data = await generateMinutes({ settings, meta, utterances });
    const record = { huddleId: huddle.id, generatedAt: Date.now(), model: settings.model, meta, data };
    await chrome.storage.session.set({ minutes: record });
    await saveMinutesToHistory(record);
    logEvent('info', `Ata gerada em ${((Date.now() - minutesJob.startedAt) / 1000).toFixed(1)}s`, {
      titulo: data.title,
      classificacao: data.classification.category,
      proximosPassos: data.next_steps.length,
    });
  } catch (error) {
    minutesJob.error = error.message;
    minutesJob.failedFor = huddle.id;
    logEvent('error', `Falha na ata: ${error.message}`);
  } finally {
    minutesJob.running = false;
    refresh();
  }
}

// When a huddle ends without minutes, write them once (if the user wants that).
function maybeGenerateMinutes() {
  const huddle = state.huddle;
  if (!huddle || huddle.active || huddle.loaded || !settings.autoMinutes || !settings.apiKey) return;
  if (minutesJob.running || currentMinutes() || minutesJob.failedFor === huddle.id) return;
  if (state.utterances.length < MIN_UTTERANCES_FOR_MINUTES) return;
  runMinutes();
}

// ---------------------------------------------------------------------------
// Live analysis loop

function transcriptKey() {
  const last = state.utterances.at(-1);
  return `${state.huddle?.id}:${state.utterances.length}:${last?.text.length ?? 0}`;
}

async function maybeAnalyze() {
  if (analysis.running || !state.huddle?.active || !settings.apiKey || !state.utterances.length) return;
  const key = transcriptKey();
  if (key === analysis.lastKey) return;
  if (Date.now() - analysis.lastRunAt < settings.freq * 1000) return;

  const huddle = state.huddle;
  analysis.running = true;
  analysis.lastRunAt = Date.now();
  refresh();
  logEvent('info', `Analisando ${state.utterances.length} falas com ${settings.model}`);
  const startedAt = Date.now();
  try {
    const data = await analyze({ settings, utterances: state.utterances, previous: currentInsights()?.data });
    logEvent('info', `Insights atualizados em ${((Date.now() - startedAt) / 1000).toFixed(1)}s`, {
      topico: data.topic.title,
      acoes: data.actions.length,
      decisoes: data.decisions.length,
    });
    analysis.lastKey = key;
    analysis.error = null;
    await chrome.storage.session.set({ insights: { huddleId: huddle.id, updatedAt: Date.now(), data } });
  } catch (error) {
    analysis.error = error.message;
    logEvent('error', `Falha na análise: ${error.message}`);
  } finally {
    analysis.running = false;
    refresh();
  }
}

function tick() {
  const clock = document.getElementById('clock');
  if (clock && state.huddle?.active) clock.textContent = formatClock(Date.now() - state.huddle.startedAt);
  const updated = document.getElementById('updated-ago');
  const current = currentInsights();
  if (updated && current) updated.textContent = ago(current.updatedAt);
  // The loading steps advance with elapsed time.
  if (minutesJob.running && ui.tab === 'ata') refresh();
  maybeAnalyze();
  maybeGenerateMinutes();
}

// ---------------------------------------------------------------------------
// Boot

async function loadSlackOpen() {
  const tabs = await chrome.tabs.query({ url: 'https://app.slack.com/*' });
  const next = tabs.length > 0;
  // A Slack tab opened before the extension (or before it was reloaded) has no content
  // scripts, so a huddle already running there is never picked up. Ping each tab; one that
  // doesn't answer needs a reload to start capturing.
  let staleTab = null;
  for (const tab of tabs) {
    try {
      const pong = await chrome.tabs.sendMessage(tab.id, { type: 'huddle:ping' });
      if (!pong?.ok) staleTab = tab.id;
    } catch {
      staleTab = tab.id; // no content script in this tab
    }
  }
  const nextStale = state.huddle?.active ? null : staleTab;
  if (next !== slackOpen || nextStale !== slackReloadTabId) {
    slackOpen = next;
    slackReloadTabId = nextStale;
    refresh();
  }
}

async function reloadSlackTab() {
  if (slackReloadTabId == null) return goToSlack();
  const tabId = slackReloadTabId;
  try {
    await chrome.tabs.reload(tabId);
    await chrome.tabs.update(tabId, { active: true });
    const tab = await chrome.tabs.get(tabId);
    if (tab?.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
    flash('Aba do Slack recarregada. Se o huddle estiver numa janela separada, reabra o huddle.');
  } catch (error) {
    flash(`Não consegui recarregar a aba do Slack: ${error.message}`);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session') {
    if (changes.state) state = changes.state.newValue ?? { huddle: null, utterances: [] };
    if (changes.insights) insights = changes.insights.newValue ?? null;
    if (changes.minutes) minutes = changes.minutes.newValue ?? null;
    if (changes.logs) {
      logs = changes.logs.newValue ?? [];
      if (!ui.logsOpen && !changes.state && !changes.insights && !changes.minutes) return;
    }
    refresh();
  }
  if (area === 'local') {
    if (changes.settings) settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
    if (changes.history) {
      history = changes.history.newValue ?? [];
      refresh();
    }
  }
});

async function boot() {
  const session = await chrome.storage.session.get(['state', 'insights', 'minutes', 'logs', 'chats']);
  const local = await chrome.storage.local.get(['settings', 'history']);
  state = session.state ?? state;
  insights = session.insights ?? null;
  minutes = session.minutes ?? null;
  logs = session.logs ?? [];
  if (session.chats) {
    chats = session.chats;
    ui.activeChatId = chats.list[0]?.id ?? null;
  }
  history = local.history ?? [];
  settings = {
    ...DEFAULT_SETTINGS,
    ...local.settings,
    detect: { ...DEFAULT_SETTINGS.detect, ...local.settings?.detect },
  };
  render();
  watchInteraction();
  loadSlackOpen();
  refreshDriveStatus();
  setInterval(tick, 1000);
  setInterval(loadSlackOpen, 5000);
}

boot();
