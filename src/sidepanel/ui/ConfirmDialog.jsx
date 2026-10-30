import { useEffect, useRef } from 'react';
import { Icon } from './Icon.jsx';

// A small centered confirmation dialog over a dim backdrop. Discreet alternative to the
// full-width danger banner. Escape or a backdrop click cancels; the confirm button is focused.
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel = 'Cancelar', tone = 'danger', icon = 'trash', onConfirm, onCancel }) {
  const confirmRef = useRef(null);

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
            {cancelLabel}
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
