import { useEffect, useLayoutEffect, useRef } from 'react';
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
            <Icon name="search" />
            <span className="chat-step__label">
              {step.query ? t('chat.stepThreadSearch', { query: `“${step.query}”` }) : t('chat.stepThreadLatest')}
            </span>
            <span className="chat-step__count">
              {step.messages.length === 1 ? t('chat.stepMessage') : t('chat.stepMessages', { count: step.messages.length })}
            </span>
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
}) {
  const t = useT();
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const tabsRef = useRef(null);
  const prevCount = useRef(chats.length);
  const messages = activeChat?.messages ?? [];
  const activeTitle = chats.find((c) => c.id === activeChatId)?.title;

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
      className={['chatdock', expanded && 'chatdock--expanded', floating && 'chatdock--floating'].filter(Boolean).join(' ')}
      aria-label={t('chat.withMeeting')}
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
