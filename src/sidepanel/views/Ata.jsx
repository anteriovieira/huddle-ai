import { useState } from 'react';
import { ago, formatDateTime, formatDuration } from '../lib/format.js';
import { CATEGORY_TONES, groupSessions, listTime, modelLabel } from '../lib/minutes.js';
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
  const key = `${record.huddleId}:${step.text}`;
  const checked = done.has(key);
  return (
    <div className={checked ? 'q-card q-card--action q-card--done' : 'q-card q-card--action'}>
      <div className="q-bar">
        <span className="q-state q-state--action">
          <Icon name="bolt" /> Tarefa
        </span>
        <span className="q-actions">
          <button
            type="button"
            className={checked ? 'q-copy q-check q-check--done' : 'q-copy q-check'}
            aria-pressed={String(checked)}
            aria-label={checked ? 'Marcar como não feita' : 'Marcar como feita'}
            title={checked ? 'Feita' : 'Marcar como feita'}
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

// The full minutes. `done` remembers ticked next steps (keyed `huddleId:text`).
export function AtaContent({ record, done, onCopy, onToggleStep }) {
  const { meta, data } = record;
  const tone = CATEGORY_TONES[data.classification.category];
  // A classificação começa colapsada: o chip e a confiança ficam sempre visíveis, e o usuário
  // expande para ver o que a sustentou (descrição dos temas + sinais da transcrição).
  const [detailsOpen, setDetailsOpen] = useState(false);
  const hasDetails = Boolean(data.classification.description) || data.signals.length > 0;
  return (
    <div className="stack ata">
      <section className="stack stack--compact" aria-label="Informações da reunião">
        <div className="section__row">
          <Heading>Informações da reunião</Heading>
          <button className="button button--small" type="button" onClick={onCopy}>
            <Icon name="copy" />
            Copiar ata
          </button>
        </div>
        <dl className="meta-grid">
          <MetaCell label="Data e hora" value={formatDateTime(meta.startedAt)} />
          <MetaCell label="Duração" value={formatDuration(meta.endedAt - meta.startedAt)} />
          <MetaCell label="Término" value={formatDateTime(meta.endedAt)} />
          <MetaCell label="Fonte" value={meta.source} />
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

      <section className="card" aria-label="Classificação">
        <div className="card__meta">
          <span className="muted strong-muted">Classificação</span>
          <span className="muted">
            Confiança <b className="text-strong">{`${data.classification.confidence}%`}</b>
          </span>
        </div>
        <div className="classification">
          <span className={`chip chip--lg ${tone ? `chip--${tone}` : ''}`}>{data.classification.category}</span>
          <div className="confidence" role="img" aria-label={`Confiança de ${data.classification.confidence}%`}>
            <div
              className={`confidence__bar confidence__bar--${tone ?? 'grey'}`}
              style={{ width: `${data.classification.confidence}%` }}
            />
          </div>
        </div>
        {detailsOpen && hasDetails && (
          <div className="stack stack--compact">
            {data.classification.description && <p className="muted small card__body">{data.classification.description}</p>}
            {data.signals.length > 0 && (
              <div className="stack stack--compact" aria-label="Sinais de classificação">
                <span className="muted small strong">Sinais de classificação</span>
                <p className="muted small">Trechos da transcrição que classificam a reunião:</p>
                <ul className="bullets bullets--plain">
                  {data.signals.map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {hasDetails && (
          <button className="topic__toggle" type="button" aria-expanded={String(detailsOpen)} onClick={() => setDetailsOpen((v) => !v)}>
            <Icon name={detailsOpen ? 'collapse' : 'expand'} />
            {detailsOpen ? 'Ocultar detalhes' : 'Ver o que levou a essa classificação'}
          </button>
        )}
      </section>

      {data.tags.length > 0 && (
        <section className="stack stack--compact" aria-label="Tags">
          <Heading>Tags</Heading>
          <div className="chips">
            {data.tags.map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
          </div>
        </section>
      )}

      <section className="stack stack--compact" aria-label="Resumo da reunião">
        <Heading>Resumo da reunião</Heading>
        <p className="ata__headline">{data.title}</p>
        <p className="ata__summary">{data.summary}</p>
      </section>

      <Section title="Pontos principais" count={data.key_points.length}>
        {data.key_points.map((text, i) => (
          <AtaRow key={i} icon="bulb" tone="blue" text={text} />
        ))}
      </Section>

      <Section title="Decisões" count={(data.decisions ?? []).length}>
        {(data.decisions ?? []).map((text, i) => (
          <AtaRow key={i} icon="check" tone="green" text={text} />
        ))}
      </Section>

      <Section title="Próximos passos" count={data.next_steps.length}>
        {data.next_steps.map((stepItem, i) => (
          <AtaStep key={i} record={record} step={stepItem} done={done} onToggle={onToggleStep} />
        ))}
      </Section>

      <Section title="Perguntas em aberto" count={(data.open_questions ?? []).length}>
        {(data.open_questions ?? []).map((text, i) => (
          <AtaRow key={i} icon="question" tone="yellow" text={text} />
        ))}
      </Section>

      <Section title="Riscos e bloqueios" count={(data.risks ?? []).length}>
        {(data.risks ?? []).map((text, i) => (
          <AtaRow key={i} icon="warn" tone="purple" text={text} />
        ))}
      </Section>
    </div>
  );
}

export function AtaInfo({ onRegenerate, onOpenList, onPost, canPost, busy, minutes, autoMinutes, now }) {
  let text;
  if (busy) {
    text = 'Gerando a ata…';
  } else if (minutes) {
    const model = modelLabel(minutes.model);
    text = `Ata gerada ${ago(minutes.generatedAt, now)}${model ? ` · ${model}` : ''}.`;
  } else if (autoMinutes) {
    text = 'A ata é gerada automaticamente quando o huddle termina.';
  } else {
    text = 'Gere a ata do huddle quando quiser.';
  }
  return (
    <div className="info info--row">
      <span className="info__text" role={busy ? 'status' : undefined}>
        {text}
      </span>
      <div className="info__actions">
        {onRegenerate && (
          <Tooltip label={busy ? 'Gerando…' : 'Gerar ata'}>
            <button className="icon-button" type="button" aria-label="Gerar ata" disabled={busy} onClick={onRegenerate}>
              <Icon name="sparkles" />
            </button>
          </Tooltip>
        )}
        {onPost && (
          <Tooltip label="Postar no thread">
            <button className="icon-button" type="button" aria-label="Postar no thread" disabled={!canPost} onClick={onPost}>
              <Icon name="plane" />
            </button>
          </Tooltip>
        )}
        <Tooltip label="Atas anteriores">
          <button className="icon-button" type="button" aria-label="Atas anteriores" onClick={onOpenList}>
            <Icon name="history" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function DriveButton({ uploaded, driveBusy, onDrive }) {
  if (driveBusy) {
    return (
      <button className="icon-button icon-button--lg" type="button" disabled aria-label="Enviando ao Google Drive">
        <span className="spinner" aria-hidden="true" />
      </button>
    );
  }
  return (
    <Tooltip label={uploaded ? 'Enviada ao Drive · reenviar' : 'Enviar ao Google Drive'}>
      <button
        className={uploaded ? 'icon-button icon-button--lg is-done' : 'icon-button icon-button--lg'}
        type="button"
        aria-label={uploaded ? 'Reenviar ao Google Drive' : 'Enviar ao Google Drive'}
        onClick={onDrive}
      >
        <Icon name="cloud" />
      </button>
    </Tooltip>
  );
}

export function AtaFooter({ record, onCopy, canPost, onPost, onDownload, uploaded, driveBusy, onDrive, flash }) {
  return (
    <footer className="footer">
      <div className="buttons">
        <button className="button button--primary" type="button" onClick={onCopy}>
          Copiar ata
        </button>
        <DriveButton uploaded={!!uploaded} driveBusy={driveBusy} onDrive={onDrive} />
        <Tooltip label="Baixar ata em Markdown (.md)">
          <button className="icon-button icon-button--lg" type="button" aria-label="Baixar ata em Markdown" onClick={onDownload}>
            <Icon name="download" />
          </button>
        </Tooltip>
      </div>
      {uploaded && (
        <a className="muted small ata__drive-link" href={uploaded.link} target="_blank" rel="noopener noreferrer">
          Ver no Google Drive
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
  return (
    <div className="ata-empty">
      <div className="idle__hero">
        <div className="idle__icon">
          <Icon name="doc" />
        </div>
        <h1>{active ? 'A ata sai quando o huddle terminar' : 'A ata deste huddle ainda não foi gerada'}</h1>
        <p>Com data, duração, classificação da reunião, tags, resumo, pontos principais e próximos passos com responsáveis.</p>
      </div>
      {error && (
        <div className="notice notice--error" role="status">
          {error}
        </div>
      )}
      <section className="checklist" aria-label="Opções da ata">
        <label className="check check--toggle">
          <span className="row__stack">
            <span className="strong">Gerar ao encerrar</span>
            <span className="muted small">Assim que a janela do huddle fechar</span>
          </span>
          <input type="checkbox" checked={autoMinutes} onChange={(e) => onToggleAuto(e.target.checked)} />
        </label>
        <div className="check">
          <span className="row__stack">
            <span className="strong">{active ? 'Até agora' : 'Neste huddle'}</span>
            <span className="muted small">
              {`${utterances} ${utterances === 1 ? 'fala' : 'falas'} · ${participants} ${participants === 1 ? 'participante' : 'participantes'}`}
            </span>
          </span>
        </div>
      </section>
      <div className="idle__footer">
        {!hasKey && <p className="muted small center">Adicione sua chave da API nas configurações para gerar a ata.</p>}
        <button className="button button--primary button--block" type="button" disabled={!canGenerate} onClick={onGenerate}>
          Gerar ata agora
        </button>
        <button className="button button--block" type="button" onClick={onOpenList}>
          Ver sessões anteriores
        </button>
      </div>
    </div>
  );
}

export function AtaLoading({ startedAt, utterances, participants, now }) {
  const elapsed = now - startedAt;
  const steps = [
    [`Lendo ${utterances} falas de ${participants} ${participants === 1 ? 'participante' : 'participantes'}`, 0],
    ['Classificando a reunião', 2500],
    ['Escrevendo resumo e próximos passos', 6000],
  ];
  const activeIndex = steps.findLastIndex(([, at]) => elapsed >= at);
  return (
    <div className="stack">
      <section className="card progress" role="status" aria-label="Progresso">
        <h1 className="card__title">Escrevendo a ata do huddle</h1>
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
        <p className="muted small">
          Costuma levar menos de um minuto. Mantenha o painel aberto até terminar; a ata fica salva.
        </p>
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

// The list part of "Sessões anteriores", styled like Slack's "Recent huddles": an icon, the
// title on one truncated line, a time·duration meta line, participant avatars and a kebab
// menu (Abrir / Carregar / Apagar). Clicking the row opens the session.
export function AtasList({ records, query, tag, onOpen, onLoad, onDelete, currentHuddleId, now }) {
  const { visible, groups } = groupSessions(records, query, tag, now);
  if (!records.length) {
    return (
      <div className="empty">
        <p>Nenhuma sessão ainda. Elas aparecem aqui ao fim de cada huddle.</p>
      </div>
    );
  }
  if (!visible.length) {
    return (
      <div className="empty">
        <p>Nenhuma sessão encontrada para esse filtro.</p>
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
              { label: 'Abrir', icon: 'open', onSelect: () => onOpen(record) },
              isCurrent
                ? { label: 'Já está no app', icon: 'check', disabled: true }
                : onLoad && { label: 'Carregar', icon: 'download', onSelect: () => onLoad(record) },
              onDelete && { label: 'Apagar', icon: 'trash', danger: true, onSelect: () => onDelete(record) },
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
                    {isCurrent && <span className="pill pill--xs">No app</span>}
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
