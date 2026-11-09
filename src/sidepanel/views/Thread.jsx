import { ago } from '../lib/format.js';
import { useT } from '../lib/i18n.js';
import { Icon } from '../ui/Icon.jsx';

// The strip above the insights that says whether the huddle's Slack thread is being read and
// whether the AI may use it. `status` comes from threadStatus(): live | stale | empty | off.
export function ThreadBar({ status, count, readAt, now, onOpen, onToggleContext }) {
  const t = useT();
  const detail = {
    live: t('thread.live', { count, ago: readAt ? ago(readAt, now) : '' }),
    stale: count ? t('thread.stale', { ago: readAt ? ago(readAt, now) : '' }) : t('thread.staleEmpty'),
    empty: t('thread.empty'),
    off: t('thread.off'),
  }[status];
  return (
    <div className={`threadbar threadbar--${status}`} role="status">
      <Icon name="chat" />
      <span className="threadbar__title">{t('thread.title')}</span>
      <span className="threadbar__detail">{detail}</span>
      {status === 'live' && <span className="threadbar__badge">{t('thread.inContext')}</span>}
      <span className="threadbar__spacer" />
      {status === 'stale' && (
        <button className="button button--small button--primary" type="button" onClick={onOpen}>
          {t('thread.open')}
        </button>
      )}
      {status === 'off' ? (
        <button className="button button--small" type="button" onClick={() => onToggleContext(true)}>
          {t('thread.include')}
        </button>
      ) : (
        <button className="button button--small threadbar__exclude" type="button" onClick={() => onToggleContext(false)}>
          {t('thread.exclude')}
        </button>
      )}
    </div>
  );
}
