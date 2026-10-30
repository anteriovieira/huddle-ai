import { useEffect, useLayoutEffect, useRef } from 'react';
import { Icon } from '../ui/Icon.jsx';
import { Markdown } from '../ui/Markdown.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';

function ChatMessage({ message }) {
  if (message.role === 'error') {
    return <div className="chat-msg chat-msg--error">{message.text}</div>;
  }
  if (message.role === 'user') {
    return (
      <div className="chat-msg chat-msg--user">
        <p className="chat-bubble">{message.text}</p>
      </div>
    );
  }
  return (
    <div className="chat-msg chat-msg--bot">
      <Markdown text={message.text} className="chat-bubble chat-bubble--md" />
    </div>
  );
}

// While a reply is in flight: the streaming answer, or — before the first token — a
// "Pensando" indicator.
function ChatPending({ streamText }) {
  if (streamText) {
    return (
      <div className="chat-msg chat-msg--bot">
        <Markdown text={streamText} className="chat-bubble chat-bubble--md" />
      </div>
    );
  }
  return (
    <div className="chat-thinking" role="status" aria-label="Pensando">
      <span className="chat-thinking__dots" aria-hidden="true">
        <span className="chat-thinking__dot" />
        <span className="chat-thinking__dot" />
        <span className="chat-thinking__dot" />
      </span>
      <span className="chat-thinking__label">Pensando</span>
    </div>
  );
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
  onSelectChat,
  onCloseChat,
  onAddChat,
  onToggleExpand,
  onCloseDock,
  onDraftChange,
  onSubmit,
}) {
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const tabsRef = useRef(null);
  const prevCount = useRef(chats.length);
  const messages = activeChat?.messages ?? [];
  const activeTitle = chats.find((c) => c.id === activeChatId)?.title;

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages.length, streamText, busy]);

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
      className={['chatdock', expanded && 'chatdock--expanded', floating && 'chatdock--floating'].filter(Boolean).join(' ')}
      aria-label="Chat com a reunião"
    >
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
              <Tooltip label="Fechar esta conversa">
                <button
                  className="chattab__close"
                  type="button"
                  aria-label={`Fechar ${item.title}`}
                  onClick={() => onCloseChat(item.id)}
                >
                  <Icon name="close" />
                </button>
              </Tooltip>
            </span>
          ))}
        </div>
        <div className="chatdock__controls">
          <Tooltip label="Nova conversa" side="bottom">
            <button className="chatdock__add" type="button" aria-label="Novo chat" onClick={onAddChat}>
              <Icon name="plus" />
            </button>
          </Tooltip>
          <Tooltip label={expanded ? 'Recolher o chat' : 'Expandir o chat'} side="bottom">
            <button
              className="icon-button icon-button--sm"
              type="button"
              aria-label={expanded ? 'Recolher' : 'Expandir'}
              onClick={onToggleExpand}
            >
              <Icon name={expanded ? 'collapse' : 'expand'} />
            </button>
          </Tooltip>
          <Tooltip label="Fechar o chat" side="bottom">
            <button className="icon-button icon-button--sm" type="button" aria-label="Fechar chat" onClick={onCloseDock}>
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
            {busy && <ChatPending streamText={streamText} />}
          </>
        ) : (
          <div className="chatdock__empty">
            <p>Nenhuma mensagem ainda</p>
            <p className="muted small">Pergunte sobre o que foi dito no huddle até agora.</p>
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
        <div className="chatdock__field">
          <textarea
            ref={inputRef}
            id="chat-input"
            rows={1}
            value={draft}
            autoComplete="off"
            placeholder="Faça uma pergunta rápida"
            aria-label="Pergunta para a reunião"
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={onInputKeyDown}
          />
          <Tooltip label="Enviar pergunta">
            <button
              id="chat-send"
              className="chatdock__send"
              type="submit"
              aria-label="Enviar"
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
