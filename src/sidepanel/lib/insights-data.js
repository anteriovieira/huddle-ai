// Pure helpers for the insights object shape. Kept free of the AI SDK (no DOM, no network) so it
// is unit-tested in Node and reused both when streaming partial insights and to guarantee a
// well-formed object before storing. normalizeInsights() fills every field with a safe default and
// drops half-built entries (strings mid-stream, items missing required keys), so the UI can render
// a partial object without crashing on undefined fields.

const strings = (x) => (Array.isArray(x) ? x.filter((s) => typeof s === 'string') : []);
const int = (x, fallback) => (Number.isInteger(x) ? x : fallback);

// Open questions carry an optional in-call answer and the transcript line they were asked on.
// A plain string (older stored insights, or a model that still emits strings) is lifted to the
// object shape so the UI can render one shape.
const questions = (x) =>
  Array.isArray(x)
    ? x
        .map((q) => {
          if (typeof q === 'string') return { text: q, line: 0, answer: '' };
          if (q && typeof q.text === 'string')
            return { text: q.text, line: int(q.line, 0), answer: typeof q.answer === 'string' ? q.answer : '' };
          return null;
        })
        .filter(Boolean)
    : [];

// Decisions carry the transcript line they were made on (a plain string lifts to the object shape).
const decisions = (x) =>
  Array.isArray(x)
    ? x
        .map((d) => {
          if (typeof d === 'string') return { text: d, line: 0 };
          if (d && typeof d.text === 'string') return { text: d.text, line: int(d.line, 0) };
          return null;
        })
        .filter(Boolean)
    : [];

// Suggested replies carry re_line: the transcript # of the question/moment they answer (0 = general).
const replies = (x) =>
  Array.isArray(x)
    ? x
        .map((r) => {
          if (typeof r === 'string') return { text: r, re_line: 0 };
          if (r && typeof r.text === 'string') return { text: r.text, re_line: int(r.re_line, 0) };
          return null;
        })
        .filter(Boolean)
    : [];

export function normalizeInsights(data) {
  const d = data ?? {};
  return {
    topic: { title: d.topic?.title ?? '', summary: d.topic?.summary ?? '' },
    topics: Array.isArray(d.topics)
      ? d.topics
          .filter((t) => t && typeof t.title === 'string')
          .map((t) => ({ title: t.title, note: t.note ?? '', line: int(t.line, 0) }))
      : [],
    points: Array.isArray(d.points)
      ? d.points
          .map((p) => {
            if (typeof p === 'string') return { text: p, line: 0 };
            if (p && typeof p.text === 'string') return { text: p.text, line: int(p.line, 0) };
            return null;
          })
          .filter(Boolean)
      : [],
    actions: Array.isArray(d.actions)
      ? d.actions.filter((a) => a && typeof a.text === 'string').map((a) => ({ text: a.text, owner: a.owner ?? '', line: int(a.line, 0) }))
      : [],
    decisions: decisions(d.decisions),
    open_questions: questions(d.open_questions),
    suggestions: strings(d.suggestions),
    replies: replies(d.replies),
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
      ? d.acronyms
          .filter((a) => a && typeof a.term === 'string')
          .map((a) => ({ term: a.term, meaning: a.meaning ?? '' }))
          // Sigla sem descrição não entra na lista — o prompt pede para o modelo preencher pelo próprio
          // conhecimento quando a reunião não define; isto só barra o que ficou mesmo sem significado.
          .filter((a) => a.meaning.trim())
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

// Identity used to tell "the same item, reworded" from "a new item". Transcript line numbers are
// stable (lines only ever get appended, earlier ones keep their #), so a lined item is identified by
// its line; everything else by its text, normalized so casing, spacing and trailing punctuation do
// not count as a change.
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.?!…,:;]+$/, '')
    .trim();
const byText = (x) => norm(x.text);
const byLineOrText = (x) => (x.line > 0 ? `#${x.line}` : norm(x.text));

// Append-only merge of a list: previous items are kept verbatim (so their text/owner/line never
// change), matched against the incoming list by keyOf; only incoming items that match nothing are
// appended. `enrich` optionally folds new info into a kept item WITHOUT changing its key.
function mergeList(prev, next, keyOf, enrich) {
  const out = [];
  const index = new Map(); // key -> position in `out`
  const push = (item, incoming) => {
    const k = keyOf(item);
    if (index.has(k)) {
      if (incoming && enrich) {
        const i = index.get(k);
        out[i] = enrich(out[i], item);
      }
      return;
    }
    index.set(k, out.length);
    out.push(item);
  };
  for (const item of prev) push(item, false);
  for (const item of next) push(item, true);
  return out;
}

// Keeps the lists stable within a huddle. Each analysis cycle regenerates the whole object, and a
// model that rephrases an item it already emitted would otherwise change its text — which silently
// drops the "seen"/"done"/"acked" marks (keyed on that text) and re-raises the point. So the item
// lists are treated as append-only: previous items win and keep their exact text, incoming items
// only add what is genuinely new. Singletons that are meant to move with the discussion (topic,
// agenda, focus) and the caption marks take the incoming value. The one enrichment allowed is an
// open question's answer: an answer that appears in a later cycle fills the frozen question.
// `prev` is null/undefined on the first cycle of a huddle; both args are normalized before merging.
export function mergeInsights(prev, next) {
  const incoming = normalizeInsights(next);
  if (!prev) return incoming;
  const base = normalizeInsights(prev);
  const answerEnrich = (kept, inc) => (!kept.answer && inc.answer ? { ...kept, answer: inc.answer } : kept);
  return {
    ...incoming,
    points: mergeList(base.points, incoming.points, byLineOrText),
    actions: mergeList(base.actions, incoming.actions, byLineOrText),
    decisions: mergeList(base.decisions, incoming.decisions, byLineOrText),
    open_questions: mergeList(base.open_questions, incoming.open_questions, byLineOrText, answerEnrich),
    suggestions: mergeList(base.suggestions, incoming.suggestions, norm),
    replies: mergeList(base.replies, incoming.replies, byText),
    alerts: mergeList(base.alerts, incoming.alerts, byText),
    references: mergeList(base.references, incoming.references, (r) => norm(r.title)),
    acronyms: mergeList(base.acronyms, incoming.acronyms, (a) => norm(a.term)),
    context_queries: mergeList(base.context_queries, incoming.context_queries, byLineOrText),
  };
}
