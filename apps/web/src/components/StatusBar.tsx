interface StatusBarProps {
  online: boolean;
  pending: number;
  syncing: boolean;
  syncError: string | null;
  syncErrorDetails?: unknown;
  onRetry: () => void;
}

export function StatusBar({
  online,
  pending,
  syncing,
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
      {online && (
        <button
          className="sync-button"
          type="button"
          onClick={onRetry}
          disabled={syncing}
          aria-label={syncing ? 'Syncing' : 'Sync now'}
          title={syncing ? 'Syncing' : 'Sync now'}
        >
          <svg
            className={syncing ? 'sync-icon spinning' : 'sync-icon'}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M20 7v5h-5M4 17v-5h5" />
            <path d="M5.6 9a7 7 0 0 1 11.7-2L20 12M4 12l2.7 5a7 7 0 0 0 11.7-2" />
          </svg>
        </button>
      )}
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
