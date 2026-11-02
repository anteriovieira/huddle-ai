import { useRef, useState } from 'react';
import { formatClock } from '../lib/format.js';
import { ago } from '../lib/format.js';
import { hasKeyForModel } from '../lib/models.js';
import { Icon } from '../ui/Icon.jsx';
import { Avatar, IconRow, Section } from '../ui/primitives.jsx';

// Tom da pílula de prazo a partir do texto (o prazo vem como foi dito).
function dueTone(due) {
  const s = due.toLowerCase();
  if (/hoje|today|agora|urgente|j[áa]\b/.test(s)) return 'today';
  if (/pr[óo]x|semana|m[êe]s|depois|week|month|que vem/.test(s)) return 'later';
  return 'soon';
}

function ActionItem({ action, checked, onToggle }) {
  return (
    <li className={checked ? 'action-item action-item--done' : 'action-item'}>
      <input
        className="action-item__check"
        type="checkbox"
        checked={checked}
        aria-label={action.text}
        onChange={(e) => onToggle(action.text, e.target.checked)}
      />
      <div className="action-item__body">
        <span className="action-item__title">{action.text}</span>
        {(action.owner || action.due) && (
          <div className="action-item__meta">
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
    </li>
  );
}

const DRIFT_THRESHOLD_MS = 90 * 1000;

const ALERT_META = {
  mention: { tone: 'purple', icon: 'at', title: 'Te mencionaram', tag: 'menção' },
  action: { tone: 'green', icon: 'check', title: 'Ação atribuída a você', tag: 'ação' },
  question: { tone: 'yellow', icon: 'question', title: 'Pergunta em aberto', tag: 'pergunta' },
};

const REF_META = {
  book: { tone: 'purple', icon: 'book' },
  app: { tone: 'blue', icon: 'app' },
  tool: { tone: 'green', icon: 'tool' },
  link: { tone: 'blue', icon: 'link' },
  article: { tone: 'yellow', icon: 'doc' },
  other: { tone: 'yellow', icon: 'bulb' },
};

function ReferenceRow({ ref }) {
  const meta = REF_META[ref.kind] ?? REF_META.other;
  const isUrl = /^https?:\/\//i.test(ref.title);
  return (
    <div className="row">
      <span className={`badge-icon badge-icon--${meta.tone}`}>
        <Icon name={meta.icon} />
      </span>
      <span className="row__stack">
        <span>
          {isUrl ? (
            <a className="ref__title link" href={ref.title} target="_blank" rel="noopener noreferrer">
              {ref.title}
            </a>
          ) : (
            <span className="ref__title">{ref.title}</span>
          )}
          {ref.by && <span className="muted small">{` · ${ref.by}`}</span>}
        </span>
        {ref.description && <span className="muted small">{ref.description}</span>}
      </span>
    </div>
  );
}

function AcronymRow({ item }) {
  return (
    <div className="row">
      <span className="badge-icon badge-icon--blue">
        <Icon name="hash" />
      </span>
      <span className="row__stack">
        <span className="strong">{item.term}</span>
        {item.meaning && <span className="muted small">{item.meaning}</span>}
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

function AlertsSection({ alerts, acked, utterances, onAccept, onEdit }) {
  const pending = alerts.filter((alert) => !acked.has(alert.text));
  if (!pending.length) return null;
  return (
    <section className="section" aria-label="Alertas pra você">
      <h3 className="section__title">
        Alertas pra você<span className="count">{String(pending.length)}</span>
      </h3>
      {pending.map((alert) => {
        const meta = ALERT_META[alert.kind];
        const at = utterances[alert.line - 1];
        return (
          <article key={`${alert.kind}:${alert.text}`} className={`alert alert--${meta.tone}`}>
            <div className="alert__head">
              <span className={`badge-icon badge-icon--${meta.tone}`}>
                <Icon name={meta.icon} />
              </span>
              <span className="alert__title">{meta.title}</span>
              <span className="muted small alert__when">
                {[at ? formatClock(at.at) : null, alert.from].filter(Boolean).join(' · ')}
              </span>
            </div>
            <p className="alert__text">{alert.text}</p>
            <div className="alert__foot">
              <span className={`tag tag--${alert.kind}`}>{meta.tag}</span>
              <div className="alert__actions">
                {alert.kind === 'action' && (
                  <button className="button button--small" type="button" onClick={() => onEdit(alert)}>
                    <Icon name="pencil" />
                    Editar
                  </button>
                )}
                <button className="button button--small button--accept" type="button" onClick={() => onAccept(alert)}>
                  <Icon name="check" />
                  {alert.kind === 'action' ? 'Aceitar' : 'Ok'}
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}

// Icon-only clipboard button that confirms with a check for a beat (same pattern as the captions
// copy). Self-contained so each reply/suggestion card carries its own, with no handler threaded in.
// `label` is both the accessible name and the hover tooltip.
function CopyButton({ text, label = 'Copiar' }) {
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
  const name = copied ? 'Copiado' : label;
  return (
    <button type="button" className="q-copy" title={name} aria-label={name} onClick={copy}>
      <Icon name={copied ? 'check' : 'copy'} />
    </button>
  );
}

// A top-level question card made only of a labelled bar with a copy action and one line of text —
// shared by the orphan-reply and the proposal cards, which differ only in accent, icon and labels.
function CopyCard({ variant, icon, label, text, copyLabel }) {
  return (
    <div className={`q-card q-card--${variant}`}>
      <div className="q-bar">
        <span className={`q-state q-state--${variant}`}>
          <Icon name={icon} /> {label}
        </span>
        <CopyButton text={text} label={copyLabel} />
      </div>
      <p className="q-card__text">{text}</p>
    </div>
  );
}

// The past-meeting answer tied to a question. Mirrors the old ContextSuggestions statuses so a
// failed or empty recall is still visible (and, as an orphan card, still dismissable) rather than
// vanishing: loading and error/empty show a quiet line; a hit shows the answer and its sources.
function MemoryFacet({ card, onOpenSource }) {
  if (!card) return null;
  if (card.status === 'loading') return <p className="q-memory-status muted small">Procurando nas atas anteriores…</p>;
  if (card.status === 'error') return <p className="q-memory-status muted small">{`Não consegui buscar: ${card.error}`}</p>;
  if (card.status !== 'done' || !card.result?.found)
    return <p className="q-memory-status muted small">Nenhuma reunião passada registrou isso.</p>;
  return (
    <div className="q-facet q-facet--memory">
      <span className="q-facet__label q-facet__label--memory">
        <Icon name="history" /> de uma reunião anterior
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

const Q_STATE_LABEL = {
  reply: 'Você pode responder',
  answered: 'Respondida na call',
  memory: 'Talvez já decidido',
  open: 'Em aberto',
};

// One question, carrying whatever the meeting knows about it: an answer said in the call, a
// ready-to-paste reply, and/or a past-meeting match. The dominant facet sets the state accent.
// `memory` is only ever a loading or a resolved hit (empty/error recalls surface as orphan cards).
function QuestionCard({ question, reply, memory, utterances, onOpenSource }) {
  const at = question.line ? utterances[question.line - 1] : null;
  const showAnswer = Boolean(question.answer);
  const memoryDone = memory && memory.status === 'done' && memory.result?.found;
  const state = reply ? 'reply' : showAnswer ? 'answered' : memoryDone ? 'memory' : 'open';
  return (
    <div className={`q-card q-card--${state}`}>
      <div className="q-card__head">
        <span className={`q-state q-state--${state}`}>{Q_STATE_LABEL[state]}</span>
        {at && <span className="muted small">{formatClock(at.at)}</span>}
      </div>
      <p className="q-card__text">{question.text}</p>
      {showAnswer && (
        <div className="q-facet q-facet--answer">
          <span className="q-facet__label q-facet__label--answer">
            <Icon name="check" /> resposta dita na call
          </span>
          <p className="q-facet__text">{question.answer}</p>
        </div>
      )}
      {reply && (
        <div className="q-facet q-facet--reply">
          <div className="q-bar">
            <span className="q-facet__label q-facet__label--reply">
              <Icon name="chat" /> resposta pronta pra colar
            </span>
            <CopyButton text={reply.text} label="Copiar resposta" />
          </div>
          <p className="q-facet__text">{reply.text}</p>
        </div>
      )}
      {memory && <MemoryFacet card={memory} onOpenSource={onOpenSource} />}
    </div>
  );
}

// The merged "Perguntas" section: every open question with its answer/reply/memory woven in, then
// look-backs with no matching question, orphan replies, and things the user could raise.
function QuestionsSection({ data, utterances, detect, contextCards, onOpenSource, onDismissContext }) {
  const questions = detect.questions ? data.open_questions ?? [] : [];
  const replies = detect.replies ? data.replies ?? [] : [];
  const suggestions = detect.suggestions ? data.suggestions ?? [] : [];
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
      utterances={utterances}
      onOpenSource={onOpenSource}
    />
  ));

  const orphanReplies = replies.filter((r) => !usedReply.has(r));

  const total = questionCards.length + orphanMemory.length + orphanReplies.length + suggestions.length;
  if (!total) return null;

  return (
    <Section title="Perguntas" count={total}>
      <div className="q-list">
        {questionCards}
        {orphanMemory.map((c) => (
          <div key={`m:${c.key}`} className="q-card q-card--memory">
            <div className="q-card__head">
              <span className="q-state q-state--memory">De reuniões passadas</span>
              <button className="q-card__close" type="button" aria-label="Dispensar" onClick={() => onDismissContext(c.key)}>
                <Icon name="close" />
              </button>
            </div>
            <p className="q-card__text">{c.about || c.query}</p>
            <MemoryFacet card={c} onOpenSource={onOpenSource} />
          </div>
        ))}
        {orphanReplies.map((r, i) => (
          <CopyCard key={`r:${i}`} variant="reply" icon="chat" label="Resposta sugerida" text={r.text} copyLabel="Copiar resposta" />
        ))}
        {suggestions.map((text) => (
          <CopyCard key={`s:${text}`} variant="proposable" icon="spark" label="Você poderia levantar" text={text} copyLabel="Copiar pergunta" />
        ))}
      </div>
    </Section>
  );
}

function TopicTimeline({ topics, active, utterances }) {
  const lastIndex = topics.length - 1;
  return (
    <div className="timeline">
      <span className="timeline__heading muted small strong">O que já rolou</span>
      {topics.map((topic, index) => {
        const nowTopic = index === lastIndex;
        const at = utterances[topic.line - 1];
        return (
          <div key={index} className={nowTopic ? 'tl tl--now' : 'tl'}>
            <span className="tl__dot" />
            <div className="tl__body">
              <div className="tl__head">
                <span className="tl__title">{nowTopic && active ? `Agora: ${topic.title}` : topic.title}</span>
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
  const active = huddle.active;
  const raw = data.topics ?? [];
  const topics = raw.length ? raw : [{ title: data.topic.title, note: data.topic.summary, line: utterances.length }];
  const drift = driftMinutes(data.focus, utterances, huddle, now);
  const canExpand = topics.length >= 1;
  const isExpanded = expanded && canExpand;
  return (
    <section className="card" aria-label="Tópico atual">
      <div className="card__meta">
        <span className="accent">{active ? 'Falando agora' : 'Último tópico'}</span>
        <span className="muted" id="updated-ago">
          {ago(updatedAt, now)}
        </span>
      </div>
      <h2 className="card__title">{data.topic.title}</h2>
      <p className="card__body">{data.topic.summary}</p>
      {drift != null && (
        <div className="drift">
          <Icon name="warn" />
          <span>{`Disperso há ${drift} min — longe da pauta`}</span>
        </div>
      )}
      {isExpanded && <TopicTimeline topics={topics} active={active} utterances={utterances} />}
      {canExpand && (
        <button className="topic__toggle" type="button" aria-expanded={String(isExpanded)} onClick={onToggle}>
          <Icon name={isExpanded ? 'collapse' : 'expand'} />
          {isExpanded ? 'Ocultar tópicos' : `Ver tópicos discutidos (${topics.length})`}
        </button>
      )}
    </section>
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
  onEditAlert,
  onToggleDone,
  onDismissContext,
  onOpenContextSource,
  onOpenSettings,
}) {
  if (!current) {
    if (!hasKeyForModel(settings)) {
      return (
        <div className="empty">
          <p>Configure a chave da API do modelo escolhido para gerar os insights.</p>
          <button className="button button--primary" type="button" onClick={onOpenSettings}>
            Configurar chave
          </button>
        </div>
      );
    }
    return (
      <div className="empty">
        <p>{utterances.length ? 'Gerando os primeiros insights…' : 'Os insights aparecem depois das primeiras falas.'}</p>
      </div>
    );
  }
  const data = current.data;
  return (
    <div className="stack">
      {settings.detect.alerts && (
        <AlertsSection
          alerts={data.alerts ?? []}
          acked={acked}
          utterances={utterances}
          onAccept={onAcceptAlert}
          onEdit={onEditAlert}
        />
      )}
      <TopicCard
        data={data}
        updatedAt={current.updatedAt}
        utterances={utterances}
        huddle={huddle}
        now={now}
        expanded={topicExpanded}
        onToggle={onToggleTopic}
      />
      <QuestionsSection
        data={data}
        utterances={utterances}
        detect={settings.detect}
        contextCards={contextCards}
        onOpenSource={onOpenContextSource}
        onDismissContext={onDismissContext}
      />
      <Section title="Pontos levantados">
        {data.points.map((text) => (
          <IconRow key={text} name="bulb" tone="blue">
            {text}
          </IconRow>
        ))}
      </Section>
      {settings.detect.actions && (
        <Section title="Ações" count={data.actions.length}>
          {data.actions.length > 0 && (
            <ul className="action-list">
              {data.actions.map((action) => (
                <ActionItem key={action.text} action={action} checked={done.has(action.text)} onToggle={onToggleDone} />
              ))}
            </ul>
          )}
        </Section>
      )}
      {settings.detect.decisions && (
        <Section title="Decisões" count={data.decisions.length}>
          {data.decisions.map((text) => (
            <IconRow key={text} name="check" tone="green">
              {text}
            </IconRow>
          ))}
        </Section>
      )}
      {settings.detect.references && (
        <Section title="Referências mencionadas" count={(data.references ?? []).length}>
          {(data.references ?? []).map((ref) => (
            <ReferenceRow key={ref.title} ref={ref} />
          ))}
        </Section>
      )}
      {settings.detect.acronyms && (
        <Section title="Siglas" count={(data.acronyms ?? []).length}>
          {(data.acronyms ?? []).map((item) => (
            <AcronymRow key={item.term} item={item} />
          ))}
        </Section>
      )}
    </div>
  );
}
