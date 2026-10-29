import { useEffect, useRef } from 'react';
import { Icon } from '../ui/Icon.jsx';
import { Markdown } from '../ui/Markdown.jsx';

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
    <div className="chat-thinking">
      <Icon name="spark" className="icon chat-thinking__icon" />
      <span>Pensando</span>
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
  const messages = activeChat?.messages ?? [];

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages.length, streamText, busy]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeChatId]);

  return (
    <section className={expanded ? 'chatdock chatdock--expanded' : 'chatdock'} aria-label="Chat com a reunião">
      <div className="chatdock__bar">
        <div className="chatdock__tabs" role="tablist">
          {chats.map((item) => (
            <span key={item.id} className={item.id === activeChatId ? 'chattab chattab--active' : 'chattab'}>
              <button
                className="chattab__label"
                type="button"
                role="tab"
                aria-selected={String(item.id === activeChatId)}
                onClick={() => onSelectChat(item.id)}
              >
                {item.title}
              </button>
              <button
                className="chattab__close"
                type="button"
                aria-label={`Fechar ${item.title}`}
                onClick={() => onCloseChat(item.id)}
              >
                <Icon name="close" />
              </button>
            </span>
          ))}
          <button className="chatdock__add" type="button" aria-label="Novo chat" title="Novo chat" onClick={onAddChat}>
            <Icon name="plus" />
          </button>
        </div>
        <div className="chatdock__controls">
          <button
            className="icon-button icon-button--sm"
            type="button"
            aria-label={expanded ? 'Recolher' : 'Expandir'}
            title={expanded ? 'Recolher' : 'Expandir'}
            onClick={onToggleExpand}
          >
            <Icon name={expanded ? 'collapse' : 'expand'} />
          </button>
          <button
            className="icon-button icon-button--sm"
            type="button"
            aria-label="Fechar chat"
            title="Fechar"
            onClick={onCloseDock}
          >
            <Icon name="close" />
          </button>
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
          <input
            ref={inputRef}
            id="chat-input"
            type="text"
            value={draft}
            autoComplete="off"
            placeholder="Faça uma pergunta rápida"
            aria-label="Pergunta para a reunião"
            onChange={(e) => onDraftChange(e.target.value)}
          />
          <button
            id="chat-send"
            className="chatdock__send"
            type="submit"
            aria-label="Enviar"
            disabled={busy || !draft.trim()}
          >
            <Icon name="enter" />
          </button>
        </div>
      </form>
    </section>
  );
}
