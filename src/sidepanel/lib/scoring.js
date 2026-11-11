// Pure helpers for meeting scoring. No DOM, no AI SDK, no network — unit-tested in Node and reused
// by insights.js (to normalize the model output before storing) and by the Análise view (to
// aggregate scored sessions). A score is 0..3 per criterion; a meeting's overall score is the mean
// of its criteria. The AI rates each criterion; everything here is deterministic shaping of that
// output.

// The effectiveness criteria every huddle is scored on. Generic enough to apply to any meeting
// (daily, planning, sales, support…), not only sales calls. `id` is the stable key the model and
// the stored data use; `label` is the fixed Portuguese name shown in the UI (like MINUTES_CATEGORIES,
// these are not run through i18n).
export const CRITERIA = [
  { id: 'direcao', label: 'Direção', hint: 'objetivo claro e condução da reunião' },
  { id: 'decisoes', label: 'Decisões', hint: 'decisões tomadas e registradas' },
  { id: 'execucao', label: 'Execução', hint: 'foco e progresso concreto nas tarefas' },
  { id: 'eficiencia', label: 'Eficiência', hint: 'uso do tempo, sem voltas desnecessárias' },
  { id: 'diagnostico', label: 'Diagnóstico', hint: 'profundidade do entendimento do problema' },
  { id: 'alinhamento', label: 'Alinhamento', hint: 'todos na mesma página sobre o que foi tratado' },
  { id: 'proximos_passos', label: 'Próximos passos', hint: 'encaminhamentos com dono e prazo' },
  { id: 'engajamento', label: 'Engajamento', hint: 'participação equilibrada do grupo' },
];

export const SCORE_MAX = 3;

const CRITERIA_BY_ID = new Map(CRITERIA.map((c) => [c.id, c]));

// Band thresholds on the 0..3 scale: < 1 low, < 2 mid, else high. Colors match the app's design
// (danger pink, attention amber, success green) and are used both in SVG (hex) and chips (bg tint).
export const BAND_COLOR = { low: '#f28ca8', mid: '#ecb22e', high: '#2bac76' };
export const BAND_BG = { low: 'rgba(242,140,168,0.14)', mid: '#3a2a12', high: '#12392b' };

export function bandOf(score) {
  if (score < 1) return 'low';
  if (score < 2) return 'mid';
  return 'high';
}

export function colorOf(score) {
  return BAND_COLOR[bandOf(score)];
}

export function bgOf(score) {
  return BAND_BG[bandOf(score)];
}

const clamp = (n) => Math.min(SCORE_MAX, Math.max(0, Number.isFinite(n) ? n : 0));

// Turns a raw [{id, score}] list into one entry per criterion, in order, missing ones = 0.
function criteriaFrom(list) {
  const byId = new Map(
    (Array.isArray(list) ? list : [])
      .filter((x) => x && typeof x.id === 'string')
      .map((x) => [x.id, clamp(x.score)]),
  );
  return CRITERIA.map((c) => ({ id: c.id, label: c.label, score: byId.get(c.id) ?? 0 }));
}

// Comma decimal for the UI (pt-BR): 2.3 -> "2,3".
export function fmtScore(score) {
  return clamp(score).toFixed(1).replace('.', ',');
}

export function labelOf(id) {
  return CRITERIA_BY_ID.get(id)?.label ?? id;
}

// Shapes a raw model result into a stable scores object: every criterion present (missing ones = 0),
// scores clamped to 0..3, lists coerced. Safe to call on a partial/garbled object.
export function normalizeScores(data) {
  const d = data ?? {};
  const overall = criteriaFrom(d.overall);
  const strengths = (Array.isArray(d.strengths) ? d.strengths : []).filter((id) => CRITERIA_BY_ID.has(id));
  const improvements = (Array.isArray(d.improvements) ? d.improvements : [])
    .filter((x) => x && typeof x.analysis === 'string' && typeof x.action === 'string')
    .map((x) => ({
      criterion: CRITERIA_BY_ID.has(x.criterion) ? x.criterion : '',
      analysis: x.analysis,
      action: x.action,
    }));
  const participants = (Array.isArray(d.participants) ? d.participants : [])
    .filter((p) => p && typeof p.name === 'string' && p.name.trim())
    .map((p) => ({
      name: p.name.trim(),
      score: clamp(p.score),
      criteria: criteriaFrom(p.criteria),
      focus: CRITERIA_BY_ID.has(p.focus) ? p.focus : '',
      tip: typeof p.tip === 'string' ? p.tip : '',
    }));
  return { overall, summary: typeof d.summary === 'string' ? d.summary : '', strengths, improvements, participants };
}

// Mean of a meeting's criteria scores (its overall score), 0..3.
export function meetingAverage(scores) {
  const list = normalizeScores(scores).overall;
  if (!list.length) return 0;
  return list.reduce((a, c) => a + c.score, 0) / list.length;
}

// One scored session for lists/aggregation. `record` is a stored scores record { huddleId, meta, data }.
export function sessionSummary(record) {
  return {
    huddleId: record.huddleId,
    title: record.meta?.title || 'Reunião',
    startedAt: record.meta?.startedAt ?? record.generatedAt ?? 0,
    participants: record.meta?.participants ?? [],
    average: meetingAverage(record.data),
  };
}

// Aggregates scored session records (newest-first order preserved for the session list) into the
// dashboard model: totals, the mean score per criterion (for the radar), per-participant averages,
// and the per-session list. Pure — fed real stored records.
export function aggregateScores(records) {
  const scored = (records ?? []).filter((r) => r && r.data);
  const sessions = scored.map(sessionSummary).sort((a, b) => b.startedAt - a.startedAt);

  // Mean per criterion across all scored sessions.
  const sums = new Map(CRITERIA.map((c) => [c.id, 0]));
  for (const r of scored) {
    for (const c of normalizeScores(r.data).overall) sums.set(c.id, sums.get(c.id) + c.score);
  }
  const n = scored.length || 1;
  const criteria = CRITERIA.map((c) => ({ id: c.id, label: c.label, score: sums.get(c.id) / n }));
  const overall = scored.length ? criteria.reduce((a, c) => a + c.score, 0) / criteria.length : 0;

  // Per-participant: mean of their per-session score across the sessions they appear in.
  const byPerson = new Map();
  for (const r of scored) {
    for (const p of normalizeScores(r.data).participants) {
      const key = p.name.toLowerCase();
      const acc = byPerson.get(key) ?? { name: p.name, total: 0, count: 0, focus: new Map(), tips: [] };
      acc.total += p.score;
      acc.count += 1;
      if (p.focus) acc.focus.set(p.focus, (acc.focus.get(p.focus) ?? 0) + 1);
      if (p.tip) acc.tips.push({ tip: p.tip, focus: p.focus, startedAt: r.meta?.startedAt ?? 0 });
      byPerson.set(key, acc);
    }
  }
  const participants = [...byPerson.values()]
    .map((acc) => {
      const focus = [...acc.focus.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      const latestTip = acc.tips.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
      return { name: acc.name, meetings: acc.count, average: acc.total / acc.count, focus, tip: latestTip?.tip ?? '' };
    })
    .sort((a, b) => b.average - a.average);

  // Trend: this period's average vs. the older half (older sessions), for the KPI delta.
  const half = Math.floor(sessions.length / 2);
  const recent = sessions.slice(0, sessions.length - half);
  const older = sessions.slice(sessions.length - half);
  const mean = (xs) => (xs.length ? xs.reduce((a, s) => a + s.average, 0) / xs.length : 0);
  const trend = older.length ? mean(recent) - mean(older) : 0;

  return { count: scored.length, overall, trend, criteria, participants, sessions };
}

// A scored meeting as plain text, for the "copy" action in the Análise info bar.
export function scoresAsText(record) {
  if (!record?.data) return '';
  const data = normalizeScores(record.data);
  const meta = record.meta ?? {};
  const avg = meetingAverage(record.data);
  const lines = [
    `# Análise — ${meta.title || 'Reunião'}`,
    '',
    `Score geral: ${fmtScore(avg)}/${SCORE_MAX} (${Math.round((avg / SCORE_MAX) * 100)}%)`,
    '',
    '## Scores por critério',
    ...data.overall.map((c) => `- ${c.label}: ${fmtScore(c.score)}/${SCORE_MAX}`),
  ];
  if (data.improvements.length) {
    lines.push('', '## O que melhorar');
    for (const r of data.improvements) lines.push(`- ${labelOf(r.criterion)}: ${r.analysis} Ação: ${r.action}`);
  }
  if (data.participants.length) {
    lines.push('', '## Por participante');
    for (const p of data.participants) {
      lines.push(`- ${p.name}: ${fmtScore(p.score)}/${SCORE_MAX}${p.focus ? ` — melhorar ${labelOf(p.focus)}: ${p.tip}` : ''}`);
    }
  }
  return lines.join('\n').trim();
}

// A short context line to pre-fill the chat input when the user asks about a meeting's analysis
// (the "chat+" action in the Análise info bar). Ends open so the user types their question after it.
export function analysisContext(record) {
  if (!record?.data) return 'Sobre a análise desta reunião: ';
  const data = normalizeScores(record.data);
  const avg = meetingAverage(record.data);
  const low = data.overall
    .slice()
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map((c) => c.label);
  const title = record.meta?.title || 'esta reunião';
  return `Sobre a análise de "${title}": score geral ${fmtScore(avg)}/${SCORE_MAX} (${Math.round((avg / SCORE_MAX) * 100)}%); pontos mais fracos: ${low.join(', ')}. Minha pergunta: `;
}

// Per-participant detail across sessions: their score in each session they appear in (newest-first),
// their overall average and the most recent focus/tip. `records` is the stored scores records.
export function participantDetail(records, name) {
  const key = (name ?? '').toLowerCase();
  const scored = (records ?? []).filter((r) => r && r.data);
  const rows = [];
  let total = 0;
  const focus = new Map();
  const cSum = new Map(CRITERIA.map((c) => [c.id, 0]));
  let cCount = 0;
  let latestTip = null;
  let latestAt = -1;
  for (const r of scored) {
    const p = normalizeScores(r.data).participants.find((x) => x.name.toLowerCase() === key);
    if (!p) continue;
    const startedAt = r.meta?.startedAt ?? r.generatedAt ?? 0;
    rows.push({ huddleId: r.huddleId, title: r.meta?.title || 'Reunião', startedAt, score: p.score });
    total += p.score;
    for (const c of p.criteria) cSum.set(c.id, cSum.get(c.id) + c.score);
    cCount += 1;
    if (p.focus) focus.set(p.focus, (focus.get(p.focus) ?? 0) + 1);
    if (startedAt >= latestAt && p.tip) {
      latestAt = startedAt;
      latestTip = { focus: p.focus, tip: p.tip };
    }
  }
  rows.sort((a, b) => b.startedAt - a.startedAt);
  const criteria = CRITERIA.map((c) => ({ id: c.id, label: c.label, score: cCount ? cSum.get(c.id) / cCount : 0 }));
  const ranked = criteria.slice().sort((a, b) => b.score - a.score);
  return {
    name,
    meetings: rows.length,
    average: rows.length ? total / rows.length : 0,
    criteria,
    strength: ranked[0] ?? null,
    weakness: ranked[ranked.length - 1] ?? null,
    focus: [...focus.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
    tip: latestTip?.tip ?? '',
    sessions: rows,
  };
}
