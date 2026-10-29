// Pure formatting + avatar helpers. No DOM, no React — safe to unit-test in Node.

export const AVATAR_COLORS = ['#4A6FA5', '#7A4E8C', '#3E7D5E', '#9A6B2F', '#A04E5A', '#2F7F8F'];

// Elapsed milliseconds -> clock, "00:42" or "1:02:03".
export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

// Numbered transcript the model reads: "#1 [00:03] Ana: olá".
export function formatTranscript(utterances) {
  return utterances.map((u, i) => `#${i + 1} [${formatClock(u.at)}] ${u.speaker}: ${u.text}`).join('\n');
}

// A relative "há 12s / há 3 min / há 2 h" string. `now` is injectable for tests.
export function ago(timestamp, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return `há ${seconds}s`;
  if (seconds < 3600) return `há ${Math.round(seconds / 60)} min`;
  return `há ${Math.round(seconds / 3600)} h`;
}

export function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  const day = date.toLocaleDateString('pt-BR');
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${day} às ${time}`;
}

export function formatDuration(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${minutes / 60} h`;
}

export function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('pt-BR', { hour12: false });
}

export function fileStamp(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

export function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export function colorFor(name) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
