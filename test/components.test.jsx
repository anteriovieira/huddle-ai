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
const { AtaContent, AtaEmpty } = await import('../src/sidepanel/views/Ata.jsx');
const { IdleView } = await import('../src/sidepanel/views/Idle.jsx');
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
    open_questions: ['e o Z?'],
    suggestions: [],
    references: [{ kind: 'book', title: 'Clean Code', by: 'Martin', description: 'livro' }],
    acronyms: [{ term: 'API', meaning: 'interface' }],
    alerts: [{ kind: 'mention', text: 'Ana citou você', from: 'Ana', line: 1 }],
    focus: { on_agenda: true, since_line: 1 },
    marks: [{ line: 1, kind: 'action' }],
  },
};

const settings = {
  apiKey: 'sk-ant-x',
  detect: { alerts: true, actions: true, decisions: true, questions: true, suggestions: true, references: true, acronyms: true },
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
});

test('InsightsView prompts for an API key when missing', () => {
  const html = render(
    h(InsightsView, {
      current: null,
      settings: { apiKey: '', detect: settings.detect },
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

test('IdleView shows the checklist and the reload banner', () => {
  const html = render(
    h(IdleView, {
      slackOpen: true,
      slackReloadTabId: 7,
      savedCount: 3,
      onReloadSlackTab() {},
      onGoToSlack() {},
      onOpenImport() {},
      onOpenAtas() {},
    }),
  );
  assert.match(html, /Nenhum huddle ativo/);
  assert.match(html, /Recarregar aba do Slack/);
  assert.match(html, /Sessões anteriores \(3\)/);
});
