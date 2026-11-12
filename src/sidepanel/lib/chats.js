// Chat tabs. Pure helpers — unit-tested in Node.

// Which chat to show after closing `closingId`: the active one stays unless it is the one closed;
// then the tab before it, or the next one when it was first; null when no chat is left.
export function chatAfterClose(list, closingId, activeId) {
  if (closingId !== activeId) return activeId;
  const index = list.findIndex((c) => c.id === closingId);
  return (list[index - 1] ?? list[index + 1])?.id ?? null;
}

// A plain-text fallback title from the question, for when the model naming call fails or returns
// nothing. Keeps the first few words, strips quotes and trailing punctuation, caps the length.
// Returns null for empty input so the caller can keep the default "Chat N".
export function fallbackTitle(question) {
  const text = String(question ?? '')
    .replace(/["'“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  const short = text.split(' ').slice(0, 6).join(' ').replace(/[.!?…,:;]+$/, '');
  return short ? short.slice(0, 40) : null;
}
