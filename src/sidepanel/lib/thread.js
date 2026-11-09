// The Slack thread attached to the huddle, as read from the page by the scanner. Pure helpers —
// unit-tested in Node. A message is { id, author, time, text }; `time` is Slack's own label
// ("Tuesday at 08:32"), kept as text because the thread can span days.

// Lower case, no accents, split on anything that is not a letter or digit.
function tokens(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// Messages matching `query` (by text or author), most query words matched first, thread order on
// ties, at most `limit`. An empty query means "what was said lately": the last `limit` messages.
export function searchThread(messages, query, { limit = 12 } = {}) {
  const wanted = [...new Set(tokens(query))];
  if (!wanted.length) return messages.slice(-limit);
  return messages
    .map((message, index) => {
      const words = new Set(tokens(`${message.author} ${message.text}`));
      return { message, index, score: wanted.filter((word) => words.has(word)).length };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((hit) => hit.message);
}

// "[Author · time] text", one message per line: how thread messages are shown to the model.
export function formatThread(messages) {
  return messages.map((m) => `[${[m.author, m.time].filter(Boolean).join(' · ')}] ${m.text}`).join('\n');
}

// What the panel can say about the thread: 'off' (the user left it out of the AI's context),
// 'none' (no thread read for this huddle), 'empty' (only the huddle's own message), 'stale' (Slack
// is not showing the Thread panel, so this is the last copy read) or 'live'.
export function threadStatus(thread, { enabled }) {
  if (!thread) return 'none';
  if (!enabled) return 'off';
  if (!thread.visible) return 'stale';
  return thread.messages.length ? 'live' : 'empty';
}
