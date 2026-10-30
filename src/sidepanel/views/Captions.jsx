import { useLayoutEffect, useRef, useState } from 'react';
import { formatClock } from '../lib/format.js';
import { Avatar } from '../ui/primitives.jsx';

const MARK_LABELS = { action: 'Ação', decision: 'Decisão', question: 'Pergunta' };

// Área rolável das legendas com acompanhamento ao vivo: enquanto o scroll está
// no fim, novas falas rolam junto; ao subir, o auto-scroll pausa e aparece o
// botão para voltar ao vivo. Funciona em qualquer largura (1, 2 ou 3 colunas),
// porque é dona do próprio contêiner de scroll.
export function CaptionsPanel({ utterances, huddle, marks }) {
  const scrollRef = useRef(null);
  const [follow, setFollow] = useState(true);

  useLayoutEffect(() => {
    if (!follow) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [utterances.length, follow]);

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

  return (
    <div className="captions-pane">
      <div className="captions-scroll" ref={scrollRef} onScroll={onScroll}>
        <CaptionsView utterances={utterances} huddle={huddle} marks={marks} />
      </div>
      {huddle.active && utterances.length > 0 && (
        <button
          className={follow ? 'follow' : 'follow follow--paused'}
          type="button"
          aria-pressed={String(follow)}
          onClick={backToLive}
        >
          <span className="dot" />
          {follow ? 'Seguindo ao vivo' : 'Voltar ao vivo'}
        </button>
      )}
    </div>
  );
}

export function CaptionsView({ utterances, huddle, marks }) {
  if (!utterances.length) {
    return (
      <div className="empty">
        <p>Nenhuma fala ainda. As legendas aparecem aqui enquanto as pessoas falam.</p>
      </div>
    );
  }
  const markMap = new Map((marks ?? []).map((mark) => [mark.line, mark.kind]));
  const lastIndex = utterances.length - 1;
  return (
    <ol className="captions" aria-label="Legendas">
      {utterances.map((u, index) => {
        const mark = markMap.get(index + 1);
        const live = huddle.active && index === lastIndex;
        return (
          <li key={u.id ?? index} className={live ? 'caption caption--live' : 'caption'}>
            <Avatar name={u.speaker} />
            <div className="caption__body">
              <div className="caption__meta">
                <span className="caption__name">{u.speaker}</span>
                <span className={live ? 'accent small strong' : 'muted small'}>{live ? 'agora' : formatClock(u.at)}</span>
              </div>
              <p className="caption__text">{u.text}</p>
              {mark && <span className={`tag tag--${mark}`}>{`${MARK_LABELS[mark]} detectada`}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
