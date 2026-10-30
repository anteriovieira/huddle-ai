import { formatTime } from '../lib/format.js';
import { LEVEL_LABELS, logEntryAsText } from '../lib/logs.js';
import { Icon } from '../ui/Icon.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';

export function LogsView({ logs, onBack, onCopyAll, onCopyEntry, onClear }) {
  return (
    <>
      <header className="header">
        <button className="icon-button" type="button" aria-label="Voltar" onClick={onBack}>
          <Icon name="back" />
        </button>
        <h1 className="header__app">Logs</h1>
        <span className="muted small">{logs.length} eventos</span>
        <Tooltip label="Copiar todos os logs" side="bottom">
          <button className="icon-button" type="button" aria-label="Copiar todos os logs" disabled={!logs.length} onClick={onCopyAll}>
            <Icon name="copy" />
          </button>
        </Tooltip>
      </header>
      <main className="main main--logs" id="main">
        {logs.length ? (
          <ol className="logs" aria-label="Eventos">
            {logs.map((entry, i) => (
              <li key={i} className={`log log--${entry.level}`}>
                <div className="log__meta">
                  <span className="log__time">{formatTime(entry.at)}</span>
                  <span className={`log__level log__level--${entry.level}`}>{LEVEL_LABELS[entry.level] ?? entry.level}</span>
                  <span className="log__source">{entry.source}</span>
                  <Tooltip label="Copiar este evento">
                    <button className="log__copy" type="button" aria-label="Copiar este evento" onClick={() => onCopyEntry(logEntryAsText(entry))}>
                      <Icon name="copy" />
                    </button>
                  </Tooltip>
                </div>
                <p className="log__message">{entry.message}</p>
                {entry.data != null && <pre className="log__data">{JSON.stringify(entry.data, null, 1)}</pre>}
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty">
            <p>Nenhum evento ainda. Recarregue a aba do Slack depois de recarregar a extensão para os logs começarem.</p>
          </div>
        )}
      </main>
      <footer className="footer">
        <div className="buttons">
          <button className="button button--primary" type="button" disabled={!logs.length} onClick={onCopyAll}>
            Copiar logs
          </button>
          <button className="button" type="button" disabled={!logs.length} onClick={onClear}>
            Limpar
          </button>
        </div>
      </footer>
    </>
  );
}
