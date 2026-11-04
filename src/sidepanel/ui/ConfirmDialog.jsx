import { useEffect, useRef } from 'react';
import { Icon } from './Icon.jsx';
import { Tooltip } from './Tooltip.jsx';

// Shows one insight item (what was decided / asked / assigned) behind a caption badge, with the
// same actions the insights cards offer: ask the chat for details, copy, and mark as seen.
export function MarkDialog({ label, icon, tone = 'blue', text, owner, seenOn, onAsk, onCopy, onSeen, onClose }) {
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
            <Tooltip label="Pedir detalhes à IA">
              <button className="icon-button" type="button" aria-label="Pedir detalhes à IA" onClick={onAsk}>
                <Icon name="sparkles" />
              </button>
            </Tooltip>
            <Tooltip label="Copiar">
              <button className="icon-button" type="button" aria-label="Copiar" onClick={onCopy}>
                <Icon name="copy" />
              </button>
            </Tooltip>
            <Tooltip label={seenOn ? 'Visto' : 'Marcar como visto'}>
              <button
                className={seenOn ? 'icon-button icon-button--on' : 'icon-button'}
                type="button"
                aria-label={seenOn ? 'Visto, clique para desmarcar' : 'Marcar como visto'}
                aria-pressed={String(Boolean(seenOn))}
                onClick={onSeen}
              >
                <Icon name={seenOn ? 'seen' : 'circle'} />
              </button>
            </Tooltip>
          </div>
          <button ref={closeRef} className="button button--small" type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

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
