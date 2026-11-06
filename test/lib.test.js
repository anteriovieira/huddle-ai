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
  selectSessions,
  sessionDigests,
  sourceFromTitle,
  tagCounts,
} from '../src/sidepanel/lib/minutes.js';
import { logEntryAsText, logsAsText } from '../src/sidepanel/lib/logs.js';
import { mergeInsights, normalizeInsights } from '../src/sidepanel/lib/insights-data.js';

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

test('formatTranscript windows from an index keeping absolute line numbers', () => {
  const utt = [
    { speaker: 'Ana', text: 'oi', at: 0 },
    { speaker: 'Lucas', text: 'tudo bem', at: 5000 },
    { speaker: 'Bia', text: 'vamos', at: 9000 },
  ];
  assert.equal(formatTranscript(utt, 2), '#3 [00:09] Bia: vamos');
  assert.equal(formatTranscript(utt, 0), formatTranscript(utt));
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

const digest = (id, startedAt, over) => ({
  id,
  title: 'Huddle',
  startedAt,
  when: '',
  participants: [],
  category: 'Outro',
  tags: [],
  summary: '',
  key_points: [],
  next_steps: [],
  ...over,
});

test('selectSessions returns everything when the archive fits under the limit', () => {
  const list = [digest('a', 3), digest('b', 2), digest('c', 1)];
  assert.equal(selectSessions(list, 'anything', { limit: 6 }), list);
});

test('selectSessions ranks by keyword and caps at the limit', () => {
  const list = [
    digest('billing', 5, { title: 'Planejamento de billing', tags: ['billing', 'q4'] }),
    digest('vendas', 4, { title: 'Pipeline de vendas', summary: 'Metas do trimestre.' }),
    digest('infra', 3, { title: 'Migração de infra', key_points: ['billing citado de passagem'] }),
    digest('rh', 2, { title: 'Contratações', tags: ['rh'] }),
    digest('design', 1, { title: 'Review de design' }),
  ];
  const picked = selectSessions(list, 'o que decidimos sobre billing?', { limit: 2 });
  assert.deepEqual(picked.map((s) => s.id), ['billing', 'infra']); // strong (title+tag) before weak (points)
  assert.equal(picked.length, 2);
});

test('selectSessions falls back to most-recent when the query has no usable words', () => {
  const list = [digest('a', 3), digest('b', 2), digest('c', 1)];
  assert.deepEqual(selectSessions(list, 'liste as reuniões passadas', { limit: 2 }).map((s) => s.id), ['a', 'b']);
});

test('selectSessions falls back to most-recent when nothing matches', () => {
  const list = [digest('a', 3, { title: 'Alinhamento' }), digest('b', 2, { title: 'Daily' }), digest('c', 1, { title: 'Retro' })];
  assert.deepEqual(selectSessions(list, 'orçamento marciano', { limit: 2 }).map((s) => s.id), ['a', 'b']);
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
  assert.deepEqual(d.points, [{ text: 'ok', line: 0 }]);
  assert.deepEqual(d.actions, [{ text: 'fazer', owner: 'Ana', line: 0 }]);
  assert.equal(d.alerts.length, 1);
  assert.equal(d.context_queries.length, 1);
  assert.equal(d.context_queries[0].line, 0);
  assert.deepEqual(d.marks, [{ line: 2, kind: 'action' }]);
});

test('normalizeInsights parses question and reply objects, with string back-compat', () => {
  const d = normalizeInsights({
    open_questions: [
      { text: 'Como medimos o piloto?', line: 12, answer: 'Pelos times que ativam.' },
      { text: 'sem linha nem resposta' },
      'pergunta antiga em string',
      { answer: 'sem texto' },
    ],
    replies: [{ text: 'Posso na sexta.', re_line: 12 }, 'reply antiga', { re_line: 3 }],
  });
  assert.deepEqual(d.open_questions, [
    { text: 'Como medimos o piloto?', line: 12, answer: 'Pelos times que ativam.' },
    { text: 'sem linha nem resposta', line: 0, answer: '' },
    { text: 'pergunta antiga em string', line: 0, answer: '' },
  ]);
  assert.deepEqual(d.replies, [
    { text: 'Posso na sexta.', re_line: 12 },
    { text: 'reply antiga', re_line: 0 },
  ]);
});

test('normalizeInsights parses decisions and action lines, with string back-compat', () => {
  const d = normalizeInsights({
    decisions: [{ text: 'cobrança por uso', line: 20 }, 'decisão antiga', { line: 5 }],
    actions: [{ text: 'enviar escopo', owner: 'Ana', line: 7 }, { text: 'sem linha' }],
  });
  assert.deepEqual(d.decisions, [
    { text: 'cobrança por uso', line: 20 },
    { text: 'decisão antiga', line: 0 },
  ]);
  assert.deepEqual(d.actions, [
    { text: 'enviar escopo', owner: 'Ana', line: 7 },
    { text: 'sem linha', owner: '', line: 0 },
  ]);
});

test('normalizeInsights keeps acronyms only when they have a meaning', () => {
  const d = normalizeInsights({
    acronyms: [
      { term: 'SLA', meaning: 'Service Level Agreement' },
      { term: 'IRT', meaning: '' },
      { term: 'PCI', meaning: '   ' },
    ],
  });
  assert.deepEqual(d.acronyms, [{ term: 'SLA', meaning: 'Service Level Agreement' }]);
});

test('mergeInsights returns the incoming object when there is no previous', () => {
  const next = { points: ['a'], actions: [{ text: 'fazer', owner: 'Ana', line: 3 }] };
  assert.deepEqual(mergeInsights(null, next), normalizeInsights(next));
});

test('mergeInsights keeps a reworded item frozen so its seen/done key survives', () => {
  const prev = {
    points: [{ text: 'Precisamos migrar o billing', line: 5 }],
    actions: [{ text: 'Enviar o escopo', owner: 'Ana', line: 7 }],
    decisions: [{ text: 'Cobrança por uso', line: 10 }],
  };
  // Same items, reworded by the model but on the same transcript lines.
  const next = {
    points: [{ text: 'Vamos migrar o billing esse mês', line: 5 }],
    actions: [{ text: 'Mandar o escopo para o cliente', owner: 'Ana', line: 7 }],
    decisions: [{ text: 'Vamos cobrar por uso', line: 10 }],
  };
  const merged = mergeInsights(prev, next);
  assert.deepEqual(merged.points, [{ text: 'Precisamos migrar o billing', line: 5 }]); // frozen
  assert.equal(merged.actions.length, 1);
  assert.equal(merged.actions[0].text, 'Enviar o escopo'); // original text frozen
  assert.equal(merged.decisions.length, 1);
  assert.equal(merged.decisions[0].text, 'Cobrança por uso');
});

test('mergeInsights appends genuinely new items without touching the old ones', () => {
  const prev = { points: [{ text: 'ponto 1', line: 3 }], open_questions: [{ text: 'e o Z?', line: 4, answer: '' }] };
  const next = {
    points: [{ text: 'ponto 1 reescrito', line: 3 }, { text: 'ponto 2 novo', line: 8 }],
    open_questions: [{ text: 'e o Z?', line: 4, answer: '' }, { text: 'e o W?', line: 9, answer: '' }],
  };
  const merged = mergeInsights(prev, next);
  assert.deepEqual(merged.points, [{ text: 'ponto 1', line: 3 }, { text: 'ponto 2 novo', line: 8 }]);
  assert.deepEqual(merged.open_questions.map((q) => q.text), ['e o Z?', 'e o W?']);
});

test('mergeInsights collapses a reworded point that shares its transcript line', () => {
  // points now carry a line, so a reworded point on the SAME line is matched and kept frozen
  // (no duplicate). A point with no line (line 0) can still only be matched by its text.
  const prev = { points: [{ text: 'Precisamos migrar o billing', line: 5 }] };
  const reworded = mergeInsights(prev, { points: [{ text: 'Vamos ter que migrar o billing', line: 5 }] });
  assert.deepEqual(reworded.points, [{ text: 'Precisamos migrar o billing', line: 5 }]);
  const prev0 = { points: [{ text: 'ponto solto', line: 0 }] };
  const same = mergeInsights(prev0, { points: [{ text: 'ponto solto.', line: 0 }] });
  assert.deepEqual(same.points, [{ text: 'ponto solto', line: 0 }]); // casing/punctuation ignored
});

test('mergeInsights never drops an item the model stopped emitting', () => {
  const prev = { points: [{ text: 'a', line: 1 }, { text: 'b', line: 2 }] };
  const next = { points: [{ text: 'a', line: 1 }] }; // model dropped "b"
  assert.deepEqual(mergeInsights(prev, next).points.map((p) => p.text), ['a', 'b']);
});

test('mergeInsights fills an open question answer that arrives in a later cycle', () => {
  const prev = { open_questions: [{ text: 'Como medimos?', line: 5, answer: '' }] };
  const next = { open_questions: [{ text: 'Como medimos de novo?', line: 5, answer: 'Pelos ativos.' }] };
  const merged = mergeInsights(prev, next);
  assert.equal(merged.open_questions.length, 1);
  assert.equal(merged.open_questions[0].text, 'Como medimos?'); // text still frozen
  assert.equal(merged.open_questions[0].answer, 'Pelos ativos.'); // answer enriched
});

test('mergeInsights takes the incoming topic, agenda, focus and marks (they move with the call)', () => {
  const prev = {
    topic: { title: 'Velho', summary: 'resumo velho' },
    agenda: { items: ['a'], current: 0 },
    focus: { on_agenda: true, since_line: 0 },
    marks: [{ line: 2, kind: 'action' }],
  };
  const next = {
    topic: { title: 'Novo', summary: 'resumo novo' },
    agenda: { items: ['a', 'b'], current: 1 },
    focus: { on_agenda: false, since_line: 12 },
    marks: [{ line: 2, kind: 'action' }, { line: 8, kind: 'decision' }],
  };
  const merged = mergeInsights(prev, next);
  assert.deepEqual(merged.topic, { title: 'Novo', summary: 'resumo novo' });
  assert.deepEqual(merged.agenda, { items: ['a', 'b'], current: 1 });
  assert.deepEqual(merged.focus, { on_agenda: false, since_line: 12 });
  assert.deepEqual(merged.marks, [{ line: 2, kind: 'action' }, { line: 8, kind: 'decision' }]);
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
  assert.match(full, /• e o Z\?/);
  const withAnswer = insightsAsText(
    { ...data, open_questions: [{ text: 'e o Z?', line: 4, answer: 'Z fica pra sexta.' }] },
    { actions: true, decisions: true, questions: true, references: true, acronyms: true },
  );
  assert.match(withAnswer, /• e o Z\? → Z fica pra sexta\./);
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
