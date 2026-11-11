import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n.js';
import { Icon } from '../ui/Icon.jsx';
import { Markdown } from '../ui/Markdown.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';

// What the model looked up before answering: one collapsible row per thread search, opening to
// the messages it read, so the user can see where an answer came from.
function ChatSteps({ steps }) {
  const t = useT();
  if (!steps?.length) return null;
  return (
    <div className="chat-steps">
      {steps.map((step, i) => (
        <details key={i} className="chat-step">
          <summary className="chat-step__summary">
            <span className="chat-step__label">
              {step.query ? t('chat.stepThreadSearch', { query: `“${step.query}”` }) : t('chat.stepThreadLatest')}
              {' · '}
              {step.messages.length === 1 ? t('chat.stepMessage') : t('chat.stepMessages', { count: step.messages.length })}
            </span>
            <Icon name="back" className="icon chat-step__chevron" />
          </summary>
          <ul className="chat-step__messages">
            {step.messages.map((m, j) => (
              <li key={j} className="chat-step__message">
                <span className="chat-step__meta">
                  <b>{m.author}</b> {m.time}
                </span>
                <span>{m.text}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

function ChatMessage({ message }) {
  if (message.role === 'error') {
    return <div className="chat-msg chat-msg--error">{message.text}</div>;
  }
  if (message.role === 'user') {
    if (message.context) {
      // Com contexto: um bloco (surface) com a citação em cima e a pergunta embaixo (segue o design,
      // em vez da bolha verde comum).
      return (
        <div className="chat-msg chat-msg--user">
          <div className="chat-ctxmsg">
            <span className="chat-context chat-context--quote">
              <Icon name="reply" />
              <span className="chat-context__label">{message.context}</span>
            </span>
            <p className="chat-ctxmsg__text">{message.text}</p>
          </div>
        </div>
      );
    }
    return (
      <div className="chat-msg chat-msg--user">
        <p className="chat-bubble">{message.text}</p>
      </div>
    );
  }
  return (
    <div className="chat-msg chat-msg--bot">
      <ChatSteps steps={message.steps} />
      <Markdown text={message.text} className="chat-bubble chat-bubble--md" />
    </div>
  );
}

// While a reply is in flight: the streaming answer, or — before the first token — a
// "Thinking" indicator.
function ChatPending({ streamText, streamSteps }) {
  const t = useT();
  if (streamText) {
    return (
      <div className="chat-msg chat-msg--bot">
        <ChatSteps steps={streamSteps} />
        <Markdown text={streamText} className="chat-bubble chat-bubble--md" />
      </div>
    );
  }
  return (
    <>
      {streamSteps?.length > 0 && (
        <div className="chat-msg chat-msg--bot">
          <ChatSteps steps={streamSteps} />
        </div>
      )}
      <div className="chat-thinking" role="status" aria-label={t('chat.thinking')}>
      <span className="chat-thinking__dots" aria-hidden="true">
        <span className="chat-thinking__dot" />
        <span className="chat-thinking__dot" />
        <span className="chat-thinking__dot" />
      </span>
      <span className="chat-thinking__label">{t('chat.thinking')}</span>
      </div>
    </>
  );
}

// The dock's size after the user drags its edges, remembered per browser (a convenience: losing
// it just brings back the default size).
const SIZE_KEY = 'huddle-ai:chat-size';
const MIN_WIDTH = 320;
const MIN_HEIGHT = 280;
const EDGE_GAP = 12;

function readSize() {
  try {
    const size = JSON.parse(localStorage.getItem(SIZE_KEY) ?? 'null');
    return size && typeof size === 'object' ? size : {};
  } catch {
    return {};
  }
}

function saveSize(size) {
  try {
    localStorage.setItem(SIZE_KEY, JSON.stringify(size));
  } catch {
    // private window or blocked storage: the size just isn't remembered
  }
}

const clamp = (value, min, max) => Math.round(Math.min(Math.max(value, min), Math.max(min, max)));

// Drag handles on the dock's top edge (height) and, when it floats, its left edge and top-left
// corner (width). Double-click a handle to go back to the default size.
function useDockResize(floating) {
  const [size, setSize] = useState(readSize);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const dockRef = useRef(null);

  const start = (edges) => (e) => {
    if (e.button !== 0 || !dockRef.current) return;
    e.preventDefault();
    const rect = dockRef.current.getBoundingClientRect();
    const from = { x: e.clientX, y: e.clientY, width: rect.width, height: rect.height };
    const move = (ev) => {
      const next = { ...sizeRef.current };
      if (edges.includes('top')) next.height = clamp(from.height + from.y - ev.clientY, MIN_HEIGHT, window.innerHeight - EDGE_GAP);
      if (edges.includes('left')) next.width = clamp(from.width + from.x - ev.clientX, MIN_WIDTH, window.innerWidth - 2 * EDGE_GAP);
      setSize(next);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      document.body.classList.remove('is-resizing');
      document.body.style.cursor = '';
      saveSize(sizeRef.current);
    };
    document.body.classList.add('is-resizing');
    // Keep the edge's resize cursor while the pointer runs ahead of the handle.
    document.body.style.cursor = getComputedStyle(e.currentTarget).cursor;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  };
  const reset = () => {
    setSize({});
    saveSize({});
  };
  const style = { height: size.height, width: floating ? size.width : undefined };
  return { dockRef, style, start, reset };
}

export function ChatDock({
  chats,
  activeChatId,
  activeChat,
  busy,
  draft,
  expanded,
  floating,
  streamText,
  streamSteps,
  onSelectChat,
  onCloseChat,
  onAddChat,
  onToggleExpand,
  onCloseDock,
  onDraftChange,
  onSubmit,
  onRemoveContext,
}) {
  const t = useT();
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const tabsRef = useRef(null);
  const prevCount = useRef(chats.length);
  const messages = activeChat?.messages ?? [];
  const activeTitle = chats.find((c) => c.id === activeChatId)?.title;
  const resize = useDockResize(floating);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages.length, streamText, streamSteps?.length, busy]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeChatId]);

  // Cresce o textarea conforme o texto para o usuário ver tudo que digitou
  // (a altura máxima e o scroll ficam no CSS).
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const onInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  // A new chat is added at the end: scroll the tab strip so the newest tab is visible.
  useEffect(() => {
    const el = tabsRef.current;
    if (el && chats.length > prevCount.current) el.scrollLeft = el.scrollWidth;
    prevCount.current = chats.length;
  }, [chats.length]);

  // When the active tab is (re)named, keep its — possibly now wider — label in view.
  useEffect(() => {
    tabsRef.current?.querySelector('.chattab--active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [activeTitle, activeChatId]);

  return (
    <section
      ref={resize.dockRef}
      className={['chatdock', expanded && 'chatdock--expanded', floating && 'chatdock--floating'].filter(Boolean).join(' ')}
      style={expanded ? undefined : resize.style}
      aria-label={t('chat.withMeeting')}
    >
      {!expanded && (
        <>
          <div className="chatdock__resize chatdock__resize--top" aria-hidden="true" onPointerDown={resize.start(['top'])} onDoubleClick={resize.reset} />
          {floating && (
            <>
              <div className="chatdock__resize chatdock__resize--left" aria-hidden="true" onPointerDown={resize.start(['left'])} onDoubleClick={resize.reset} />
              <div className="chatdock__resize chatdock__resize--corner" aria-hidden="true" onPointerDown={resize.start(['top', 'left'])} onDoubleClick={resize.reset} />
            </>
          )}
        </>
      )}
      <div className="chatdock__bar">
        <div className="chatdock__tabs" role="tablist" ref={tabsRef}>
          {chats.map((item) => (
            <span key={item.id} className={item.id === activeChatId ? 'chattab chattab--active' : 'chattab'}>
              <Tooltip label={item.title}>
                <button
                  className="chattab__label"
                  type="button"
                  role="tab"
                  aria-selected={String(item.id === activeChatId)}
                  onClick={() => onSelectChat(item.id)}
                >
                  {item.title}
                </button>
              </Tooltip>
              <Tooltip label={t('chat.closeConversation')}>
                <button
                  className="chattab__close"
                  type="button"
                  aria-label={t('chat.closeNamed', { title: item.title })}
                  onClick={() => onCloseChat(item.id)}
                >
                  <Icon name="close" />
                </button>
              </Tooltip>
            </span>
          ))}
        </div>
        <div className="chatdock__controls">
          <Tooltip label={t('chat.new')} side="bottom">
            <button className="chatdock__add" type="button" aria-label={t('chat.newAria')} onClick={onAddChat}>
              <Icon name="plus" />
            </button>
          </Tooltip>
          <Tooltip label={expanded ? t('chat.collapse') : t('chat.expand')} side="bottom">
            <button
              className="icon-button icon-button--sm"
              type="button"
              aria-label={expanded ? t('common.collapse') : t('common.expand')}
              onClick={onToggleExpand}
            >
              <Icon name={expanded ? 'collapse' : 'expand'} />
            </button>
          </Tooltip>
          <Tooltip label={t('chat.closeChat')} side="bottom">
            <button className="icon-button icon-button--sm" type="button" aria-label={t('chat.closeChatAria')} onClick={onCloseDock}>
              <Icon name="close" />
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="chatdock__log" ref={logRef}>
        {messages.length ? (
          <>
            {messages.map((message, i) => (
              <ChatMessage key={i} message={message} />
            ))}
            {busy && <ChatPending streamText={streamText} streamSteps={streamSteps} />}
          </>
        ) : (
          <div className="chatdock__empty">
            <p>{t('chat.emptyTitle')}</p>
            <p className="muted small">{t('chat.emptyHint')}</p>
          </div>
        )}
      </div>
      <form
        className="chatdock__input"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {activeChat?.context && (
          <div className="chat-context chat-context--chip">
            <Icon name="reply" className="icon" />
            <span className="chat-context__label">{activeChat.context.label}</span>
            <button type="button" className="chat-context__remove" aria-label={t('chat.removeContext')} onClick={onRemoveContext}>
              <Icon name="close" />
            </button>
          </div>
        )}
        <div className="chatdock__field">
          <textarea
            ref={inputRef}
            id="chat-input"
            rows={1}
            value={draft}
            autoComplete="off"
            placeholder={t('chat.placeholder')}
            aria-label={t('chat.inputAria')}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={onInputKeyDown}
          />
          <Tooltip label={t('chat.send')}>
            <button
              id="chat-send"
              className="chatdock__send"
              type="submit"
              aria-label={t('common.send')}
              disabled={busy || !draft.trim()}
            >
              <Icon name="enter" />
            </button>
          </Tooltip>
        </div>
      </form>
    </section>
  );
}
