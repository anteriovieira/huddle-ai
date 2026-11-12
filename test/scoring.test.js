import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CRITERIA,
  SCORE_MAX,
  aggregateScores,
  analysisContext,
  meetingAverage,
  normalizeScores,
  participantDetail,
  scoresAsText,
} from '../src/sidepanel/lib/scoring.js';

// A stored scores record { huddleId, meta, data }. `data` is a raw model result.
const rec = (huddleId, title, startedAt, data) => ({
  huddleId,
  generatedAt: startedAt,
  model: 'm',
  meta: { title, startedAt, participants: ['Ana', 'Bruno'] },
  data,
});

const allAt = (score) => CRITERIA.map((c) => ({ id: c.id, score }));

test('normalizeScores fills every criterion, clamps to 0..3 and coerces lists', () => {
  const n = normalizeScores({
    overall: [{ id: 'direcao', score: 5 }, { id: 'nope', score: 2 }],
    summary: 'ok',
    strengths: ['direcao', 'bogus'],
    improvements: [{ criterion: 'direcao', analysis: 'a', action: 'b' }, { criterion: 'x' }],
    participants: [{ name: ' Ana ', score: -1, criteria: [{ id: 'decisoes', score: 2 }], focus: 'decisoes', tip: 't' }],
  });
  assert.equal(n.overall.length, CRITERIA.length);
  assert.equal(n.overall.find((c) => c.id === 'direcao').score, SCORE_MAX); // clamped from 5
  assert.equal(n.strengths.length, 1); // 'bogus' dropped
  assert.equal(n.improvements.length, 1); // malformed dropped
  assert.equal(n.participants[0].name, 'Ana'); // trimmed
  assert.equal(n.participants[0].score, 0); // clamped from -1
  assert.equal(n.participants[0].criteria.length, CRITERIA.length);
});

test('meetingAverage is the mean of the criteria scores', () => {
  assert.equal(meetingAverage({ overall: allAt(2) }), 2);
  assert.equal(meetingAverage({ overall: [] }), 0); // no scores -> every criterion filled with 0
});

test('aggregateScores totals, per-criterion mean and participants', () => {
  const records = [
    rec('h1', 'Reunião A', 200, { overall: allAt(2), participants: [{ name: 'Ana', score: 2.4, criteria: allAt(2.4), focus: 'direcao', tip: 'x' }] }),
    rec('h2', 'Reunião B', 100, { overall: allAt(1), participants: [{ name: 'Ana', score: 1.6, criteria: allAt(1.6), focus: 'direcao', tip: 'y' }] }),
  ];
  const agg = aggregateScores(records);
  assert.equal(agg.count, 2);
  assert.equal(agg.sessions[0].huddleId, 'h1'); // newest first
  assert.equal(agg.criteria[0].score, 1.5); // mean of 2 and 1
  assert.equal(agg.overall, 1.5);
  const ana = agg.participants.find((p) => p.name === 'Ana');
  assert.equal(ana.meetings, 2);
  assert.equal(ana.average, 2); // mean of 2.4 and 1.6
});

test('participantDetail returns per-criterion mean, strength and weakness', () => {
  const records = [
    rec('h1', 'A', 1, {
      overall: allAt(2),
      participants: [
        {
          name: 'Ana',
          score: 2,
          criteria: CRITERIA.map((c) => ({ id: c.id, score: c.id === 'direcao' ? 0.5 : c.id === 'decisoes' ? 3 : 2 })),
          focus: 'direcao',
          tip: 'melhore',
        },
      ],
    }),
  ];
  const d = participantDetail(records, 'Ana');
  assert.equal(d.meetings, 1);
  assert.equal(d.strength.id, 'decisoes');
  assert.equal(d.weakness.id, 'direcao');
  assert.equal(d.tip, 'melhore');
});

test('analysisContext names the meeting, its score and the weakest criteria', () => {
  const r = rec('h1', 'Discovery Acme', 1, {
    overall: [{ id: 'direcao', score: 0.5 }, { id: 'decisoes', score: 0.8 }, ...CRITERIA.slice(2).map((c) => ({ id: c.id, score: 3 }))],
    participants: [],
  });
  const ctx = analysisContext(r);
  assert.match(ctx, /Discovery Acme/);
  assert.match(ctx, /\/3/);
  assert.match(ctx, /Direction/); // weakest criterion label present
  assert.doesNotMatch(ctx, /Minha pergunta/); // it is a prefix now, not a prompt
});

test('scoresAsText renders a plain-text report', () => {
  const r = rec('h1', 'Reunião A', 1, { overall: allAt(2), summary: 's', improvements: [], participants: [{ name: 'Ana', score: 2, criteria: allAt(2), focus: 'direcao', tip: 't' }] });
  const txt = scoresAsText(r);
  assert.match(txt, /Reunião A/);
  assert.match(txt, /Scores by criterion/);
  assert.match(txt, /Ana/);
});
