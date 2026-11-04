import { useLayoutEffect, useRef, useState } from 'react';
import { formatClock } from '../lib/format.js';
import { Icon } from '../ui/Icon.jsx';
import { Avatar } from '../ui/primitives.jsx';

const MARK_META = {
  action: { label: 'Ação', icon: 'bolt' },
  decision: { label: 'Decisão', icon: 'check' },
  question: { label: 'Pergunta', icon: 'question' },
};

// Área rolável das legendas com acompanhamento ao vivo: enquanto o scroll está
// no fim, novas falas rolam junto; ao subir, o auto-scroll pausa e aparece o
// botão para voltar ao vivo. Funciona em qualquer largura (1, 2 ou 3 colunas),
// porque é dona do próprio contêiner de scroll.
export function CaptionsPanel({ utterances, huddle, marks, onMarkClick, onAskAI }) {
  const scrollRef = useRef(null);
  const [follow, setFollow] = useState(true);

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

  return (
    <div className="captions-pane">
      <div className="captions-scroll" ref={scrollRef} onScroll={onScroll}>
        <CaptionsView utterances={utterances} huddle={huddle} marks={marks} onMarkClick={onMarkClick} onAskAI={onAskAI} />
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

export function CaptionsView({ utterances, huddle, marks, onMarkClick, onAskAI }) {
  if (!utterances.length) {
    return (
      <div className="captions-empty">
        <p className="captions-empty__title">Nenhuma fala ainda. As legendas aparecem aqui enquanto as pessoas falam.</p>
        <p className="captions-empty__hint muted small">
          Nada aparecendo mesmo com o huddle aberto? Veja se as legendas estão ativadas no huddle ou nas{' '}
          <a
            className="link"
            href="https://slack.com/help/articles/1500002037922-Adjust-your-huddles-preferences"
            target="_blank"
            rel="noopener noreferrer"
          >
            preferências do Slack
          </a>{' '}
          (Preferências › Áudio e vídeo).
        </p>
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
              {mark &&
                (onMarkClick ? (
                  <button
                    type="button"
                    className={`tag tag--${mark} tag--btn`}
                    title={`Ver ${MARK_META[mark].label.toLowerCase()}`}
                    onClick={() => onMarkClick(index + 1, mark)}
                  >
                    <Icon name={MARK_META[mark].icon} />
                    {`${MARK_META[mark].label} detectada`}
                  </button>
                ) : (
                  <span className={`tag tag--${mark}`}>
                    <Icon name={MARK_META[mark].icon} />
                    {`${MARK_META[mark].label} detectada`}
                  </span>
                ))}
            </div>
            {onAskAI && (
              <button
                type="button"
                className="caption__ask"
                title="Pedir mais contexto à IA"
                aria-label="Pedir mais contexto à IA sobre esta fala"
                onClick={() => onAskAI(`${u.speaker}: ${u.text}`)}
              >
                <Icon name="sparkles" />
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
