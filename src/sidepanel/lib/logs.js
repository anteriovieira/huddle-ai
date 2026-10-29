import { formatTime } from './format.js';

export const LEVEL_LABELS = { debug: 'debug', info: 'info', warn: 'aviso', error: 'erro' };

export function logEntryAsText(entry) {
  const data = entry.data == null ? '' : ` ${JSON.stringify(entry.data)}`;
  return `${formatTime(entry.at)} [${entry.level}] ${entry.source}: ${entry.message}${data}`;
}

export function logsAsText(logs) {
  return logs.map(logEntryAsText).join('\n');
}
