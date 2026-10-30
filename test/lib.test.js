import assert from 'node:assert/strict';
import test from 'node:test';

import { ago, fileStamp, formatClock, formatDuration, formatTranscript, initials } from '../src/sidepanel/lib/format.js';
import { looksLikeSpeaker, parseStamp, parseTranscript } from '../src/sidepanel/lib/transcript.js';
import {
  groupSessions,
  insightsAsText,
  matchesQuery,
  minutesAsText,
  minutesMeta,
  modelLabel,
  sessionDigests,
  sourceFromTitle,
  tagCounts,
} from '../src/sidepanel/lib/minutes.js';
import { logEntryAsText, logsAsText } from '../src/sidepanel/lib/logs.js';
import { normalizeInsights } from '../src/sidepanel/lib/insights-data.js';

test('formatClock renders mm:ss and h:mm:ss', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(42 * 1000), '00:42');
  assert.equal(formatClock(62 * 1000), '01:02');
  assert.equal(formatClock((3600 + 2 * 60 + 3) * 1000), '1:02:03');
  assert.equal(formatClock(-5000), '00:00');
});

test('formatTranscript numbers lines with clock, speaker and text', () => {
  const out = formatTranscript([
    { speaker: 'Ana', text: 'oi', at: 0 },
    { speaker: 'Lucas', text: 'tudo bem', at: 5000 },
  ]);
  assert.equal(out, '#1 [00:00] Ana: oi\n#2 [00:05] Lucas: tudo bem');
});

test('formatDuration rounds to minutes and hours', () => {
  assert.equal(formatDuration(30 * 1000), '1 min');
  assert.equal(formatDuration(5 * 60 * 1000), '5 min');
  assert.equal(formatDuration(90 * 60 * 1000), '1 h 30 min');
  assert.equal(formatDuration(120 * 60 * 1000), '2 h');
});

test('ago uses injectable now', () => {
  const now = 1_000_000_000;
  assert.equal(ago(now - 10 * 1000, now), 'há 10s');
  assert.equal(ago(now - 5 * 60 * 1000, now), 'há 5 min');
  assert.equal(ago(now - 2 * 3600 * 1000, now), 'há 2 h');
});

test('fileStamp is a filesystem-safe timestamp', () => {
  assert.match(fileStamp(Date.parse('2026-10-29T14:05:00Z')), /^2026-10-29-14-05$/);
});

test('initials takes up to two uppercase letters', () => {
  assert.equal(initials('ana paula souza'), 'AP');
  assert.equal(initials('Lucas'), 'L');
});

test('parseStamp handles mm:ss and hh:mm:ss', () => {
  assert.equal(parseStamp('01:00'), 60 * 1000);
  assert.equal(parseStamp('01:02:03'), (3600 + 2 * 60 + 3) * 1000);
  assert.equal(parseStamp('nope'), null);
});

test('looksLikeSpeaker rejects sentences', () => {
  assert.equal(looksLikeSpeaker('Ana'), true);
  assert.equal(looksLikeSpeaker('Ana Paula'), true);
  assert.equal(looksLikeSpeaker('I think we should ship it.'), false);
  assert.equal(looksLikeSpeaker(''), false);
});

test('parseTranscript splits Name: text lines and folds continuations', () => {
  const out = parseTranscript('Ana: acho que o Lucas toca billing\nextra line\nLucas: consigo até sexta');
  assert.equal(out.length, 2);
  assert.equal(out[0].speaker, 'Ana');
  assert.equal(out[0].text, 'acho que o Lucas toca billing extra line');
  assert.equal(out[1].speaker, 'Lucas');
  assert.equal(out[1].text, 'consigo até sexta');
});

test('parseTranscript reads timestamps relative to the first', () => {
  const out = parseTranscript('[00:10] Ana: oi\n[00:20] Lucas: olá');
  assert.equal(out[0].at, 0);
  assert.equal(out[1].at, 10 * 1000);
});

test('parseTranscript falls back to one utterance per line', () => {
  const out = parseTranscript('primeira linha\nsegunda linha');
  assert.equal(out.length, 2);
  assert.equal(out[0].speaker, 'Transcrição');
  assert.equal(out[1].text, 'segunda linha');
});

test('parseTranscript returns [] for empty input', () => {
  assert.deepEqual(parseTranscript(''), []);
  assert.deepEqual(parseTranscript(null), []);
});

test('parseTranscript reads name-line + text-line blocks (meeting export)', () => {
  const text = [
    'bignerve123.',
    'joined the huddle.',
    '',
    'Onezino Moreira',
    'joined the huddle.',
    '',
    'Onezino Moreira',
    'Highlight generated total. static neurons generated.',
    '',
    'bignerve123.',
    'OK. Good, good.',
    '',
    'Onezino Moreira',
    'Oh,',
    '',
    'bignerve123.',
    'The variable',
  ].join('\n');
  const out = parseTranscript(text);
  // Presence events ("joined the huddle.") are dropped; names are detected per block.
  assert.deepEqual(
    out.map((u) => [u.speaker, u.text]),
    [
      ['Onezino Moreira', 'Highlight generated total. static neurons generated.'],
      ['bignerve123', 'OK. Good, good.'],
      ['Onezino Moreira', 'Oh,'],
      ['bignerve123', 'The variable'],
    ],
  );
  assert.ok(!out.some((u) => u.speaker === 'Transcrição'));
});

test('parseTranscript folds multi-line text within a block', () => {
  const out = parseTranscript('Ana\nprimeira parte\nsegunda parte\n\nLucas\nbeleza');
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { id: 'imp-0', speaker: 'Ana', text: 'primeira parte segunda parte', at: 0 });
  assert.equal(out[1].speaker, 'Lucas');
});

test('sourceFromTitle maps channel and DM titles', () => {
  assert.equal(sourceFromTitle('Huddle in general'), 'Slack · #general');
  assert.equal(sourceFromTitle('Huddle em #vendas'), 'Slack · #vendas');
  assert.equal(sourceFromTitle('Huddle with Ana'), 'Slack · DM com Ana');
  assert.equal(sourceFromTitle('algo'), 'Slack');
  assert.equal(sourceFromTitle(null), 'Slack');
});

test('minutesMeta derives participants and source', () => {
  const meta = minutesMeta(
    { title: 'Huddle in general', startedAt: 1000, endedAt: 2000 },
    [
      { speaker: 'Ana', text: 'a', at: 0 },
      { speaker: 'Ana', text: 'b', at: 1 },
      { speaker: 'Lucas', text: 'c', at: 2 },
    ],
  );
  assert.deepEqual(meta.participants, ['Ana', 'Lucas']);
  assert.equal(meta.source, 'Slack · #general');
  assert.equal(meta.utterances, 3);
});

test('modelLabel strips the suffix, falls back to the id', () => {
  assert.equal(modelLabel('claude-opus-5-5'), 'Claude Opus 5.5');
  assert.equal(modelLabel('unknown-model'), 'unknown-model');
});

const sampleMinutes = {
  huddleId: 'h1',
  generatedAt: 2000,
  model: 'claude-opus-5-5',
  meta: {
    title: 'Huddle in general',
    startedAt: Date.parse('2026-10-29T14:00:00Z'),
    endedAt: Date.parse('2026-10-29T14:30:00Z'),
    source: 'Slack · #general',
    participants: ['Ana', 'Lucas'],
    utterances: 12,
  },
  data: {
    title: 'Planejamento do Q4',
    summary: 'Ana e Lucas alinharam o Q4.',
    classification: { category: 'Planejamento', confidence: 80, description: 'roadmap, metas' },
    tags: ['q4', 'billing'],
    signals: ['Falaram de metas'],
    key_points: ['Lucas toca billing'],
    next_steps: [{ text: 'Entregar billing', owner: 'Lucas', due: 'sex, 31/10' }],
  },
};

test('minutesAsText renders Markdown with checkboxes', () => {
  const md = minutesAsText(sampleMinutes);
  assert.match(md, /^# Planejamento do Q4/);
  assert.match(md, /## Pontos principais/);
  assert.match(md, /- \[ \] Entregar billing \(Lucas, sex, 31\/10\)/);
  assert.match(md, /\*\*Tags:\*\* q4, billing/);
});

test('minutesAsText renders Slack mrkdwn with bullets', () => {
  const slack = minutesAsText(sampleMinutes, 'slack');
  assert.match(slack, /^\*Ata: Planejamento do Q4\*/);
  assert.match(slack, /• Entregar billing \(Lucas, sex, 31\/10\)/);
  assert.doesNotMatch(slack, /- \[ \]/);
});

test('sessionDigests compacts saved minutes, newest first, excluding the live huddle', () => {
  const older = {
    ...sampleMinutes,
    huddleId: 'h-old',
    meta: { ...sampleMinutes.meta, startedAt: Date.parse('2026-10-20T10:00:00Z') },
  };
  const history = [
    { huddle: { id: 'h1' }, minutes: sampleMinutes },
    { huddle: { id: 'h-old' }, minutes: older },
    { huddle: { id: 'h-none' }, minutes: null },
  ];
  const digests = sessionDigests(history, 'h1');
  // Live huddle (h1) and the entry without minutes are excluded.
  assert.deepEqual(
    digests.map((d) => d.id),
    ['h-old'],
  );
  const d = digests[0];
  assert.equal(d.title, 'Planejamento do Q4');
  assert.deepEqual(d.participants, ['Ana', 'Lucas']);
  assert.deepEqual(d.key_points, ['Lucas toca billing']);
  // next_steps flatten owner/due into the line.
  assert.deepEqual(d.next_steps, ['Entregar billing (Lucas, sex, 31/10)']);
});

test('sessionDigests handles empty history and sorts newest first', () => {
  assert.deepEqual(sessionDigests(undefined), []);
  const a = { ...sampleMinutes, huddleId: 'a', meta: { ...sampleMinutes.meta, startedAt: 1000 } };
  const b = { ...sampleMinutes, huddleId: 'b', meta: { ...sampleMinutes.meta, startedAt: 2000 } };
  const ids = sessionDigests([{ minutes: a }, { minutes: b }]).map((d) => d.id);
  assert.deepEqual(ids, ['b', 'a']);
});

test('normalizeInsights fills every field from an empty/partial object', () => {
  const d = normalizeInsights(undefined);
  assert.deepEqual(d.topic, { title: '', summary: '' });
  for (const k of ['topics', 'points', 'actions', 'decisions', 'open_questions', 'suggestions', 'replies', 'alerts', 'references', 'acronyms', 'marks', 'context_queries']) {
    assert.deepEqual(d[k], [], `${k} should default to []`);
  }
  assert.deepEqual(d.agenda, { items: [], current: -1 });
  assert.deepEqual(d.focus, { on_agenda: true, since_line: 0 });
});

test('normalizeInsights drops half-built streaming entries', () => {
  const d = normalizeInsights({
    topic: { title: 'Billing' },
    points: ['ok', undefined, 42],
    actions: [{ text: 'fazer', owner: 'Ana' }, { owner: 'sem texto' }, null],
    alerts: [{ kind: 'mention', text: 'oi', from: 'Lu', line: 3 }, { kind: 'bogus', text: 'x' }],
    context_queries: [{ text: 'o número de Q3?', about: 'Q3' }, { about: 'sem texto' }],
    marks: [{ line: 2, kind: 'action' }, { line: 'x', kind: 'action' }],
  });
  assert.equal(d.topic.summary, '');
  assert.deepEqual(d.points, ['ok']);
  assert.deepEqual(d.actions, [{ text: 'fazer', owner: 'Ana' }]);
  assert.equal(d.alerts.length, 1);
  assert.equal(d.context_queries.length, 1);
  assert.equal(d.context_queries[0].line, 0);
  assert.deepEqual(d.marks, [{ line: 2, kind: 'action' }]);
});

test('matchesQuery matches across fields, all words required', () => {
  assert.equal(matchesQuery(sampleMinutes, ''), true);
  assert.equal(matchesQuery(sampleMinutes, 'billing q4'), true);
  assert.equal(matchesQuery(sampleMinutes, 'ana'), true);
  assert.equal(matchesQuery(sampleMinutes, 'billing jamais'), false);
});

test('tagCounts counts and sorts tags', () => {
  const counts = tagCounts([sampleMinutes, { ...sampleMinutes, data: { ...sampleMinutes.data, tags: ['q4'] } }]);
  assert.deepEqual(counts[0], ['q4', 2]);
  assert.ok(counts.some(([t, n]) => t === 'billing' && n === 1));
});

test('groupSessions buckets by day label and filters by tag', () => {
  const now = Date.parse('2026-10-29T20:00:00Z');
  const { visible, groups } = groupSessions([sampleMinutes], '', 'q4', now);
  assert.equal(visible.length, 1);
  assert.equal(groups[0][0], 'Hoje');
  const none = groupSessions([sampleMinutes], '', 'inexistente', now);
  assert.equal(none.visible.length, 0);
});

test('insightsAsText respects detect toggles', () => {
  const data = {
    topic: { title: 'Tópico', summary: 'resumo' },
    points: ['ponto 1'],
    actions: [{ text: 'fazer X', owner: 'Ana' }],
    decisions: ['decidimos Y'],
    open_questions: ['e o Z?'],
    references: [{ title: 'Livro', by: 'Autor', description: 'sobre algo' }],
    acronyms: [{ term: 'API', meaning: 'interface' }],
  };
  const full = insightsAsText(data, { actions: true, decisions: true, questions: true, references: true, acronyms: true });
  assert.match(full, /\*Tópico\*/);
  assert.match(full, /• fazer X \(Ana\)/);
  assert.match(full, /• decidimos Y/);
  const minimal = insightsAsText(data, { actions: false, decisions: false, questions: false, references: false, acronyms: false });
  assert.doesNotMatch(minimal, /Ações/);
  assert.doesNotMatch(minimal, /Decisões/);
  assert.match(minimal, /Pontos levantados/);
});

test('log text helpers format entries', () => {
  const entry = { at: Date.parse('2026-10-29T14:00:05Z'), level: 'info', source: 'painel', message: 'oi', data: { n: 1 } };
  const text = logEntryAsText(entry);
  assert.match(text, /\[info\] painel: oi \{"n":1\}/);
  assert.equal(logsAsText([entry, { ...entry, data: null }]).split('\n').length, 2);
});
