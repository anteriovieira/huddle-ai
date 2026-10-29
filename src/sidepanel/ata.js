// The "Ata" (meeting minutes): metadata computed from the huddle, text exports and views.

import { avatar, h, icon } from './dom.js';
import { MODELS } from './insights.js';

const CATEGORY_TONES = {
  Planejamento: 'blue',
  Daily: 'green',
  Alinhamento: 'yellow',
  Vendas: 'purple',
  Suporte: 'blue',
  Retrospectiva: 'yellow',
};

// "Huddle in general" -> "Slack · #general"; "Huddle with Ana" -> "Slack · DM com Ana".
function sourceFromTitle(title) {
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

export function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  const day = date.toLocaleDateString('pt-BR');
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${day} às ${time}`;
}

export function formatDuration(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${minutes / 60} h`;
}

function modelLabel(id) {
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

function metaCell(label, value) {
  return h('div', { class: 'meta-grid__cell' }, h('dt', null, label), h('dd', null, value));
}

function chip(text, tone) {
  return h('span', { class: tone ? `chip chip--${tone}` : 'chip' }, text);
}

function heading(text) {
  return h('h2', { class: 'section__title' }, text);
}

// The full minutes. `ctx.done` remembers ticked next steps; `ctx.onCopy` copies the minutes.
export function ataContent(record, ctx) {
  const { meta, data } = record;
  const tone = CATEGORY_TONES[data.classification.category];
  return h(
    'div',
    { class: 'stack ata' },
    h(
      'section',
      { class: 'stack stack--compact', 'aria-label': 'Informações da reunião' },
      h(
        'div',
        { class: 'section__row' },
        heading('Informações da reunião'),
        h('button', { class: 'button button--small', type: 'button', onClick: ctx.onCopy }, icon('copy'), 'Copiar ata'),
      ),
      h(
        'dl',
        { class: 'meta-grid' },
        metaCell('Data e hora', formatDateTime(meta.startedAt)),
        metaCell('Duração', formatDuration(meta.endedAt - meta.startedAt)),
        metaCell('Término', formatDateTime(meta.endedAt)),
        metaCell('Fonte', meta.source),
      ),
      meta.participants.length > 0 &&
        h(
          'div',
          { class: 'participants' },
          h('div', { class: 'participants__avatars' }, meta.participants.slice(0, 5).map((name) => avatar(name, 'sm'))),
          h('span', { class: 'small' }, meta.participants.join(', ')),
        ),
    ),
    h(
      'section',
      { class: 'card', 'aria-label': 'Classificação' },
      h(
        'div',
        { class: 'card__meta' },
        h('span', { class: 'muted strong-muted' }, 'Classificação'),
        h('span', { class: 'muted' }, 'Confiança ', h('b', { class: 'text-strong' }, `${data.classification.confidence}%`)),
      ),
      h(
        'div',
        { class: 'classification' },
        h('span', { class: `chip chip--lg ${tone ? `chip--${tone}` : ''}` }, data.classification.category),
        h(
          'div',
          { class: 'confidence', role: 'img', 'aria-label': `Confiança de ${data.classification.confidence}%` },
          h('div', { class: `confidence__bar confidence__bar--${tone ?? 'grey'}`, style: `width:${data.classification.confidence}%` }),
        ),
      ),
      h('p', { class: 'muted small card__body' }, data.classification.description),
    ),
    data.tags.length > 0 &&
      h('section', { class: 'stack stack--compact', 'aria-label': 'Tags' }, heading('Tags'), h('div', { class: 'chips' }, data.tags.map((tag) => chip(tag)))),
    data.signals.length > 0 &&
      h(
        'section',
        { class: 'stack stack--compact', 'aria-label': 'Sinais de classificação' },
        heading('Sinais de classificação'),
        h('p', { class: 'muted small' }, 'Trechos da transcrição que classificam a reunião:'),
        h('ul', { class: 'bullets bullets--plain' }, data.signals.map((text) => h('li', null, text))),
      ),
    h(
      'section',
      { class: 'stack stack--compact', 'aria-label': 'Resumo da reunião' },
      heading('Resumo da reunião'),
      h('p', { class: 'ata__headline' }, data.title),
      h('p', { class: 'ata__summary' }, data.summary),
    ),
    data.key_points.length > 0 &&
      h(
        'section',
        { class: 'stack stack--compact', 'aria-label': 'Pontos principais' },
        heading('Pontos principais'),
        h('ul', { class: 'bullets' }, data.key_points.map((text) => h('li', null, text))),
      ),
    data.next_steps.length > 0 &&
      h(
        'section',
        { class: 'stack stack--compact', 'aria-label': 'Próximos passos' },
        heading('Próximos passos'),
        data.next_steps.map((stepItem) => {
          const key = `${record.huddleId}:${stepItem.text}`;
          return h(
            'label',
            { class: 'step' },
            h('input', {
              type: 'checkbox',
              checked: ctx.done.has(key),
              onChange: (event) => (event.target.checked ? ctx.done.add(key) : ctx.done.delete(key)),
            }),
            h(
              'span',
              { class: 'row__stack step__body' },
              h('span', { class: 'step__text' }, stepItem.text),
              (stepItem.owner || stepItem.due) &&
                h(
                  'span',
                  { class: 'step__meta' },
                  stepItem.owner && avatar(stepItem.owner, 'xs'),
                  stepItem.owner && h('span', null, stepItem.owner),
                  stepItem.due && h('span', { class: 'chip chip--yellow chip--xs' }, stepItem.due),
                ),
            ),
          );
        }),
      ),
  );
}

export function ataInfo(record, ctx) {
  return h(
    'div',
    { class: 'info info--row' },
    h('span', null, `Gerada ${ctx.ago(record.generatedAt)} com ${modelLabel(record.model)}.`),
    ctx.onRegenerate && h('button', { class: 'link', type: 'button', onClick: ctx.onRegenerate }, 'Gerar de novo'),
    ctx.onRegenerate && h('span', { class: 'muted', 'aria-hidden': 'true' }, '·'),
    h('button', { class: 'link', type: 'button', onClick: ctx.onOpenList }, 'Anteriores'),
  );
}

function driveButton(ctx) {
  if (ctx.driveBusy) {
    return h(
      'button',
      { class: 'icon-button icon-button--lg', type: 'button', disabled: true, 'aria-label': 'Enviando ao Google Drive' },
      h('span', { class: 'spinner', 'aria-hidden': 'true' }),
    );
  }
  const uploaded = !!ctx.uploaded;
  return h(
    'button',
    {
      class: uploaded ? 'icon-button icon-button--lg is-done' : 'icon-button icon-button--lg',
      type: 'button',
      'aria-label': uploaded ? 'Reenviar ao Google Drive' : 'Enviar ao Google Drive',
      title: uploaded ? 'Enviada ao Drive · reenviar' : 'Enviar ao Google Drive',
      onClick: ctx.onDrive,
    },
    icon('cloud'),
  );
}

export function ataFooter(record, ctx) {
  return h(
    'footer',
    { class: 'footer' },
    h(
      'div',
      { class: 'buttons' },
      h('button', { class: 'button button--primary', type: 'button', onClick: ctx.onCopy }, 'Copiar ata'),
      h('button', { class: 'button', type: 'button', disabled: !ctx.canPost, onClick: ctx.onPost }, 'Postar no thread'),
      driveButton(ctx),
      h(
        'button',
        { class: 'icon-button icon-button--lg', type: 'button', 'aria-label': 'Baixar ata em Markdown', title: 'Baixar .md', onClick: ctx.onDownload },
        icon('download'),
      ),
    ),
    ctx.uploaded &&
      h(
        'a',
        { class: 'muted small ata__drive-link', href: ctx.uploaded.link, target: '_blank', rel: 'noopener noreferrer' },
        'Ver no Google Drive',
      ),
    ctx.flash && h('p', { class: 'muted small', role: 'status' }, ctx.flash),
  );
}

// Before the minutes exist: what the ata will contain and how it gets generated.
export function ataEmpty(ctx) {
  return h(
    'div',
    { class: 'ata-empty' },
    h(
      'div',
      { class: 'idle__hero' },
      h('div', { class: 'idle__icon' }, icon('doc')),
      h('h1', null, ctx.active ? 'A ata sai quando o huddle terminar' : 'A ata deste huddle ainda não foi gerada'),
      h(
        'p',
        null,
        'Com data, duração, classificação da reunião, tags, resumo, pontos principais e próximos passos com responsáveis.',
      ),
    ),
    ctx.error && h('div', { class: 'notice notice--error', role: 'status' }, ctx.error),
    h(
      'section',
      { class: 'checklist', 'aria-label': 'Opções da ata' },
      h(
        'label',
        { class: 'check check--toggle' },
        h(
          'span',
          { class: 'row__stack' },
          h('span', { class: 'strong' }, 'Gerar ao encerrar'),
          h('span', { class: 'muted small' }, 'Assim que a janela do huddle fechar'),
        ),
        h('input', { type: 'checkbox', checked: ctx.autoMinutes, onChange: (event) => ctx.onToggleAuto(event.target.checked) }),
      ),
      h(
        'div',
        { class: 'check' },
        h(
          'span',
          { class: 'row__stack' },
          h('span', { class: 'strong' }, ctx.active ? 'Até agora' : 'Neste huddle'),
          h(
            'span',
            { class: 'muted small' },
            `${ctx.utterances} ${ctx.utterances === 1 ? 'fala' : 'falas'} · ${ctx.participants} ${ctx.participants === 1 ? 'participante' : 'participantes'}`,
          ),
        ),
      ),
    ),
    h(
      'div',
      { class: 'idle__footer' },
      !ctx.hasKey && h('p', { class: 'muted small center' }, 'Adicione sua chave da API nas configurações para gerar a ata.'),
      h(
        'button',
        { class: 'button button--primary button--block', type: 'button', disabled: !ctx.canGenerate, onClick: ctx.onGenerate },
        'Gerar ata agora',
      ),
      h('button', { class: 'button button--block', type: 'button', onClick: ctx.onOpenList }, 'Ver sessões anteriores'),
    ),
  );
}

// While the minutes are being written. The steps follow elapsed time; the request is a single call.
export function ataLoading(ctx) {
  const elapsed = Date.now() - ctx.startedAt;
  const steps = [
    [`Lendo ${ctx.utterances} falas de ${ctx.participants} ${ctx.participants === 1 ? 'participante' : 'participantes'}`, 0],
    ['Classificando a reunião', 2500],
    ['Escrevendo resumo e próximos passos', 6000],
  ];
  const activeIndex = steps.findLastIndex(([, at]) => elapsed >= at);
  return h(
    'div',
    { class: 'stack' },
    h(
      'section',
      { class: 'card progress', role: 'status', 'aria-label': 'Progresso' },
      h('h1', { class: 'card__title' }, 'Escrevendo a ata do huddle'),
      steps.map(([label], index) =>
        h(
          'div',
          { class: 'progress__step' },
          index < activeIndex
            ? h('span', { class: 'check__mark check__mark--ok' }, icon('check'))
            : h('span', { class: 'spinner', 'aria-hidden': 'true' }),
          h('span', { class: index === activeIndex ? 'strong' : '' }, label),
        ),
      ).slice(0, activeIndex + 1),
      h('p', { class: 'muted small' }, 'Costuma levar menos de um minuto. Mantenha o painel aberto até terminar; a ata fica salva.'),
    ),
    h(
      'div',
      { class: 'skeleton', 'aria-hidden': 'true' },
      h('div', { class: 'skeleton__line', style: 'width:55%;height:14px' }),
      h('div', { class: 'skeleton__grid' }, h('div'), h('div'), h('div'), h('div')),
      h('div', { class: 'skeleton__block' }),
      h('div', { class: 'skeleton__line', style: 'width:100%' }),
      h('div', { class: 'skeleton__line', style: 'width:92%' }),
      h('div', { class: 'skeleton__line', style: 'width:70%' }),
    ),
  );
}

function groupLabel(timestamp) {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  if (timestamp >= startOfToday) return 'Hoje';
  if (timestamp >= startOfToday - 6 * 24 * 3600 * 1000) return 'Esta semana';
  return 'Anteriores';
}

function listTime(timestamp) {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (groupLabel(timestamp) === 'Hoje') return time;
  const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return `${weekday}, ${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
}

function matches(record, query) {
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

// The list part of "Sessões anteriores", re-rendered on its own as the search changes.
// onOpen shows a session's details; onLoad (optional) loads it into the app; tag filters.
export function atasList(records, query, tag, onOpen, onLoad) {
  const visible = records.filter((record) => matches(record, query) && (!tag || record.data.tags.includes(tag)));
  if (!records.length) {
    return h('div', { class: 'empty' }, h('p', null, 'Nenhuma sessão ainda. Elas aparecem aqui ao fim de cada huddle.'));
  }
  if (!visible.length) return h('div', { class: 'empty' }, h('p', null, 'Nenhuma sessão encontrada para esse filtro.'));
  const groups = new Map();
  for (const record of visible) {
    const label = groupLabel(record.meta.startedAt);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(record);
  }
  return [...groups].map(([label, items]) =>
    h(
      'section',
      { class: 'atas-group', 'aria-label': label },
      h('h2', { class: 'atas-group__title' }, label),
      items.map((record) => {
        const tone = CATEGORY_TONES[record.data.classification.category];
        const people = record.meta.participants;
        return h(
          'div',
          { class: 'ata-row' },
          h(
            'button',
            { class: 'ata-item', type: 'button', onClick: () => onOpen(record) },
            h(
              'span',
              { class: 'ata-item__meta' },
              chip(record.data.classification.category, tone),
              `${listTime(record.meta.startedAt)} · ${formatDuration(record.meta.endedAt - record.meta.startedAt)} · ${record.meta.source.replace(/^Slack · /, '')}`,
            ),
            h('span', { class: 'ata-item__title' }, record.data.title),
            h(
              'span',
              { class: 'muted small' },
              `${people.length > 2 ? `${people.length} pessoas` : people.map((p) => p.split(/\s+/)[0]).join(', ')} · ${record.data.next_steps.length} ${record.data.next_steps.length === 1 ? 'próximo passo' : 'próximos passos'}`,
            ),
            record.data.tags.length > 0 &&
              h(
                'span',
                { class: 'chips chips--tight' },
                record.data.tags.slice(0, 5).map((t) => h('span', { class: tag === t ? 'chip chip--on' : 'chip' }, t)),
              ),
          ),
          onLoad &&
            h(
              'button',
              { class: 'button button--small ata-row__load', type: 'button', onClick: () => onLoad(record) },
              icon('download'),
              'Carregar',
            ),
        );
      }),
    ),
  );
}
