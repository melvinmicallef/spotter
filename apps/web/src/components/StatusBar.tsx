interface StatusBarProps {
  online: boolean;
  pending: number;
  syncError: string | null;
  onRetry: () => void;
}

export function StatusBar({
  online,
  pending,
  syncError,
  onRetry,
}: StatusBarProps) {
  return (
    <div
      className={`status-bar ${online ? 'online' : 'offline'}`}
      role="status"
    >
      <span className="status-dot" aria-hidden="true" />
      <span>
        {online ? 'Online' : 'Offline — workouts still save on this device'}
      </span>
      {pending > 0 && (
        <span>
          {pending} change{pending === 1 ? '' : 's'} waiting
        </span>
      )}
      {syncError && (
        <button className="text-button" type="button" onClick={onRetry}>
          Sync failed · Retry
        </button>
      )}
    </div>
  );
}
