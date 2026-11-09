import { useEffect, useRef, useState } from 'react';
import { ago, formatDateTime, formatDuration } from '../lib/format.js';
import { CATEGORY_TONES, groupSessions, listTime, modelLabel } from '../lib/minutes.js';
import { useT } from '../lib/i18n.js';
import { Icon } from '../ui/Icon.jsx';
import { KebabMenu } from '../ui/Menu.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';
import { Avatar, Chip, Section } from '../ui/primitives.jsx';

function MetaCell({ label, value }) {
  return (
    <div className="meta-grid__cell">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Heading({ children }) {
  return <h2 className="section__title">{children}</h2>;
}

// Uma linha de item no estilo dos cards de insight: ícone de tom à esquerda e o texto.
function AtaRow({ icon, tone, text }) {
  return (
    <div className="q-card q-card--row">
      <span className={`q-row__icon q-row__icon--${tone}`}>
        <Icon name={icon} />
      </span>
      <p className="q-card__text">{text}</p>
    </div>
  );
}

// Um próximo passo como card de tarefa no mesmo estilo da Ação do insight: selo "Tarefa", botão de
// concluir (círculo → círculo com check) e, abaixo, responsável e prazo. `done` guarda o estado
// marcado por "huddleId:text".
function AtaStep({ record, step, done, onToggle }) {
  const t = useT();
  const key = `${record.huddleId}:${step.text}`;
  const checked = done.has(key);
  return (
    <div className={checked ? 'q-card q-card--action q-card--done' : 'q-card q-card--action'}>
      <div className="q-bar">
        <span className="q-state q-state--action">
          <Icon name="bolt" /> {t('ata.step.task')}
        </span>
        <span className="q-actions">
          <button
            type="button"
            className={checked ? 'q-copy q-check q-check--done' : 'q-copy q-check'}
            aria-pressed={String(checked)}
            aria-label={checked ? t('action.markNotDone') : t('action.markDone')}
            title={checked ? t('action.done') : t('action.markDone')}
            onClick={() => onToggle(key, !checked)}
          >
            <Icon name={checked ? 'seen' : 'circle'} />
          </button>
        </span>
      </div>
      <p className="q-card__text">{step.text}</p>
      {(step.owner || step.due) && (
        <div className="q-action__meta">
          {step.owner && (
            <span className="owner">
              <Avatar name={step.owner} size="xs" />
              <span className="owner__name">{step.owner}</span>
            </span>
          )}
          {step.due && <span className="chip chip--yellow chip--xs">{step.due}</span>}
        </div>
      )}
    </div>
  );
}

// Why the meeting got its category: the confidence bar, the description of its themes and the
// transcript signals behind it. Opened from the classification chip in the minutes' header.
function ClassificationDialog({ classification, signals, tone, onClose }) {
  const t = useT();
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog dialog--wide" role="dialog" aria-modal="true" aria-label={t('ata.classification')}>
        <div className="card__meta">
          <span className="muted strong-muted">{t('ata.classification')}</span>
          <span className="muted">
            {t('ata.confidence')} <b className="text-strong">{`${classification.confidence}%`}</b>
          </span>
        </div>
        <div className="classification">
          <span className={`chip chip--lg ${tone ? `chip--${tone}` : ''}`}>{classification.category}</span>
          <div className="confidence" role="img" aria-label={t('ata.confidenceAria', { n: classification.confidence })}>
            <div className={`confidence__bar confidence__bar--${tone ?? 'grey'}`} style={{ width: `${classification.confidence}%` }} />
          </div>
        </div>
        {classification.description && <p className="muted small card__body">{classification.description}</p>}
        {signals.length > 0 && (
          <div className="stack stack--compact" aria-label={t('ata.signalsAria')}>
            <span className="muted small strong">{t('ata.signals')}</span>
            <p className="muted small">{t('ata.signalsIntro')}</p>
            <ul className="bullets bullets--plain">
              {signals.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="dialog__actions">
          <button ref={closeRef} className="button button--small" type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

// The full minutes. `done` remembers ticked next steps (keyed `huddleId:text`).
export function AtaContent({ record, done, onCopy, onToggleStep }) {
  const t = useT();
  const { meta, data } = record;
  const tone = CATEGORY_TONES[data.classification.category];
  // A classificação é um chip discreto no cabeçalho ("Daily · 70%"); o que a sustentou (descrição
  // dos temas + sinais da transcrição) abre num modal.
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <div className="stack ata">
      <section className="stack stack--compact" aria-label={t('ata.infoAria')}>
        <div className="section__row">
          <Heading>{t('ata.meetingInfo')}</Heading>
          <Tooltip label={t('ata.whyClassified')}>
            <button
              className={`ata-class ${tone ? `ata-class--${tone}` : ''}`}
              type="button"
              aria-haspopup="dialog"
              onClick={() => setDetailsOpen(true)}
            >
              <span className="ata-class__dot" aria-hidden="true" />
              {data.classification.category}
              <span className="ata-class__conf">{`${data.classification.confidence}%`}</span>
            </button>
          </Tooltip>
          <button className="button button--small" type="button" onClick={onCopy}>
            <Icon name="copy" />
            {t('ata.copy')}
          </button>
        </div>
        <dl className="meta-grid">
          <MetaCell label={t('ata.dateTime')} value={formatDateTime(meta.startedAt)} />
          <MetaCell label={t('ata.duration')} value={formatDuration(meta.endedAt - meta.startedAt)} />
          <MetaCell label={t('ata.ended')} value={formatDateTime(meta.endedAt)} />
          <MetaCell label={t('ata.source')} value={meta.source} />
        </dl>
        {meta.participants.length > 0 && (
          <div className="participants">
            <div className="participants__avatars">
              {meta.participants.slice(0, 5).map((name) => (
                <Avatar key={name} name={name} size="sm" />
              ))}
            </div>
            <span className="small">{meta.participants.join(', ')}</span>
          </div>
        )}
      </section>

      {detailsOpen && (
        <ClassificationDialog
          classification={data.classification}
          signals={data.signals}
          tone={tone}
          onClose={() => setDetailsOpen(false)}
        />
      )}

      {data.tags.length > 0 && (
        <section className="stack stack--compact" aria-label={t('ata.tagsAria')}>
          <Heading>{t('ata.tags')}</Heading>
          <div className="chips">
            {data.tags.map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
          </div>
        </section>
      )}

      <section className="stack stack--compact" aria-label={t('ata.summaryAria')}>
        <Heading>{t('ata.summary')}</Heading>
        <p className="ata__headline">{data.title}</p>
        <p className="ata__summary">{data.summary}</p>
      </section>

      <Section title={t('ata.keyPoints')} count={data.key_points.length}>
        {data.key_points.map((text, i) => (
          <AtaRow key={i} icon="bulb" tone="blue" text={text} />
        ))}
      </Section>

      <Section title={t('ata.decisions')} count={(data.decisions ?? []).length}>
        {(data.decisions ?? []).map((text, i) => (
          <AtaRow key={i} icon="check" tone="green" text={text} />
        ))}
      </Section>

      <Section title={t('ata.nextSteps')} count={data.next_steps.length}>
        {data.next_steps.map((stepItem, i) => (
          <AtaStep key={i} record={record} step={stepItem} done={done} onToggle={onToggleStep} />
        ))}
      </Section>

      <Section title={t('ata.openQuestions')} count={(data.open_questions ?? []).length}>
        {(data.open_questions ?? []).map((text, i) => (
          <AtaRow key={i} icon="question" tone="yellow" text={text} />
        ))}
      </Section>

      <Section title={t('ata.risks')} count={(data.risks ?? []).length}>
        {(data.risks ?? []).map((text, i) => (
          <AtaRow key={i} icon="warn" tone="purple" text={text} />
        ))}
      </Section>
    </div>
  );
}

export function AtaInfo({ onRegenerate, onOpenList, onPost, canPost, busy, minutes, autoMinutes, now }) {
  const t = useT();
  let text;
  if (busy) {
    text = t('ata.info.generating');
  } else if (minutes) {
    const model = modelLabel(minutes.model);
    text = model
      ? t('ata.info.generatedModel', { ago: ago(minutes.generatedAt, now), model })
      : t('ata.info.generated', { ago: ago(minutes.generatedAt, now) });
  } else if (autoMinutes) {
    text = t('ata.info.auto');
  } else {
    text = t('ata.info.manual');
  }
  return (
    <div className="info info--row">
      <span className="info__text" role={busy ? 'status' : undefined}>
        {text}
      </span>
      <div className="info__actions">
        {onRegenerate && (
          <Tooltip label={busy ? t('ata.generatingTip') : t('ata.generate')}>
            <button className="icon-button" type="button" aria-label={t('ata.generate')} disabled={busy} onClick={onRegenerate}>
              <Icon name="sparkles" />
            </button>
          </Tooltip>
        )}
        {onPost && (
          <Tooltip label={t('ata.postThread')}>
            <button className="icon-button" type="button" aria-label={t('ata.postThread')} disabled={!canPost} onClick={onPost}>
              <Icon name="plane" />
            </button>
          </Tooltip>
        )}
        <Tooltip label={t('ata.previous')}>
          <button className="icon-button" type="button" aria-label={t('ata.previous')} onClick={onOpenList}>
            <Icon name="history" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function DriveButton({ uploaded, driveBusy, onDrive }) {
  const t = useT();
  if (driveBusy) {
    return (
      <button className="icon-button icon-button--lg" type="button" disabled aria-label={t('drive.sendingAria')}>
        <span className="spinner" aria-hidden="true" />
      </button>
    );
  }
  return (
    <Tooltip label={uploaded ? t('drive.sentResend') : t('drive.send')}>
      <button
        className={uploaded ? 'icon-button icon-button--lg is-done' : 'icon-button icon-button--lg'}
        type="button"
        aria-label={uploaded ? t('drive.resendAria') : t('drive.send')}
        onClick={onDrive}
      >
        <Icon name="cloud" />
      </button>
    </Tooltip>
  );
}

export function AtaFooter({ record, onCopy, canPost, onPost, onDownload, uploaded, driveBusy, onDrive, flash }) {
  const t = useT();
  return (
    <footer className="footer">
      <div className="buttons">
        <button className="button button--primary" type="button" onClick={onCopy}>
          {t('ata.copy')}
        </button>
        <DriveButton uploaded={!!uploaded} driveBusy={driveBusy} onDrive={onDrive} />
        <Tooltip label={t('ata.downloadMd')}>
          <button className="icon-button icon-button--lg" type="button" aria-label={t('ata.downloadMdAria')} onClick={onDownload}>
            <Icon name="download" />
          </button>
        </Tooltip>
      </div>
      {uploaded && (
        <a className="muted small ata__drive-link" href={uploaded.link} target="_blank" rel="noopener noreferrer">
          {t('drive.viewIn')}
        </a>
      )}
      {flash && (
        <p className="muted small" role="status">
          {flash}
        </p>
      )}
    </footer>
  );
}

export function AtaEmpty({
  active,
  error,
  autoMinutes,
  utterances,
  participants,
  hasKey,
  canGenerate,
  onToggleAuto,
  onGenerate,
  onOpenList,
}) {
  const t = useT();
  const uUnit = t(utterances === 1 ? 'unit.caption.one' : 'unit.caption.other');
  const pUnit = t(participants === 1 ? 'unit.participant.one' : 'unit.participant.other');
  return (
    <div className="ata-empty">
      <div className="idle__hero">
        <div className="idle__icon">
          <Icon name="doc" />
        </div>
        <h1>{active ? t('ata.empty.titleActive') : t('ata.empty.titleEnded')}</h1>
        <p>{t('ata.empty.desc')}</p>
      </div>
      {error && (
        <div className="notice notice--error" role="status">
          {error}
        </div>
      )}
      <section className="checklist" aria-label={t('ata.empty.optionsAria')}>
        <label className="check check--toggle">
          <span className="row__stack">
            <span className="strong">{t('ata.empty.genOnEnd')}</span>
            <span className="muted small">{t('ata.empty.genOnEndHint')}</span>
          </span>
          <input type="checkbox" checked={autoMinutes} onChange={(e) => onToggleAuto(e.target.checked)} />
        </label>
        <div className="check">
          <span className="row__stack">
            <span className="strong">{active ? t('ata.empty.soFar') : t('ata.empty.thisHuddle')}</span>
            <span className="muted small">
              {t('ata.empty.counts', { n: utterances, unit: uUnit, m: participants, punit: pUnit })}
            </span>
          </span>
        </div>
      </section>
      <div className="idle__footer">
        {!hasKey && <p className="muted small center">{t('ata.empty.needKey')}</p>}
        <button className="button button--primary button--block" type="button" disabled={!canGenerate} onClick={onGenerate}>
          {t('ata.empty.generateNow')}
        </button>
        <button className="button button--block" type="button" onClick={onOpenList}>
          {t('ata.empty.seePrevious')}
        </button>
      </div>
    </div>
  );
}

export function AtaLoading({ startedAt, utterances, participants, now }) {
  const t = useT();
  const elapsed = now - startedAt;
  const uUnit = t(utterances === 1 ? 'unit.caption.one' : 'unit.caption.other');
  const pUnit = t(participants === 1 ? 'unit.participant.one' : 'unit.participant.other');
  const steps = [
    [t('ata.loading.reading', { n: utterances, uunit: uUnit, m: participants, punit: pUnit }), 0],
    [t('ata.loading.classifying'), 2500],
    [t('ata.loading.writing'), 6000],
  ];
  const activeIndex = steps.findLastIndex(([, at]) => elapsed >= at);
  return (
    <div className="stack">
      <section className="card progress" role="status" aria-label={t('ata.loading.progressAria')}>
        <h1 className="card__title">{t('ata.loading.title')}</h1>
        {steps.slice(0, activeIndex + 1).map(([label], index) => (
          <div key={index} className="progress__step">
            {index < activeIndex ? (
              <span className="check__mark check__mark--ok">
                <Icon name="check" />
              </span>
            ) : (
              <span className="spinner" aria-hidden="true" />
            )}
            <span className={index === activeIndex ? 'strong' : ''}>{label}</span>
          </div>
        ))}
        <p className="muted small">{t('ata.loading.note')}</p>
      </section>
      <div className="skeleton" aria-hidden="true">
        <div className="skeleton__line" style={{ width: '55%', height: '14px' }} />
        <div className="skeleton__grid">
          <div />
          <div />
          <div />
          <div />
        </div>
        <div className="skeleton__block" />
        <div className="skeleton__line" style={{ width: '100%' }} />
        <div className="skeleton__line" style={{ width: '92%' }} />
        <div className="skeleton__line" style={{ width: '70%' }} />
      </div>
    </div>
  );
}

// The list part of "Previous sessions", styled like Slack's "Recent huddles": an icon, the
// title on one truncated line, a time·duration meta line, participant avatars and a kebab
// menu (Open / Load / Delete). Clicking the row opens the session.
export function AtasList({ records, query, tag, onOpen, onLoad, onDelete, currentHuddleId, now }) {
  const t = useT();
  const { visible, groups } = groupSessions(records, query, tag, now);
  if (!records.length) {
    return (
      <div className="empty">
        <p>{t('atas.emptyNone')}</p>
      </div>
    );
  }
  if (!visible.length) {
    return (
      <div className="empty">
        <p>{t('atas.emptyFilter')}</p>
      </div>
    );
  }
  return (
    <>
      {groups.map(([label, items]) => (
        <section key={label} className="atas-group" aria-label={label}>
          <h2 className="atas-group__title">{label}</h2>
          {items.map((record) => {
            const people = record.meta.participants;
            const isCurrent = record.huddleId === currentHuddleId;
            const menuItems = [
              { label: t('atas.menu.open'), icon: 'open', onSelect: () => onOpen(record) },
              isCurrent
                ? { label: t('atas.menu.inApp'), icon: 'check', disabled: true }
                : onLoad && { label: t('atas.menu.load'), icon: 'download', onSelect: () => onLoad(record) },
              onDelete && { label: t('atas.menu.delete'), icon: 'trash', danger: true, onSelect: () => onDelete(record) },
            ].filter(Boolean);
            return (
              <div
                key={record.huddleId}
                className="ata-item"
                role="button"
                tabIndex={0}
                onClick={() => onOpen(record)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen(record);
                  }
                }}
              >
                <span className="ata-item__icon">
                  <Icon name="headphones" />
                </span>
                <div className="ata-item__body">
                  <span className="ata-item__title">{record.data.title}</span>
                  <span className="ata-item__meta">
                    {`${listTime(record.meta.startedAt, now)} · ${formatDuration(record.meta.endedAt - record.meta.startedAt)}`}
                    {isCurrent && <span className="pill pill--xs">{t('atas.inApp')}</span>}
                  </span>
                </div>
                {people.length > 0 && (
                  <div className="ata-item__avatars">
                    {people.slice(0, 3).map((name) => (
                      <Avatar key={name} name={name} size="sm" />
                    ))}
                    {people.length > 3 && <span className="ata-item__more">+{people.length - 3}</span>}
                  </div>
                )}
                <KebabMenu items={menuItems} />
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}
