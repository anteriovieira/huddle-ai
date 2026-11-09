// Screenshot-only replacement for src/sidepanel/lib/format.js. The app ships Portuguese relative
// times ("há 3 min") and pt-BR dates even in English mode; for the English store screenshots we
// re-export everything from the real module and override just the two helpers that render visible
// date/time strings, so the captured UI reads fully in English.
export * from '../../../src/sidepanel/lib/format.js';

// "12s ago" / "3 min ago" / "2 h ago".
export function ago(timestamp, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

// "Nov 5, 2026, 11:09 AM".
export function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}
