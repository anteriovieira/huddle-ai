import { useEffect, useRef } from 'react';
import { useT } from '../lib/i18n.js';
import { Icon } from './Icon.jsx';
import { Tooltip } from './Tooltip.jsx';

// Shows one insight item (what was decided / asked / assigned) behind a caption badge, with the
// same actions the insights cards offer: ask the chat for details, copy, and mark as seen.
export function MarkDialog({ label, icon, tone = 'blue', text, owner, seenOn, onAsk, onCopy, onSeen, onClose }) {
  const t = useT();
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={label}>
        <div className="dialog__body">
          {icon && (
            <span className={`badge-icon badge-icon--${tone}`}>
              <Icon name={icon} />
            </span>
          )}
          <div className="row__stack">
            <span className="strong">{label}</span>
            <span className="mark-dialog__text">{text}</span>
            {owner && <span className="muted small">{owner}</span>}
          </div>
        </div>
        <div className="dialog__actions">
          <div className="info__actions">
            <Tooltip label={t('ask.detail')}>
              <button className="icon-button" type="button" aria-label={t('ask.detail')} onClick={onAsk}>
                <Icon name="sparkles" />
              </button>
            </Tooltip>
            <Tooltip label={t('common.copy')}>
              <button className="icon-button" type="button" aria-label={t('common.copy')} onClick={onCopy}>
                <Icon name="copy" />
              </button>
            </Tooltip>
            <Tooltip label={seenOn ? t('seen.seen') : t('seen.mark')}>
              <button
                className={seenOn ? 'icon-button icon-button--on' : 'icon-button'}
                type="button"
                aria-label={seenOn ? t('seen.unmarkAria') : t('seen.mark')}
                aria-pressed={String(Boolean(seenOn))}
                onClick={onSeen}
              >
                <Icon name={seenOn ? 'check-double' : 'check'} />
              </button>
            </Tooltip>
          </div>
          <button ref={closeRef} className="button button--small" type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

// A small centered confirmation dialog over a dim backdrop. Discreet alternative to the
// full-width danger banner. Escape or a backdrop click cancels; the confirm button is focused.
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel, tone = 'danger', icon = 'trash', onConfirm, onCancel }) {
  const t = useT();
  const confirmRef = useRef(null);
  const cancel = cancelLabel ?? t('common.cancel');

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={title}>
        <div className="dialog__body">
          {icon && (
            <span className={`badge-icon badge-icon--${tone}`}>
              <Icon name={icon} />
            </span>
          )}
          <div className="row__stack">
            <span className="strong">{title}</span>
            {message && <span className="muted small">{message}</span>}
          </div>
        </div>
        <div className="dialog__actions">
          <button className="button button--small" type="button" onClick={onCancel}>
            {cancel}
          </button>
          <button
            ref={confirmRef}
            className={`button button--small button--${tone}`}
            type="button"
            onClick={onConfirm}
          >
            {icon && <Icon name={icon} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
