import { useState } from 'react';
import { formatTime } from '../lib/format.js';
import { LEVEL_LABELS, logEntryAsText } from '../lib/logs.js';
import { useT } from '../lib/i18n.js';
import { Icon } from '../ui/Icon.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';

export function LogsView({ logs, onBack, onCopyAll, onCopyEntry, onClear }) {
  const t = useT();
  const eventUnit = t(logs.length === 1 ? 'unit.event.one' : 'unit.event.other');
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <>
      <header className="header">
        <button className="icon-button" type="button" aria-label={t('common.back')} onClick={onBack}>
          <Icon name="back" />
        </button>
        <h1 className="header__app">{t('logs.title')}</h1>
        <span className="muted small">{t('logs.count', { n: logs.length, unit: eventUnit })}</span>
        <Tooltip label={t('logs.copyAll')} side="bottom">
          <button className="icon-button" type="button" aria-label={t('logs.copyAll')} disabled={!logs.length} onClick={onCopyAll}>
            <Icon name="copy" />
          </button>
        </Tooltip>
      </header>
      {confirmClear && (
        <ConfirmDialog
          title={t('logs.clearTitle')}
          message={t('logs.clearMessage', { n: logs.length, unit: eventUnit })}
          confirmLabel={t('common.clear')}
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            setConfirmClear(false);
            onClear();
          }}
        />
      )}
      <main className="main main--logs" id="main">
        {logs.length ? (
          <ol className="logs" aria-label={t('logs.eventsAria')}>
            {logs.map((entry, i) => (
              <li key={i} className={`log log--${entry.level}`}>
                <div className="log__meta">
                  <span className="log__time">{formatTime(entry.at)}</span>
                  <span className={`log__level log__level--${entry.level}`}>{LEVEL_LABELS[entry.level] ?? entry.level}</span>
                  <span className="log__source">{entry.source}</span>
                  <Tooltip label={t('logs.copyEntry')}>
                    <button className="log__copy" type="button" aria-label={t('logs.copyEntry')} onClick={() => onCopyEntry(logEntryAsText(entry))}>
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
            <p>{t('logs.empty')}</p>
          </div>
        )}
      </main>
      <footer className="footer">
        <div className="buttons">
          <button className="button button--primary" type="button" disabled={!logs.length} onClick={onCopyAll}>
            {t('logs.copy')}
          </button>
          <button className="button" type="button" disabled={!logs.length} onClick={() => setConfirmClear(true)}>
            {t('common.clear')}
          </button>
        </div>
      </footer>
    </>
  );
}
