import { useRef, useState } from 'react';
import { formatClock } from '../lib/format.js';
import { ago } from '../lib/format.js';
import { hasKeyForModel } from '../lib/models.js';
import { useT } from '../lib/i18n.js';
import { Icon } from '../ui/Icon.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';
import { Avatar, Section } from '../ui/primitives.jsx';

// Anima o card (o .q-card mais próximo do botão) deslizando para fora e, após a animação,
// aplica a mudança de estado que o remove da lista — para marcar visto e para remover. Sem o card no
// DOM (ex.: testes de render estático) aplica na hora.
function dismissThen(event, fn) {
  const card = event.currentTarget.closest('.q-card');
  if (!card) return fn();
  card.classList.add('is-leaving');
  setTimeout(fn, 200);
}

// Toggle de empilhar (deck) no cabeçalho de uma seção. Some quando há menos de 2 cards para empilhar.
function DeckToggle({ on, onToggle, count }) {
  const t = useT();
  if (!onToggle || count < 2) return null;
  return (
    <Tooltip label={on ? t('insights.deckView') : t('insights.deckStack')}>
      <button
        type="button"
        className={on ? 'q-copy section__deck section__deck--on' : 'q-copy section__deck'}
        aria-label={on ? t('insights.deckViewAria') : t('insights.deckStack')}
        aria-pressed={String(Boolean(on))}
        onClick={onToggle}
      >
        <Icon name="layers" />
      </button>
    </Tooltip>
  );
}

// Remove um card de vez. Anima a saída antes de avisar o pai.
function RemoveButton({ topic, onRemove }) {
  const t = useT();
  if (!onRemove) return null;
  return (
    <Tooltip label={t('insights.remove')}>
      <button type="button" className="q-copy q-remove" aria-label={t('insights.remove')} onClick={(e) => dismissThen(e, () => onRemove(topic))}>
        <Icon name="trash" />
      </button>
    </Tooltip>
  );
}

// Tom da pílula de prazo a partir do texto (o prazo vem como foi dito).
function dueTone(due) {
  const s = due.toLowerCase();
  if (/hoje|today|agora|urgente|j[áa]\b/.test(s)) return 'today';
  if (/pr[óo]x|semana|m[êe]s|depois|week|month|que vem/.test(s)) return 'later';
  return 'soon';
}

const DRIFT_THRESHOLD_MS = 90 * 1000;

// Tempo relativo ("há 4 min") de um card a partir da fala que o originou (seu `line`). O timestamp
// absoluto da fala é huddle.startedAt + u.at. Retorna null quando o card não tem linha (ex.: sugestões).
function cardAgo(line, utterances, huddle, now) {
  if (!line) return null;
  const u = utterances[line - 1];
  if (!u) return null;
  return ago((huddle?.startedAt ?? 0) + u.at, now);
}

// Ordena cards do mais antigo para o mais recente pela linha da transcrição (linhas só crescem, então
// linha menor = mais antigo). Cards sem linha ficam no início, mantendo a ordem relativa entre si.
function oldestFirst(items) {
  return [...items].sort((a, b) => (a.line || 0) - (b.line || 0));
}

// Tone/icon per alert kind; the title and tag text come from i18n keys alert.<kind>.title/.tag.
const ALERT_META = {
  mention: { tone: 'purple', icon: 'at' },
  action: { tone: 'green', icon: 'check' },
  question: { tone: 'yellow', icon: 'question' },
};

const REF_META = {
  book: { tone: 'purple', icon: 'book' },
  app: { tone: 'blue', icon: 'app' },
  tool: { tone: 'green', icon: 'tool' },
  link: { tone: 'blue', icon: 'link' },
  article: { tone: 'yellow', icon: 'doc' },
  other: { tone: 'yellow', icon: 'bulb' },
};

function ReferenceRow({ ref, onAsk, onSeen, seen, onRemove, dismiss }) {
  const meta = REF_META[ref.kind] ?? REF_META.other;
  const isUrl = /^https?:\/\//i.test(ref.title);
  return (
    <div className="q-card q-card--row">
      <span className={`q-row__icon q-row__icon--${meta.tone}`}>
        <Icon name={meta.icon} />
      </span>
      <span className="q-row__stack">
        <span className="q-row__title">
          {isUrl ? (
            <a className="link" href={ref.title} target="_blank" rel="noopener noreferrer">
              {ref.title}
            </a>
          ) : (
            ref.title
          )}
          {ref.by && <span className="muted small">{` · ${ref.by}`}</span>}
        </span>
        {ref.description && <span className="muted small">{ref.description}</span>}
      </span>
      <span className="q-actions">
        <AskButton topic={[ref.title, ref.description].filter(Boolean).join(' — ')} onAsk={onAsk} />
        <RemoveButton topic={ref.title} onRemove={onRemove} />
        <SeenButton topic={ref.title} onSeen={onSeen} seen={seen} dismiss={dismiss} />
      </span>
    </div>
  );
}

function AcronymRow({ item, onAsk, onSeen, seen, onRemove, dismiss }) {
  return (
    <div className="q-card q-card--row">
      <span className="q-row__icon q-row__icon--blue">
        <Icon name="hash" />
      </span>
      <span className="q-row__stack">
        <span className="q-row__title strong">{item.term}</span>
        {item.meaning && <span className="muted small">{item.meaning}</span>}
      </span>
      <span className="q-actions">
        <AskButton topic={[item.term, item.meaning].filter(Boolean).join(' — ')} onAsk={onAsk} />
        <RemoveButton topic={item.term} onRemove={onRemove} />
        <SeenButton topic={item.term} onSeen={onSeen} seen={seen} dismiss={dismiss} />
      </span>
    </div>
  );
}

// How long the group has been off the agenda, in whole minutes, or null when on track.
function driftMinutes(focus, utterances, huddle, now) {
  if (!focus || focus.on_agenda) return null;
  const since = utterances[focus.since_line - 1];
  if (!since) return null;
  const elapsed = huddle.active ? now - huddle.startedAt : utterances.at(-1).at;
  const ms = elapsed - since.at;
  return ms >= DRIFT_THRESHOLD_MS ? Math.round(ms / 60000) : null;
}

// A personal alert in the regular card style: a labelled bar (kind, when · who) with icon actions —
// ask AI, edit (actions only) and acknowledge — and the alert text below. Acknowledging slides it out.
function AlertCard({ alert, time, onAccept, onEdit, onAsk }) {
  const t = useT();
  const meta = ALERT_META[alert.kind] ?? ALERT_META.mention;
  const accept = alert.kind === 'action' ? t('alert.accept') : t('alert.ok');
  return (
    <div className={`q-card q-card--alert q-card--alert-${meta.tone}`}>
      <div className="q-bar">
        <span className={`q-state q-state--alert-${meta.tone}`}>
          <Icon name={meta.icon} /> {t(`alert.${alert.kind}.title`)}
        </span>
        <span className="q-actions">
          {time && <span className="q-time muted small">{time}</span>}
          <AskButton topic={alert.text} onAsk={onAsk} />
          {alert.kind === 'action' && (
            <Tooltip label={t('alert.edit')}>
              <button type="button" className="q-copy" aria-label={t('alert.edit')} onClick={() => onEdit(alert)}>
                <Icon name="pencil" />
              </button>
            </Tooltip>
          )}
          <Tooltip label={accept}>
            <button type="button" className="q-copy q-seen" aria-label={accept} onClick={(e) => dismissThen(e, () => onAccept(alert))}>
              <Icon name="check" />
            </button>
          </Tooltip>
        </span>
      </div>
      <p className="q-card__text">{alert.text}</p>
    </div>
  );
}

// Header action: acknowledge every pending alert at once.
function AckAllButton({ alerts, onAcceptAll }) {
  const t = useT();
  if (!onAcceptAll || !alerts.length) return null;
  return (
    <Tooltip label={t('markAll.tip')}>
      <button type="button" className="section__mark" aria-label={t('markAll.tip')} onClick={() => onAcceptAll(alerts)}>
        <Icon name="check-double" />
        {t('markAll.label')}
      </button>
    </Tooltip>
  );
}

function AlertsSection({ alerts, acked, utterances, huddle, now, onAccept, onAcceptAll, onEdit, onAsk, deckOn, onToggleDeck }) {
  const t = useT();
  const pending = alerts.filter((alert) => !acked.has(alert.text));
  const timeFor = (alert) => {
    const at = utterances[alert.line - 1];
    const when = huddle.active ? cardAgo(alert.line, utterances, huddle, now) : at ? formatClock(at.at) : null;
    return [when, alert.from].filter(Boolean).join(' · ') || null;
  };
  return (
    <Section
      title={t('alerts.title')}
      count={pending.length}
      deck={deckOn}
      action={
        <span className="section__tools">
          <DeckToggle on={deckOn} onToggle={onToggleDeck} count={pending.length} />
          <AckAllButton alerts={pending} onAcceptAll={onAcceptAll} />
        </span>
      }
    >
      {pending.map((alert) => (
        <AlertCard key={`${alert.kind}:${alert.text}`} alert={alert} time={timeFor(alert)} onAccept={onAccept} onEdit={onEdit} onAsk={onAsk} />
      ))}
    </Section>
  );
}

// Icon-only clipboard button that confirms with a check for a beat (same pattern as the captions
// copy). Self-contained so each reply/suggestion card carries its own, with no handler threaded in.
// `label` is both the accessible name and the hover tooltip; it defaults to the generic "Copy".
function CopyButton({ text, label }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Área de transferência indisponível (foco/permissão): ignora silenciosamente.
    }
  };
  const name = copied ? t('copy.done') : label ?? t('copy.default');
  return (
    <Tooltip label={name}>
      <button type="button" className="q-copy" aria-label={name} onClick={copy}>
        <Icon name={copied ? 'check' : 'copy'} />
      </button>
    </Tooltip>
  );
}

// Asks the chat to expand on this item. The AI icon (sparkles) matches the "Analyze now" action.
function AskButton({ topic, onAsk }) {
  const t = useT();
  if (!onAsk) return null;
  return (
    <Tooltip label={t('ask.detail')}>
      <button type="button" className="q-copy q-ask" aria-label={t('ask.detail')} onClick={() => onAsk(topic)}>
        <Icon name="chat-plus" />
      </button>
    </Tooltip>
  );
}

// Marks this card as seen, which hides it from the list until the user shows all again. Estilo
// WhatsApp: um único check significa não visto; dois checks (azul) significa visto. Clicar de novo
// desmarca. Quando a marcação vai esconder o card (dismiss), anima a saída antes de avisar o pai.
function SeenButton({ topic, onSeen, seen, dismiss = true }) {
  const t = useT();
  if (!onSeen) return null;
  const on = Boolean(seen?.has(topic));
  const label = on ? t('seen.unmark') : t('seen.mark');
  const click = (e) => {
    if (dismiss && !on) return dismissThen(e, () => onSeen(topic));
    onSeen(topic);
  };
  return (
    <Tooltip label={label}>
      <button
        type="button"
        className={on ? 'q-copy q-seen q-seen--on' : 'q-copy q-seen'}
        aria-label={on ? t('seen.unmarkAria') : t('seen.markAria')}
        aria-pressed={String(on)}
        onClick={click}
      >
        <Icon name={on ? 'check-double' : 'check'} />
      </button>
    </Tooltip>
  );
}

// Header action that marks every card of a section as seen in one click. `keys` is the full set of
// that section's card keys (visible or not), so it also hides cards the user has not scrolled to.
// Hidden when the section has no keys or they are all already seen.
function MarkAllButton({ keys, onMarkAll, seen }) {
  const t = useT();
  if (!onMarkAll) return null;
  const pending = keys.filter((k) => !seen?.has(k));
  if (!pending.length) return null;
  return (
    <Tooltip label={t('markAll.tip')}>
      <button type="button" className="section__mark" aria-label={t('markAll.tip')} onClick={() => onMarkAll(keys)}>
        <Icon name="check-double" />
        {t('markAll.label')}
      </button>
    </Tooltip>
  );
}

// A top-level question card made only of a labelled bar with its actions and one line of text —
// shared by the orphan-reply and the proposal cards, which differ only in accent, icon and labels.
function CopyCard({ variant, icon, label, text, time, copyLabel, onAsk, onSeen, seen, onRemove, dismiss }) {
  return (
    <div className={`q-card q-card--${variant}`}>
      <div className="q-bar">
        <span className={`q-state q-state--${variant}`}>
          <Icon name={icon} /> {label}
        </span>
        <span className="q-actions">
          {time && <span className="q-time muted small">{time}</span>}
          <AskButton topic={text} onAsk={onAsk} />
          <CopyButton text={text} label={copyLabel} />
          <RemoveButton topic={text} onRemove={onRemove} />
          <SeenButton topic={text} onSeen={onSeen} seen={seen} dismiss={dismiss} />
        </span>
      </div>
      <p className="q-card__text">{text}</p>
    </div>
  );
}

// The past-meeting answer tied to a question. Mirrors the old ContextSuggestions statuses so a
// failed or empty recall is still visible (and, as an orphan card, still dismissable) rather than
// vanishing: loading and error/empty show a quiet line; a hit shows the answer and its sources.
function MemoryFacet({ card, onOpenSource }) {
  const t = useT();
  if (!card) return null;
  if (card.status === 'loading') return <p className="q-memory-status muted small">{t('memory.searching')}</p>;
  if (card.status === 'error') return <p className="q-memory-status muted small">{t('memory.failed', { error: card.error })}</p>;
  if (card.status !== 'done' || !card.result?.found)
    return <p className="q-memory-status muted small">{t('memory.none')}</p>;
  return (
    <div className="q-facet q-facet--memory">
      <span className="q-facet__label q-facet__label--memory">
        <Icon name="history" /> {t('memory.fromPast')}
      </span>
      <p className="q-facet__text">{card.result.answer}</p>
      {card.result.sources.length > 0 && (
        <div className="q-sources">
          {card.result.sources.map((src, i) => (
            <button
              key={`${src.id}:${i}`}
              type="button"
              className="chip chip--indigo"
              title={src.quote}
              onClick={() => onOpenSource(src.id)}
            >
              <Icon name="history" />
              {src.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// One question, carrying whatever the meeting knows about it: an answer said in the call, a
// ready-to-paste reply, and/or a past-meeting match. The dominant facet sets the state accent.
// `memory` is only ever a loading or a resolved hit (empty/error recalls surface as orphan cards).
function QuestionCard({ question, reply, memory, time, utterances, onOpenSource, onAsk, onSeen, seen, onRemove, dismiss }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const showAnswer = Boolean(question.answer);
  const memoryDone = memory && memory.status === 'done' && memory.result?.found;
  const state = reply ? 'reply' : showAnswer ? 'answered' : memoryDone ? 'memory' : 'open';
  // Only a card that actually has a body (answer, reply or memory) can be collapsed; a bare open
  // question has nothing to hide, so it stays a plain card. The AI and expand controls are separate
  // buttons, so neither nests inside the other.
  const hasBody = showAnswer || Boolean(reply) || Boolean(memory);
  const toggle = () => setExpanded((v) => !v);
  return (
    <div className={`q-card q-card--${state}`}>
      <div className="q-card__head">
        <span className={`q-state q-state--${state}`}>{t(`qstate.${state}`)}</span>
        <span className="q-card__meta">
          {time && <span className="muted small">{time}</span>}
          <AskButton topic={question.text} onAsk={onAsk} />
          <RemoveButton topic={question.text} onRemove={onRemove} />
          {hasBody && (
            <Tooltip label={expanded ? t('common.collapse') : t('common.expand')}>
              <button
                type="button"
                className="q-copy q-chevbtn"
                aria-expanded={String(expanded)}
                aria-label={expanded ? t('common.collapse') : t('common.expand')}
                onClick={toggle}
              >
                <Icon name={expanded ? 'chevron-up' : 'chevron-down'} />
              </button>
            </Tooltip>
          )}
          <SeenButton topic={question.text} onSeen={onSeen} seen={seen} dismiss={dismiss} />
        </span>
      </div>
      {hasBody ? (
        <button type="button" className="q-card__textbtn" aria-expanded={String(expanded)} onClick={toggle}>
          {question.text}
        </button>
      ) : (
        <p className="q-card__text">{question.text}</p>
      )}
      {hasBody && expanded && (
        <>
          {showAnswer && (
            <div className="q-facet q-facet--answer">
              <span className="q-facet__label q-facet__label--answer">
                <Icon name="check" /> {t('q.answerInCall')}
              </span>
              <p className="q-facet__text">{question.answer}</p>
            </div>
          )}
          {reply && (
            <div className="q-facet q-facet--reply">
              <div className="q-bar">
                <span className="q-facet__label q-facet__label--reply">
                  <Icon name="chat" /> {t('q.readyReply')}
                </span>
                <CopyButton text={reply.text} label={t('copy.reply')} />
              </div>
              <p className="q-facet__text">{reply.text}</p>
            </div>
          )}
          {memory && <MemoryFacet card={memory} onOpenSource={onOpenSource} />}
        </>
      )}
    </div>
  );
}

// The merged "Questions" section: every open question with its answer/reply/memory woven in, then
// look-backs with no matching question, orphan replies, and things the user could raise.
function QuestionsSection({ data, utterances, huddle, now, detect, contextCards, onOpenSource, onDismissContext, onAsk, seen, showAllSeen, onMarkSeen, onMarkAllSeen, removed, onRemove, deckOn, onToggleDeck }) {
  const t = useT();
  const dismiss = !showAllSeen;
  const hidden = (key) => removed?.has(key) || (!showAllSeen && seen?.has(key));
  const questions = oldestFirst((detect.questions ? data.open_questions ?? [] : []).filter((q) => !hidden(q.text)));
  const replies = detect.replies ? data.replies ?? [] : [];
  const suggestions = (detect.suggestions ? data.suggestions ?? [] : []).filter((text) => !hidden(text));
  const cards = detect.context ? contextCards ?? [] : [];

  // A question shows its past-meeting match inline only while loading or when it resolved to a hit.
  // Every other card (empty, error, or one that matches no question) renders as an orphan below, so
  // it stays visible and keeps its dismiss button.
  const embedded = new Map();
  for (const c of cards) {
    if (!c.line || embedded.has(c.line)) continue;
    if (c.status === 'loading' || (c.status === 'done' && c.result?.found)) embedded.set(c.line, c);
  }
  const embeddedCards = new Set(embedded.values());
  const orphanMemory = cards.filter((c) => !embeddedCards.has(c));

  const usedReply = new Set();
  const replyFor = (line) => {
    if (!line) return null;
    const r = replies.find((rep) => rep.re_line === line && !usedReply.has(rep));
    if (r) usedReply.add(r);
    return r;
  };

  const questionCards = questions.map((q, i) => (
    <QuestionCard
      key={`q:${q.line}:${i}`}
      question={q}
      reply={replyFor(q.line)}
      memory={embedded.get(q.line)}
      time={huddle?.active ? cardAgo(q.line, utterances, huddle, now) : null}
      utterances={utterances}
      onOpenSource={onOpenSource}
      onAsk={onAsk}
      onSeen={onMarkSeen}
      seen={seen}
      onRemove={onRemove}
      dismiss={dismiss}
    />
  ));

  const orphanReplies = replies.filter((r) => !usedReply.has(r) && !hidden(r.text));

  const total = questionCards.length + orphanMemory.length + orphanReplies.length + suggestions.length;
  if (!total) return null;

  // Every seen-able key in this section (orphan memory uses dismiss, not seen, so it is excluded).
  const allQuestions = detect.questions ? data.open_questions ?? [] : [];
  const allReplies = detect.replies ? data.replies ?? [] : [];
  const allSuggestions = detect.suggestions ? data.suggestions ?? [] : [];
  const markKeys = [
    ...allQuestions.map((q) => q.text),
    ...allReplies.map((r) => r.text),
    ...allSuggestions,
  ];

  const allCards = [
    ...questionCards,
    ...orphanMemory.map((c) => (
      <div key={`m:${c.key}`} className="q-card q-card--memory">
        <div className="q-card__head">
          <span className="q-state q-state--memory">{t('memory.fromPastMeetings')}</span>
          <Tooltip label={t('q.dismiss')}>
            <button className="q-card__close" type="button" aria-label={t('q.dismiss')} onClick={() => onDismissContext(c.key)}>
              <Icon name="close" />
            </button>
          </Tooltip>
        </div>
        <p className="q-card__text">{c.about || c.query}</p>
        <MemoryFacet card={c} onOpenSource={onOpenSource} />
      </div>
    )),
    ...orphanReplies.map((r, i) => (
      <CopyCard key={`r:${i}`} variant="reply" icon="chat" label={t('reply.suggested')} text={r.text} copyLabel={t('copy.reply')} onAsk={onAsk} onSeen={onMarkSeen} seen={seen} onRemove={onRemove} dismiss={dismiss} />
    )),
    ...suggestions.map((text) => (
      <CopyCard key={`s:${text}`} variant="proposable" icon="spark" label={t('suggestion.couldRaise')} text={text} copyLabel={t('copy.question')} onAsk={onAsk} onSeen={onMarkSeen} seen={seen} onRemove={onRemove} dismiss={dismiss} />
    )),
  ];

  const tools = (
    <span className="section__tools">
      <DeckToggle on={deckOn} onToggle={onToggleDeck} count={allCards.length} />
      <MarkAllButton keys={markKeys} onMarkAll={onMarkAllSeen} seen={seen} />
    </span>
  );
  return (
    <Section title={t('section.questions')} count={total} action={tools}>
      {deckOn && allCards.length > 1 ? (
        <div className={`deck deck--${Math.min(allCards.length, 3)}`}>{allCards[0]}</div>
      ) : (
        <div className="q-list">{allCards}</div>
      )}
    </Section>
  );
}

// A short list item (point, decision) in the same card style as the questions, with a copy action.
function RowCard({ icon, tone, text, time, copyLabel, onAsk, onSeen, seen, onRemove, dismiss }) {
  return (
    <div className="q-card q-card--row">
      <span className={`q-row__icon q-row__icon--${tone}`}>
        <Icon name={icon} />
      </span>
      <p className="q-card__text">{text}</p>
      <span className="q-actions">
        {time && <span className="q-time muted small">{time}</span>}
        <AskButton topic={text} onAsk={onAsk} />
        <CopyButton text={text} label={copyLabel} />
        <RemoveButton topic={text} onRemove={onRemove} />
        <SeenButton topic={text} onSeen={onSeen} seen={seen} dismiss={dismiss} />
      </span>
    </div>
  );
}

// An action in the card style. A check button marks it done — replacing the old checkbox — and the
// owner/due sit below; a done action dims and strikes through.
function ActionCard({ action, checked, time, onToggle, onAsk, onSeen, seen, onRemove, dismiss }) {
  const t = useT();
  return (
    <div className={checked ? 'q-card q-card--action q-card--done' : 'q-card q-card--action'}>
      <div className="q-bar">
        <span className="q-state q-state--action">
          <Icon name="bolt" /> {t('action.label')}
        </span>
        <span className="q-actions">
          {time && <span className="q-time muted small">{time}</span>}
          <AskButton topic={action.text} onAsk={onAsk} />
          <RemoveButton topic={action.text} onRemove={onRemove} />
          <Tooltip label={checked ? t('action.done') : t('action.markDone')}>
            <button
              type="button"
              className={checked ? 'q-copy q-check q-check--done' : 'q-copy q-check'}
              aria-pressed={String(checked)}
              aria-label={checked ? t('action.markNotDone') : t('action.markDone')}
              onClick={() => onToggle(action.text, !checked)}
            >
              <Icon name={checked ? 'seen' : 'circle'} />
            </button>
          </Tooltip>
          <SeenButton topic={action.text} onSeen={onSeen} seen={seen} dismiss={dismiss} />
        </span>
      </div>
      <p className="q-card__text">{action.text}</p>
      {(action.owner || action.due) && (
        <div className="q-action__meta">
          {action.owner && (
            <span className="owner">
              <Avatar name={action.owner} size="xs" />
              <span className="owner__name">{action.owner}</span>
            </span>
          )}
          {action.due && <span className={`due due--${dueTone(action.due)}`}>{action.due}</span>}
        </div>
      )}
    </div>
  );
}

function TopicTimeline({ topics, active, utterances }) {
  const t = useT();
  const lastIndex = topics.length - 1;
  return (
    <div className="timeline">
      <span className="timeline__heading muted small strong">{t('topic.timeline')}</span>
      {topics.map((topic, index) => {
        const nowTopic = index === lastIndex;
        const at = utterances[topic.line - 1];
        return (
          <div key={index} className={nowTopic ? 'tl tl--now' : 'tl'}>
            <span className="tl__dot" />
            <div className="tl__body">
              <div className="tl__head">
                <span className="tl__title">{nowTopic && active ? t('topic.now', { title: topic.title }) : topic.title}</span>
                {at && <span className="tl__time muted small">{formatClock(at.at)}</span>}
              </div>
              {topic.note && <p className="tl__note muted small">{topic.note}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TopicCard({ data, updatedAt, utterances, huddle, now, expanded, onToggle }) {
  const t = useT();
  const active = huddle.active;
  const raw = data.topics ?? [];
  const topics = raw.length ? raw : [{ title: data.topic.title, note: data.topic.summary, line: utterances.length }];
  const drift = driftMinutes(data.focus, utterances, huddle, now);
  const canExpand = topics.length >= 1;
  const isExpanded = expanded && canExpand;
  const titleBlock = (
    <>
      <h2 className="card__title">{data.topic.title}</h2>
      <p className="card__body">{data.topic.summary}</p>
    </>
  );
  return (
    <section className="card" aria-label={t('topic.currentAria')}>
      <div className="card__meta">
        <span className="accent">{active ? t('topic.speakingNow') : t('topic.lastTopic')}</span>
        <span className="q-card__meta">
          {active && <span className="muted" id="updated-ago">{ago(updatedAt, now)}</span>}
          {canExpand && (
            <Tooltip label={isExpanded ? t('topic.hideTopics') : t('topic.seeTopics')}>
              <button
                type="button"
                className="q-copy q-chevbtn"
                aria-expanded={String(isExpanded)}
                aria-label={isExpanded ? t('topic.hideTopics') : t('topic.seeTopics')}
                onClick={onToggle}
              >
                <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} />
              </button>
            </Tooltip>
          )}
        </span>
      </div>
      {canExpand ? (
        <button type="button" className="topic__head" aria-expanded={String(isExpanded)} onClick={onToggle}>
          {titleBlock}
        </button>
      ) : (
        titleBlock
      )}
      {drift != null && (
        <div className="drift">
          <Icon name="warn" />
          <span>{t('topic.drift', { n: drift })}</span>
        </div>
      )}
      {isExpanded && <TopicTimeline topics={topics} active={active} utterances={utterances} />}
    </section>
  );
}

// Uma linha de participante: mostra o nome (o corrigido quando há correção) e, ao clicar, vira um
// campo para o usuário corrigir a grafia. A correção volta por onRename(original, corrigido) e passa
// a valer nas próximas análises e na ata.
function PersonRow({ name, override, onRename }) {
  const t = useT();
  const display = override || name;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(display);
  const start = () => {
    setValue(display);
    setEditing(true);
  };
  const commit = () => {
    const v = value.trim();
    onRename(name, v && v !== name ? v : '');
    setEditing(false);
  };
  const onKey = (e) => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') setEditing(false);
  };
  return (
    <div className="q-card q-card--row person">
      <Avatar name={display} size="xs" />
      {editing ? (
        <input
          className="person__input"
          type="text"
          value={value}
          autoFocus
          aria-label={t('person.correctNameOf', { name })}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
        />
      ) : (
        <Tooltip label={t('person.clickToCorrect')}>
          <button type="button" className="person__name" onClick={start}>
            {display}
            {override && override !== name && <span className="muted small person__from">{t('person.was', { name })}</span>}
          </button>
        </Tooltip>
      )}
      <span className="q-actions">
        {!editing && (
          <Tooltip label={t('person.correctName')}>
            <button type="button" className="q-copy" aria-label={t('person.correctNameOf', { name })} onClick={start}>
              <Icon name="pencil" />
            </button>
          </Tooltip>
        )}
      </span>
    </div>
  );
}

// Participantes encontrados na reunião (falantes das legendas + quem a IA identificou). Permite
// corrigir a grafia do nome, já que a legenda às vezes erra — a correção alimenta as próximas
// análises e a ata.
function PeopleSection({ people, overrides, onRename }) {
  const t = useT();
  if (!onRename || !people?.length) return null;
  return (
    <Section title={t('section.people')} count={people.length}>
      <div className="q-list">
        {people.map((name) => (
          <PersonRow key={name} name={name} override={overrides?.[name]} onRename={onRename} />
        ))}
      </div>
    </Section>
  );
}

export function InsightsView({
  current,
  settings,
  huddle,
  utterances,
  now,
  acked,
  done,
  contextCards,
  topicExpanded,
  onToggleTopic,
  onAcceptAlert,
  onAcceptAllAlerts,
  onEditAlert,
  onToggleDone,
  onDismissContext,
  onOpenContextSource,
  onOpenSettings,
  onAskAI,
  seen,
  showAllSeen,
  onMarkSeen,
  onMarkAllSeen,
  removed,
  onRemove,
  people,
  nameOverrides,
  onRenamePerson,
  deckSections,
  onToggleDeckSection,
  hiddenSeen,
  onToggleShowAll,
}) {
  const t = useT();
  if (!current) {
    if (!hasKeyForModel(settings)) {
      return (
        <div className="empty">
          <p>{t('insights.needKeyEmpty')}</p>
          <button className="button button--primary" type="button" onClick={onOpenSettings}>
            {t('insights.configureKey')}
          </button>
        </div>
      );
    }
    return (
      <div className="empty">
        <p>{utterances.length ? t('insights.generatingFirst') : t('insights.appearAfter')}</p>
      </div>
    );
  }
  const data = current.data;
  const dismiss = !showAllSeen;
  // "há X min" de cada card só faz sentido ao vivo; fora disso não mostramos o tempo.
  const live = huddle.active;
  const timeFor = (line) => (live ? cardAgo(line, utterances, huddle, now) : null);
  const hiddenCard = (key) => removed?.has(key) || (!showAllSeen && seen?.has(key));
  // Deck + "marcar todos" no cabeçalho de cada seção. `count` é quantos cards estão visíveis; o deck
  // só aparece a partir de 2.
  const tools = (key, count, markKeys) => (
    <span className="section__tools">
      <DeckToggle on={deckSections?.has(key)} onToggle={() => onToggleDeckSection(key)} count={count} />
      <MarkAllButton keys={markKeys} onMarkAll={onMarkAllSeen} seen={seen} />
    </span>
  );

  const points = oldestFirst(
    data.points.map((p) => (typeof p === 'string' ? { text: p, line: 0 } : p)).filter((p) => !hiddenCard(p.text)),
  );
  const actions = oldestFirst((data.actions ?? []).filter((action) => !hiddenCard(action.text)));
  const decisions = oldestFirst(
    data.decisions.map((d) => (typeof d === 'string' ? { text: d, line: 0 } : d)).filter((d) => !hiddenCard(d.text)),
  );
  const references = (data.references ?? []).filter((ref) => !hiddenCard(ref.title));
  const acronyms = (data.acronyms ?? []).filter((item) => !hiddenCard(item.term));

  return (
    <div className="stack stack--insights">
      <TopicCard
        data={data}
        updatedAt={current.updatedAt}
        utterances={utterances}
        huddle={huddle}
        now={now}
        expanded={topicExpanded}
        onToggle={onToggleTopic}
      />
      {settings.detect.alerts && (
        <AlertsSection
          alerts={data.alerts ?? []}
          acked={acked}
          utterances={utterances}
          huddle={huddle}
          now={now}
          onAccept={onAcceptAlert}
          onAcceptAll={onAcceptAllAlerts}
          onEdit={onEditAlert}
          onAsk={onAskAI}
          deckOn={deckSections?.has('alerts')}
          onToggleDeck={onToggleDeckSection ? () => onToggleDeckSection('alerts') : undefined}
        />
      )}
      <QuestionsSection
        data={data}
        utterances={utterances}
        huddle={huddle}
        now={now}
        detect={settings.detect}
        contextCards={contextCards}
        onOpenSource={onOpenContextSource}
        onDismissContext={onDismissContext}
        onAsk={onAskAI}
        seen={seen}
        showAllSeen={showAllSeen}
        onMarkSeen={onMarkSeen}
        onMarkAllSeen={onMarkAllSeen}
        removed={removed}
        onRemove={onRemove}
        deckOn={deckSections?.has('questions')}
        onToggleDeck={() => onToggleDeckSection('questions')}
      />
      <Section
        title={t('section.points')}
        count={points.length}
        deck={deckSections?.has('points')}
        action={tools('points', points.length, points.map((p) => p.text))}
      >
        {points.map((p) => (
          <RowCard key={p.text} icon="bulb" tone="blue" text={p.text} time={timeFor(p.line)} copyLabel={t('copy.point')} onAsk={onAskAI} onSeen={onMarkSeen} seen={seen} onRemove={onRemove} dismiss={dismiss} />
        ))}
      </Section>
      {settings.detect.actions && (
        <Section
          title={t('section.actions')}
          count={actions.length}
          deck={deckSections?.has('actions')}
          action={tools('actions', actions.length, actions.map((a) => a.text))}
        >
          {actions.map((action) => (
            <ActionCard key={action.text} action={action} checked={done.has(action.text)} time={timeFor(action.line)} onToggle={onToggleDone} onAsk={onAskAI} onSeen={onMarkSeen} seen={seen} onRemove={onRemove} dismiss={dismiss} />
          ))}
        </Section>
      )}
      {settings.detect.decisions && (
        <Section
          title={t('section.decisions')}
          count={decisions.length}
          deck={deckSections?.has('decisions')}
          action={tools('decisions', decisions.length, decisions.map((d) => d.text))}
        >
          {decisions.map((d) => (
            <RowCard key={d.text} icon="check" tone="green" text={d.text} time={timeFor(d.line)} copyLabel={t('copy.decision')} onAsk={onAskAI} onSeen={onMarkSeen} seen={seen} onRemove={onRemove} dismiss={dismiss} />
          ))}
        </Section>
      )}
      {settings.detect.references && (
        <Section
          title={t('section.references')}
          count={references.length}
          deck={deckSections?.has('references')}
          action={tools('references', references.length, references.map((r) => r.title))}
        >
          {references.map((ref) => (
            <ReferenceRow key={ref.title} ref={ref} onAsk={onAskAI} onSeen={onMarkSeen} seen={seen} onRemove={onRemove} dismiss={dismiss} />
          ))}
        </Section>
      )}
      {settings.detect.acronyms && (
        <Section
          title={t('section.acronyms')}
          count={acronyms.length}
          deck={deckSections?.has('acronyms')}
          action={tools('acronyms', acronyms.length, acronyms.map((a) => a.term))}
        >
          {acronyms.map((item) => (
            <AcronymRow key={item.term} item={item} onAsk={onAskAI} onSeen={onMarkSeen} seen={seen} onRemove={onRemove} dismiss={dismiss} />
          ))}
        </Section>
      )}
      <PeopleSection people={people} overrides={nameOverrides} onRename={onRenamePerson} />
      {onToggleShowAll && (hiddenSeen > 0 || showAllSeen) && (
        <button
          className="button button--block button--showseen"
          type="button"
          aria-pressed={String(showAllSeen)}
          onClick={onToggleShowAll}
        >
          <Icon name={showAllSeen ? 'eye' : 'eye-off'} />
          {showAllSeen ? t('info.hideSeen') : t('info.showAll', { n: hiddenSeen })}
        </button>
      )}
    </div>
  );
}
