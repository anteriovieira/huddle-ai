import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Avatar } from '../ui/primitives.jsx';

const WINDOW = 3; // falas visíveis
const GAP = 8; // precisa casar com o gap de .ticker no CSS
const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
const DUR = 440;

// Mostra as últimas falas com texto completo (quebra em várias linhas). Quando
// chega uma fala nova, desliza a pilha para cima — a mais antiga sai, a nova
// entra — animando posição e altura juntas, para o usuário não perder a linha
// que está lendo. Como as linhas têm alturas diferentes, medimos de verdade.
export function RecentTicker({ utterances }) {
  const recent = utterances.slice(-WINDOW);
  const [items, setItems] = useState(recent);
  const [sliding, setSliding] = useState(false);
  const [y, setY] = useState(0);
  const [height, setHeight] = useState(null); // altura travada durante o slide
  const lastId = useRef(recent.at(-1)?.id ?? null);
  const viewportRef = useRef(null);
  const rowRef = useRef(null);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }, []);

  // Reage a uma fala nova (id diferente); texto da fala atual muda sem animar.
  useLayoutEffect(() => {
    const incoming = recent.at(-1);
    const id = incoming?.id ?? null;
    if (id === lastId.current) {
      if (!sliding) setItems(recent);
      return;
    }
    lastId.current = id;
    if (!incoming) {
      setItems(recent);
      return;
    }
    const base = items.slice(-WINDOW);
    if (reduceMotion.current || base.length < WINDOW) {
      setItems(recent);
      return;
    }
    const hOld = viewportRef.current?.scrollHeight ?? 0;
    setItems([...base, incoming]); // 4 linhas durante o slide
    setHeight(hOld); // trava na altura atual para não dar salto
    setY(0);
    setSliding(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recent.at(-1)?.id]);

  // Dispara a transição no quadro seguinte, já com a linha extra posicionada.
  useLayoutEffect(() => {
    if (!sliding) return;
    const vp = viewportRef.current;
    const row = rowRef.current;
    if (!vp || !row) return;
    const topH = row.getBoundingClientRect().height + GAP; // altura da linha que sai
    const hNew = vp.scrollHeight - topH; // altura das 3 que ficam
    const raf = requestAnimationFrame(() => {
      setY(-topH);
      setHeight(hNew);
    });
    return () => cancelAnimationFrame(raf);
  }, [sliding]);

  const onEnd = (event) => {
    if (event.propertyName !== 'transform' || !sliding) return;
    setSliding(false);
    setItems((cur) => cur.slice(-WINDOW));
    setY(0);
    setHeight(null);
  };

  return (
    <div
      className="ticker-viewport"
      ref={viewportRef}
      style={{
        height: height != null ? `${height}px` : undefined,
        transition: sliding ? `height ${DUR}ms ${EASE}` : 'none',
      }}
      aria-live="polite"
      aria-label="Últimas falas"
    >
      <div
        className="ticker"
        style={{
          transform: `translateY(${y}px)`,
          transition: sliding && y !== 0 ? `transform ${DUR}ms ${EASE}` : 'none',
        }}
        onTransitionEnd={onEnd}
      >
        {items.map((u, i) => (
          <div className="ticker__item" key={u.id ?? i} ref={i === 0 ? rowRef : null}>
            <Avatar name={u.speaker} size="sm" />
            <div className="row__stack ticker__body">
              <span className="ticker__name">{u.speaker.split(/\s+/)[0]}</span>
              <span className="ticker__text">{u.text}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
