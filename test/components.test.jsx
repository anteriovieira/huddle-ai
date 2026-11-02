import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

// DOMPurify (used by the Markdown component) needs a browser-like global.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
global.window = dom.window;
global.document = dom.window.document;

const { renderToStaticMarkup } = await import('react-dom/server');
const { Icon } = await import('../src/sidepanel/ui/Icon.jsx');
const { Avatar } = await import('../src/sidepanel/ui/primitives.jsx');
const { Markdown } = await import('../src/sidepanel/ui/Markdown.jsx');
const { InsightsView } = await import('../src/sidepanel/views/Insights.jsx');
const { CaptionsView } = await import('../src/sidepanel/views/Captions.jsx');
const { AtaContent, AtaEmpty, AtasList } = await import('../src/sidepanel/views/Ata.jsx');
const { IdleView } = await import('../src/sidepanel/views/Idle.jsx');
const { Header, InfoBar } = await import('../src/sidepanel/views/Header.jsx');
const { TooltipProvider } = await import('../src/sidepanel/ui/Tooltip.jsx');
const React = await import('react');

const h = React.createElement;
const render = (el) => renderToStaticMarkup(el);

test('Icon renders an inline svg for a known name, nothing for unknown', () => {
  assert.match(render(h(Icon, { name: 'check' })), /<svg/);
  assert.equal(render(h(Icon, { name: 'does-not-exist' })), '');
});

test('Avatar shows initials with a deterministic color', () => {
  const html = render(h(Avatar, { name: 'Ana Paula' }));
  assert.match(html, />AP</);
  assert.match(html, /background/);
});

test('Markdown sanitizes and renders model text', () => {
  const html = render(h(Markdown, { text: '**bold** and `code`' }));
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
});

test('Markdown strips script tags', () => {
  const html = render(h(Markdown, { text: 'hi <script>alert(1)</script>' }));
  assert.doesNotMatch(html, /<script/);
});

const insightsCurrent = {
  huddleId: 'h1',
  updatedAt: Date.now(),
  data: {
    topic: { title: 'Tópico atual', summary: 'resumo do tópico' },
    topics: [{ title: 'Tópico atual', note: 'nota', line: 1 }],
    points: ['ponto importante'],
    actions: [{ text: 'fazer X', owner: 'Ana' }],
    decisions: ['decidimos Y'],
    open_questions: [{ text: 'e o Z?', line: 2, answer: 'o Z fica pra sexta' }],
    suggestions: ['perguntar sobre o suporte'],
    replies: [{ text: 'Pode ser na sexta mesmo.', re_line: 2 }],
    references: [{ kind: 'book', title: 'Clean Code', by: 'Martin', description: 'livro' }],
    acronyms: [{ term: 'API', meaning: 'interface' }],
    alerts: [{ kind: 'mention', text: 'Ana citou você', from: 'Ana', line: 1 }],
    focus: { on_agenda: true, since_line: 1 },
    marks: [{ line: 1, kind: 'action' }],
  },
};

const settings = {
  apiKeys: { anthropic: 'sk-ant-x' },
  detect: { alerts: true, actions: true, decisions: true, questions: true, suggestions: true, replies: true, references: true, acronyms: true },
};

test('InsightsView renders topic, sections and alerts from data', () => {
  const html = render(
    h(InsightsView, {
      current: insightsCurrent,
      settings,
      huddle: { active: true, startedAt: Date.now() - 1000 },
      utterances: [{ speaker: 'Ana', text: 'oi', at: 0 }],
      now: Date.now(),
      acked: new Set(),
      done: new Set(),
      topicExpanded: false,
      onToggleTopic() {},
      onAcceptAlert() {},
      onEditAlert() {},
      onToggleDone() {},
      onOpenSettings() {},
    }),
  );
  assert.match(html, /Tópico atual/);
  assert.match(html, /ponto importante/);
  assert.match(html, /fazer X/);
  assert.match(html, /decidimos Y/);
  assert.match(html, /Alertas pra você/);
  assert.match(html, /Clean Code/);
  assert.match(html, /Perguntas/);
  assert.match(html, /e o Z\?/);
  assert.match(html, /o Z fica pra sexta/);
  assert.match(html, /Pode ser na sexta mesmo\./);
  assert.match(html, /perguntar sobre o suporte/);
});

test('InsightsView prompts for an API key when missing', () => {
  const html = render(
    h(InsightsView, {
      current: null,
      settings: { apiKeys: {}, detect: settings.detect },
      huddle: { active: true, startedAt: 0 },
      utterances: [],
      now: Date.now(),
      acked: new Set(),
      done: new Set(),
      topicExpanded: false,
      onToggleTopic() {},
      onAcceptAlert() {},
      onEditAlert() {},
      onToggleDone() {},
      onOpenSettings() {},
    }),
  );
  assert.match(html, /Configurar chave/);
});

test('CaptionsView lists utterances and marks the live one', () => {
  const html = render(
    h(CaptionsView, {
      utterances: [
        { id: 'a', speaker: 'Ana', text: 'primeira', at: 0 },
        { id: 'b', speaker: 'Lucas', text: 'segunda', at: 5000 },
      ],
      huddle: { active: true },
      marks: [{ line: 1, kind: 'action' }],
    }),
  );
  assert.match(html, /primeira/);
  assert.match(html, /segunda/);
  assert.match(html, /caption--live/);
  assert.match(html, /Ação detectada/);
});

test('CaptionsView shows an empty state with no utterances', () => {
  const html = render(h(CaptionsView, { utterances: [], huddle: { active: true }, marks: [] }));
  assert.match(html, /Nenhuma fala ainda/);
});

test('AtaContent renders classification, summary and next steps', () => {
  const record = {
    huddleId: 'h1',
    meta: {
      startedAt: Date.parse('2026-10-29T14:00:00Z'),
      endedAt: Date.parse('2026-10-29T14:30:00Z'),
      source: 'Slack · #general',
      participants: ['Ana', 'Lucas'],
    },
    data: {
      title: 'Planejamento do Q4',
      summary: 'Alinhamento de Q4.',
      classification: { category: 'Planejamento', confidence: 80, description: 'roadmap' },
      tags: ['q4'],
      signals: ['sinal'],
      key_points: ['ponto'],
      next_steps: [{ text: 'Entregar billing', owner: 'Lucas', due: 'sex' }],
    },
  };
  const html = render(h(AtaContent, { record, done: new Set(), onCopy() {}, onToggleStep() {} }));
  assert.match(html, /Planejamento do Q4/);
  assert.match(html, /Entregar billing/);
  assert.match(html, /80%/);
  assert.match(html, /Copiar ata/);
});

test('AtaEmpty disables generation without a key', () => {
  const html = render(
    h(AtaEmpty, {
      active: false,
      error: null,
      autoMinutes: true,
      utterances: 1,
      participants: 1,
      hasKey: false,
      canGenerate: false,
      onToggleAuto() {},
      onGenerate() {},
      onOpenList() {},
    }),
  );
  assert.match(html, /Adicione sua chave da API/);
  assert.match(html, /disabled/);
});

test('Header has the sessions button and no insights copy/post actions', () => {
  const html = render(
    h(
      TooltipProvider,
      null,
      h(Header, {
        huddle: { active: true, startedAt: Date.now() - 1000 },
        version: '1.0.0',
        chatOpen: false,
        now: Date.now(),
        onOpenAtas() {},
        onToggleChat() {},
        onOpenLogs() {},
        onOpenSettings() {},
      }),
    ),
  );
  assert.match(html, /aria-label="Sessões anteriores"/);
  assert.doesNotMatch(html, /Copiar resumo/);
  assert.doesNotMatch(html, /Postar no thread/);
});

test('InfoBar shows copy/post and the ticker toggle on the insights tab', () => {
  const html = render(
    h(
      TooltipProvider,
      null,
      h(InfoBar, {
        tab: 'insights',
        settings: { apiKeys: { anthropic: 'sk-ant-x' }, freq: 30 },
        analysis: { running: false, error: null },
        huddle: { active: true },
        utteranceCount: 3,
        currentMinutes: null,
        minutesRunning: false,
        canCopySummary: true,
        canPostSummary: true,
        onCopySummary() {},
        onPostSummary() {},
        tickerHidden: false,
        hasRecent: true,
        onToggleTicker() {},
        onOpenSettings() {},
        onDownloadTranscript() {},
        onRegenerate() {},
        onOpenAtas() {},
      }),
    ),
  );
  assert.match(html, /aria-label="Copiar resumo"/);
  assert.match(html, /aria-label="Postar no thread"/);
  assert.match(html, /aria-label="Ocultar últimas falas"/);
});

test('AtasList renders Slack-like rows: title, icon, avatars and a kebab menu', () => {
  const record = {
    huddleId: 'h1',
    meta: {
      startedAt: Date.now() - 3600000,
      endedAt: Date.now(),
      source: 'Slack · #general',
      participants: ['Ana', 'Lucas', 'Bia', 'Caio'],
    },
    data: {
      title: 'Planejamento do Q4',
      classification: { category: 'Planejamento' },
      tags: ['q4'],
      next_steps: [],
    },
  };
  const html = render(
    h(AtasList, {
      records: [record],
      query: '',
      tag: null,
      now: Date.now(),
      currentHuddleId: null,
      onOpen() {},
      onLoad() {},
      onDelete() {},
    }),
  );
  assert.match(html, /ata-item__title/);
  assert.match(html, /Planejamento do Q4/);
  assert.match(html, /role="button"/); // the row itself opens
  assert.match(html, /aria-label="Ações"/); // kebab menu trigger
  assert.match(html, /\+1/); // 4 participants -> 3 avatars + "+1"
  assert.doesNotMatch(html, /próximo passo/); // old meta line removed
});

test('IdleView shows the connect action and the reload fallback', () => {
  const html = render(
    h(IdleView, {
      slackOpen: true,
      slackReloadTabId: 7,
      savedCount: 3,
      onConnectSlackTab() {},
      onReloadSlackTab() {},
      onGoToSlack() {},
      onOpenImport() {},
      onOpenAtas() {},
    }),
  );
  assert.match(html, /Nenhum huddle ativo/);
  assert.match(html, /Conectar a esta aba/);
  assert.match(html, /ou recarregar a aba/);
  assert.match(html, /Sessões anteriores \(3\)/);
});
