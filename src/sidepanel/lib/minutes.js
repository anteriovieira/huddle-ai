// Pure "Ata" (meeting minutes) helpers: metadata, text exports, list grouping, search.
// No DOM, no React — unit-tested in Node.

import { formatDateTime, formatDuration, formatTranscript } from './format.js';
import { MODELS } from './models.js';

export const CATEGORY_TONES = {
  Planejamento: 'blue',
  Daily: 'green',
  Alinhamento: 'yellow',
  Vendas: 'purple',
  Suporte: 'blue',
  Retrospectiva: 'yellow',
};

// "Huddle in general" -> "Slack · #general"; "Huddle with Ana" -> "Slack · DM com Ana".
export function sourceFromTitle(title) {
  const channel = title?.match(/^Huddle (?:in|em|en) (.+)$/i)?.[1];
  if (channel) return `Slack · #${channel.replace(/^#/, '')}`;
  const people = title?.match(/^Huddle (?:with|com|con) (.+)$/i)?.[1];
  if (people) return `Slack · DM com ${people}`;
  return 'Slack';
}

export function minutesMeta(huddle, utterances) {
  const endedAt = huddle.endedAt ?? Date.now();
  return {
    title: huddle.title ?? null,
    startedAt: huddle.startedAt,
    endedAt,
    source: sourceFromTitle(huddle.title),
    participants: [...new Set(utterances.map((u) => u.speaker))],
    utterances: utterances.length,
  };
}

export function modelLabel(id) {
  return MODELS.find((m) => m.id === id)?.label.split(' — ')[0] ?? id;
}

// Markdown for copy/download; Slack's mrkdwn (single *bold*, • bullets) for the thread.
export function minutesAsText(record, format = 'markdown') {
  const { meta, data } = record;
  const slack = format === 'slack';
  const bold = (text) => (slack ? `*${text}*` : `**${text}**`);
  const heading = (text) => (slack ? `*${text}*` : `## ${text}`);
  const bullet = (text) => (slack ? `• ${text}` : `- ${text}`);
  const step = (s) => {
    const who = [s.owner, s.due].filter(Boolean).join(', ');
    const line = who ? `${s.text} (${who})` : s.text;
    return slack ? `• ${line}` : `- [ ] ${line}`;
  };
  const lines = [
    slack ? `*Ata: ${data.title}*` : `# ${data.title}`,
    '',
    `${bold('Data e hora:')} ${formatDateTime(meta.startedAt)} · ${bold('Duração:')} ${formatDuration(meta.endedAt - meta.startedAt)} · ${bold('Término:')} ${formatDateTime(meta.endedAt)}`,
    `${bold('Fonte:')} ${meta.source} · ${bold('Participantes:')} ${meta.participants.join(', ')}`,
    `${bold('Classificação:')} ${data.classification.category} (confiança ${data.classification.confidence}%): ${data.classification.description}`,
    data.tags.length ? `${bold('Tags:')} ${data.tags.join(', ')}` : '',
    '',
    heading('Resumo da reunião'),
    data.summary,
    '',
    heading('Pontos principais'),
    ...data.key_points.map(bullet),
    '',
    data.next_steps.length ? heading('Próximos passos') : '',
    ...data.next_steps.map(step),
    '',
    heading('Sinais de classificação'),
    ...data.signals.map(bullet),
  ];
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function groupLabel(timestamp, now = Date.now()) {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (timestamp >= startOfToday) return 'Hoje';
  if (timestamp >= startOfToday - 6 * 24 * 3600 * 1000) return 'Esta semana';
  return 'Anteriores';
}

export function listTime(timestamp, now = Date.now()) {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (groupLabel(timestamp, now) === 'Hoje') return time;
  const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return `${weekday}, ${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
}

export function matchesQuery(record, query) {
  if (!query) return true;
  const haystack = [
    record.data.title,
    record.data.summary,
    record.data.classification.category,
    ...record.data.tags,
    ...record.meta.participants,
    record.meta.source,
  ]
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

// Every tag used across the sessions, most frequent first, with its count.
export function tagCounts(records) {
  const counts = new Map();
  for (const record of records) {
    for (const tag of record.data.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// Groups the sessions matching the query/tag by day label, in list order.
export function groupSessions(records, query, tag, now = Date.now()) {
  const visible = records.filter((record) => matchesQuery(record, query) && (!tag || record.data.tags.includes(tag)));
  const groups = new Map();
  for (const record of visible) {
    const label = groupLabel(record.meta.startedAt, now);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(record);
  }
  return { visible, groups: [...groups] };
}

// The compact archive the context-recall subagent reads: one digest per saved session that has
// minutes, newest first, excluding `exceptId` (the live huddle). Pure — no DOM, no AI — so it is
// unit-tested in Node and fed straight to insights.js recallContext().
export function sessionDigests(history, exceptId = null) {
  return (history ?? [])
    .map((entry) => entry.minutes)
    .filter((m) => m && m.huddleId !== exceptId)
    .sort((a, b) => b.meta.startedAt - a.meta.startedAt)
    .map((m) => ({
      id: m.huddleId,
      title: m.data.title,
      startedAt: m.meta.startedAt,
      when: formatDateTime(m.meta.startedAt),
      participants: m.meta.participants,
      category: m.data.classification.category,
      tags: m.data.tags,
      summary: m.data.summary,
      key_points: m.data.key_points,
      next_steps: m.data.next_steps.map((s) =>
        s.owner || s.due ? `${s.text} (${[s.owner, s.due].filter(Boolean).join(', ')})` : s.text,
      ),
    }));
}

// The insights summary posted to Slack / copied. `detect` toggles which sections appear.
export function insightsAsText(data, detect) {
  const list = (title, items) => (items.length ? [`*${title}*`, ...items.map((item) => `• ${item}`), ''] : []);
  return [
    `*${data.topic.title}*`,
    data.topic.summary,
    '',
    ...list('Pontos levantados', data.points),
    ...(detect.actions ? list('Ações', data.actions.map((a) => (a.owner ? `${a.text} (${a.owner})` : a.text))) : []),
    ...(detect.decisions ? list('Decisões', data.decisions) : []),
    ...(detect.questions ? list('Em aberto', data.open_questions) : []),
    ...(detect.references
      ? list('Referências', (data.references ?? []).map((r) => [r.title, r.by, r.description].filter(Boolean).join(' — ')))
      : []),
    ...(detect.acronyms ? list('Siglas', (data.acronyms ?? []).map((a) => (a.meaning ? `${a.term}: ${a.meaning}` : a.term))) : []),
  ]
    .join('\n')
    .trim();
}
