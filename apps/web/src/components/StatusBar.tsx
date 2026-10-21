interface StatusBarProps {
  online: boolean;
  pending: number;
  syncError: string | null;
  syncErrorDetails?: unknown;
  onRetry: () => void;
}

export function StatusBar({
  online,
  pending,
  syncError,
  syncErrorDetails,
  onRetry,
}: StatusBarProps) {
  return (
    <div
      className={`status-bar ${online ? 'online' : 'offline'}`}
      role="status"
    >
      <span className="status-dot" aria-hidden="true" />
      <span>
        {online
          ? 'Online'
          : 'Offline or server unavailable — workouts still save on this device'}
      </span>
      {pending > 0 && (
        <span>
          {pending} change{pending === 1 ? '' : 's'} waiting
        </span>
      )}
      {syncError && (
        <span className="sync-error" role="alert">
          <span>{syncError}</span>
          {syncErrorDetails != null && (
            <details className="sync-error-details">
              <summary>Error details</summary>
              <pre>{JSON.stringify(syncErrorDetails, null, 2)}</pre>
            </details>
          )}
          <button className="text-button" type="button" onClick={onRetry}>
            Retry synchronization
          </button>
        </span>
      )}
    </div>
  );
}
