import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatClock } from '../lib/format.js';
import { useT } from '../lib/i18n.js';
import { Icon } from '../ui/Icon.jsx';
import { Avatar } from '../ui/primitives.jsx';

const MARK_ICON = { action: 'bolt', decision: 'check', question: 'question' };

// Acima disso a lista de legendas é virtualizada (só o que está na viewport é montado), para o
// painel não ficar pesado numa reunião longa. Abaixo, renderiza tudo (mantém a ancoragem no fim).
const VIRTUAL_THRESHOLD = 80;
const ROW_ESTIMATE = 76; // palpite de altura de uma fala antes de medir
const ROW_GAP = 18; // precisa casar com o gap de .captions no CSS
const OVERSCAN = 8; // falas extras renderizadas acima/abaixo da viewport

// Uma linha de legenda. `style`/`innerRef` só são usados pela lista virtualizada (posicionamento
// absoluto + medição de altura); na lista normal ficam de fora.
function CaptionRow({ u, line, live, mark, onMarkClick, onAskAI, style, innerRef }) {
  const t = useT();
  const markLabel = mark ? t(`mark.${mark}`) : '';
  return (
    <li ref={innerRef} className={live ? 'caption caption--live' : 'caption'} style={style}>
      <Avatar name={u.speaker} />
      <div className="caption__body">
        <div className="caption__meta">
          <span className="caption__name">{u.speaker}</span>
          <span className={live ? 'accent small strong' : 'muted small'}>{live ? t('caption.now') : formatClock(u.at)}</span>
        </div>
        <p className="caption__text">{u.text}</p>
        {mark &&
          (onMarkClick ? (
            <button
              type="button"
              className={`tag tag--${mark} tag--btn`}
              title={t('caption.viewMark', { label: markLabel.toLowerCase() })}
              onClick={() => onMarkClick(line, mark)}
            >
              <Icon name={MARK_ICON[mark]} />
              {t('caption.markDetected', { label: markLabel })}
            </button>
          ) : (
            <span className={`tag tag--${mark}`}>
              <Icon name={MARK_ICON[mark]} />
              {t('caption.markDetected', { label: markLabel })}
            </span>
          ))}
      </div>
      {onAskAI && (
        <button
          type="button"
          className="caption__ask"
          title={t('caption.askContext')}
          aria-label={t('caption.askContextAria')}
          onClick={() => onAskAI(`${u.speaker}: ${u.text}`)}
        >
          <Icon name="chat-plus" />
        </button>
      )}
    </li>
  );
}

// Maior índice i com offsets[i] <= y (busca binária sobre os offsets acumulados).
function lastAtOrBefore(offsets, y) {
  let lo = 0;
  let hi = offsets.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] <= y) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

// Menor índice i com offsets[i] > y.
function firstAfter(offsets, y) {
  let lo = 0;
  let hi = offsets.length - 1;
  let ans = offsets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] > y) {
      ans = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return ans;
}

// Lista virtualizada: mede a altura real de cada fala renderizada (as legendas quebram em várias
// linhas, então altura é variável) e cacheia por id. Posiciona só a janela visível de forma
// absoluta dentro de um contêiner com a altura total, lendo o scroll do contêiner-pai (scrollRef).
function VirtualCaptions({ utterances, huddle, markMap, onMarkClick, onAskAI, scrollRef, follow }) {
  const t = useT();
  const heights = useRef(new Map());
  const [tick, setTick] = useState(0);
  const [view, setView] = useState({ top: 0, h: 600 });
  const rafRef = useRef(0);

  const recalc = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setTick((t) => t + 1);
    });
  }, []);

  // Offsets acumulados (topo de cada fala), incluindo o gap entre linhas. Recalcula quando o número
  // de falas muda ou quando uma medição atualiza o cache (tick).
  const offsets = useMemo(() => {
    const n = utterances.length;
    const arr = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      const id = utterances[i].id ?? i;
      arr[i + 1] = arr[i] + (heights.current.get(id) ?? ROW_ESTIMATE) + ROW_GAP;
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utterances.length, tick]);
  const total = offsets[utterances.length];

  // Acompanha scroll e redimensionamento do contêiner-pai.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const sync = () => setView((v) => (v.top === el.scrollTop && v.h === el.clientHeight ? v : { top: el.scrollTop, h: el.clientHeight }));
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', sync);
      ro?.disconnect();
    };
  }, [scrollRef]);

  // Enquanto segue ao vivo, cola no fim quando a altura total muda (novas falas / medições).
  useLayoutEffect(() => {
    if (!follow) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [total, follow, scrollRef]);

  const n = utterances.length;
  const pad = OVERSCAN * ROW_ESTIMATE;
  const start = Math.max(0, lastAtOrBefore(offsets, view.top - pad));
  const end = Math.min(n, firstAfter(offsets, view.top + view.h + pad) + 1);

  const measure = (id) => (el) => {
    if (!el) return;
    const h = el.offsetHeight;
    if (h && Math.abs((heights.current.get(id) ?? ROW_ESTIMATE) - h) > 0.5) {
      heights.current.set(id, h);
      recalc();
    }
  };

  const rows = [];
  for (let i = start; i < end; i++) {
    const u = utterances[i];
    const id = u.id ?? i;
    rows.push(
      <CaptionRow
        key={id}
        u={u}
        line={i + 1}
        live={huddle.active && i === n - 1}
        mark={markMap.get(i + 1)}
        onMarkClick={onMarkClick}
        onAskAI={onAskAI}
        innerRef={measure(id)}
        style={{ position: 'absolute', top: offsets[i], left: 0, right: 0 }}
      />,
    );
  }

  return (
    <ol className="captions captions--virtual" aria-label={t('captions.ariaLabel')} style={{ height: total }}>
      {rows}
    </ol>
  );
}

// Área rolável das legendas com acompanhamento ao vivo: enquanto o scroll está
// no fim, novas falas rolam junto; ao subir, o auto-scroll pausa e aparece o
// botão para voltar ao vivo. Funciona em qualquer largura (1, 2 ou 3 colunas),
// porque é dona do próprio contêiner de scroll.
export function CaptionsPanel({ utterances, huddle, marks, onMarkClick, onAskAI }) {
  const t = useT();
  const scrollRef = useRef(null);
  const [follow, setFollow] = useState(true);
  const virtual = utterances.length > VIRTUAL_THRESHOLD;

  // A última fala cresce em texto (streaming) sem mudar a contagem; acompanhar só o length deixaria
  // o texto novo passar do fim visível e ficar atrás do badge "Seguindo ao vivo". Reagir também ao
  // tamanho da última fala mantém a linha corrente sempre no fim (acima do badge, graças ao padding).
  const lastTextLen = utterances.at(-1)?.text.length ?? 0;

  useLayoutEffect(() => {
    if (!follow) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [utterances.length, lastTextLen, follow]);

  const onScroll = (event) => {
    const el = event.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setFollow(atBottom);
  };

  const backToLive = () => {
    setFollow(true);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const markMap = useMemo(() => new Map((marks ?? []).map((mark) => [mark.line, mark.kind])), [marks]);

  return (
    <div className="captions-pane">
      <div className={virtual ? 'captions-scroll captions-scroll--virtual' : 'captions-scroll'} ref={scrollRef} onScroll={onScroll}>
        {virtual ? (
          <VirtualCaptions
            utterances={utterances}
            huddle={huddle}
            markMap={markMap}
            onMarkClick={onMarkClick}
            onAskAI={onAskAI}
            scrollRef={scrollRef}
            follow={follow}
          />
        ) : (
          <CaptionsView utterances={utterances} huddle={huddle} marks={marks} onMarkClick={onMarkClick} onAskAI={onAskAI} />
        )}
      </div>
      {huddle.active && utterances.length > 0 && (
        <button
          className={follow ? 'follow' : 'follow follow--paused'}
          type="button"
          aria-pressed={String(follow)}
          onClick={backToLive}
        >
          <span className="dot" />
          {follow ? t('captions.followingLive') : t('captions.backToLive')}
        </button>
      )}
    </div>
  );
}

export function CaptionsView({ utterances, huddle, marks, onMarkClick, onAskAI }) {
  const t = useT();
  if (!utterances.length) {
    return (
      <div className="captions-empty">
        <p className="captions-empty__title">{t('captions.emptyTitle')}</p>
        <p className="captions-empty__hint muted small">
          {t('captions.emptyHintPre')}
          <a
            className="link"
            href="https://slack.com/help/articles/1500002037922-Adjust-your-huddles-preferences"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('captions.slackPrefs')}
          </a>
          {t('captions.emptyHintPost')}
        </p>
      </div>
    );
  }
  const markMap = new Map((marks ?? []).map((mark) => [mark.line, mark.kind]));
  const lastIndex = utterances.length - 1;
  return (
    <ol className="captions" aria-label={t('captions.ariaLabel')}>
      {utterances.map((u, index) => (
        <CaptionRow
          key={u.id ?? index}
          u={u}
          line={index + 1}
          live={huddle.active && index === lastIndex}
          mark={markMap.get(index + 1)}
          onMarkClick={onMarkClick}
          onAskAI={onAskAI}
        />
      ))}
    </ol>
  );
}
