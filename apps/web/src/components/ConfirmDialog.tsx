import { useEffect } from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onCancel]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <header>
          <div>
            <span className="eyebrow">CONFIRM DELETION</span>
            <h2 id="confirm-dialog-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Cancel deletion"
            onClick={onCancel}
          >
            ×
          </button>
        </header>
        <p id="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          <button className="secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="danger" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
