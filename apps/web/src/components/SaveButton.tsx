import type { ComponentProps } from 'react';

export function SaveButton({
  pending,
  pendingLabel = 'Saving…',
  disabled,
  children,
  ...props
}: ComponentProps<'button'> & {
  pending: boolean;
  pendingLabel?: string;
}) {
  return (
    <button
      type="submit"
      {...props}
      disabled={disabled || pending}
      aria-busy={pending}
      aria-label={pending ? pendingLabel : props['aria-label']}
    >
      {pending ? (
        <span className="save-button-progress" role="status">
          <svg className="save-spinner" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 7v5h-5M20 12a8 8 0 1 0-2.3 5.7" />
          </svg>
          {pendingLabel}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
