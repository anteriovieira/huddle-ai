// Pure helpers for the insights object shape. Kept free of the AI SDK (no DOM, no network) so it
// is unit-tested in Node and reused both when streaming partial insights and to guarantee a
// well-formed object before storing. normalizeInsights() fills every field with a safe default and
// drops half-built entries (strings mid-stream, items missing required keys), so the UI can render
// a partial object without crashing on undefined fields.

const strings = (x) => (Array.isArray(x) ? x.filter((s) => typeof s === 'string') : []);
const int = (x, fallback) => (Number.isInteger(x) ? x : fallback);

export function normalizeInsights(data) {
  const d = data ?? {};
  return {
    topic: { title: d.topic?.title ?? '', summary: d.topic?.summary ?? '' },
    topics: Array.isArray(d.topics)
      ? d.topics
          .filter((t) => t && typeof t.title === 'string')
          .map((t) => ({ title: t.title, note: t.note ?? '', line: int(t.line, 0) }))
      : [],
    points: strings(d.points),
    actions: Array.isArray(d.actions)
      ? d.actions.filter((a) => a && typeof a.text === 'string').map((a) => ({ text: a.text, owner: a.owner ?? '' }))
      : [],
    decisions: strings(d.decisions),
    open_questions: strings(d.open_questions),
    suggestions: strings(d.suggestions),
    replies: strings(d.replies),
    alerts: Array.isArray(d.alerts)
      ? d.alerts
          .filter((a) => a && typeof a.text === 'string' && ['mention', 'action', 'question'].includes(a.kind))
          .map((a) => ({ kind: a.kind, text: a.text, from: a.from ?? '', line: int(a.line, 0) }))
      : [],
    references: Array.isArray(d.references)
      ? d.references
          .filter((r) => r && typeof r.title === 'string')
          .map((r) => ({ kind: r.kind ?? 'other', title: r.title, by: r.by ?? '', description: r.description ?? '' }))
      : [],
    acronyms: Array.isArray(d.acronyms)
      ? d.acronyms.filter((a) => a && typeof a.term === 'string').map((a) => ({ term: a.term, meaning: a.meaning ?? '' }))
      : [],
    agenda: { items: strings(d.agenda?.items), current: int(d.agenda?.current, -1) },
    focus: { on_agenda: d.focus?.on_agenda ?? true, since_line: int(d.focus?.since_line, 0) },
    marks: Array.isArray(d.marks)
      ? d.marks.filter((m) => m && Number.isInteger(m.line) && ['action', 'decision', 'question'].includes(m.kind))
      : [],
    context_queries: Array.isArray(d.context_queries)
      ? d.context_queries
          .filter((q) => q && typeof q.text === 'string')
          .map((q) => ({ text: q.text, about: q.about ?? '', line: int(q.line, 0) }))
      : [],
  };
}
