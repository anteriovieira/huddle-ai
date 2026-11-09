// Chat tabs. Pure helpers — unit-tested in Node.

// Which chat to show after closing `closingId`: the active one stays unless it is the one closed;
// then the tab before it, or the next one when it was first; null when no chat is left.
export function chatAfterClose(list, closingId, activeId) {
  if (closingId !== activeId) return activeId;
  const index = list.findIndex((c) => c.id === closingId);
  return (list[index - 1] ?? list[index + 1])?.id ?? null;
}
