import { formatClock } from '../lib/format.js';
import { Avatar } from '../ui/primitives.jsx';

const MARK_LABELS = { action: 'Ação', decision: 'Decisão', question: 'Pergunta' };

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
