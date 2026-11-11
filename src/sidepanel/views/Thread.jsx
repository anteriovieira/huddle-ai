import { ago } from '../lib/format.js';
import { useT } from '../lib/i18n.js';
import { Icon } from '../ui/Icon.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';

// One quiet line above the insights: whether the huddle's Slack thread is being read and whether
// the AI may use it. `status` comes from threadStatus(): live | stale | empty | off. The dot says
// it is in the AI's context (green: read now, yellow: last copy); actions are icon buttons.
export function ThreadBar({ status, count, readAt, now, onOpen, onToggleContext, onSummarize }) {
  const t = useT();
  const readAgo = readAt ? ago(readAt, now) : '';
  const detail = {
    live: t('thread.live', { count, ago: readAgo }),
    stale: count ? t('thread.stale', { ago: readAgo }) : t('thread.staleEmpty'),
    empty: t('thread.empty'),
    off: t('thread.off'),
  }[status];
  const inContext = status === 'live' || (status === 'stale' && count > 0);
  return (
    <div className={`threadbar threadbar--${status}`} role="status">
      <Icon name="chat" />
      <span className="threadbar__text">
        <span className="threadbar__title">{t('thread.title')}</span> · {detail}
      </span>
      {inContext && (
        <Tooltip label={t('thread.inContext')}>
          <span className="threadbar__dot" role="img" aria-label={t('thread.inContext')} tabIndex={0} />
        </Tooltip>
      )}
      {inContext && onSummarize && (
        <Tooltip label={t('thread.summarize')}>
          <button className="icon-button icon-button--sm" type="button" aria-label={t('thread.summarize')} onClick={onSummarize}>
            <Icon name="sparkles" />
          </button>
        </Tooltip>
      )}
      {status === 'stale' && (
        <Tooltip label={t('thread.open')}>
          <button className="icon-button icon-button--sm" type="button" aria-label={t('thread.open')} onClick={onOpen}>
            <Icon name="open" />
          </button>
        </Tooltip>
      )}
      <Tooltip label={status === 'off' ? t('thread.include') : t('thread.exclude')}>
        <button
          className="icon-button icon-button--sm"
          type="button"
          aria-label={status === 'off' ? t('thread.include') : t('thread.exclude')}
          aria-pressed={status !== 'off'}
          onClick={() => onToggleContext(status === 'off')}
        >
          <Icon name={status === 'off' ? 'eyeOff' : 'eye'} />
        </button>
      </Tooltip>
    </div>
  );
}
