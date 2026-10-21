import { useEffect, useState } from 'react';

import { registerSW } from 'virtual:pwa-register';

export function PwaUpdate() {
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    const apply = registerSW({
      immediate: true,
      onNeedRefresh: () => setUpdate(() => () => apply(true)),
      onOfflineReady: () => setOfflineReady(true),
    });
  }, []);

  if (!update && !offlineReady) return null;
  return (
    <div className="update-banner" role="status">
      <span>
        {update ? 'An update is ready.' : 'Spotter is ready offline.'}
      </span>
      {update && (
        <button type="button" onClick={() => void update()}>
          Update now
        </button>
      )}
      <button
        className="icon-button"
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setUpdate(null);
          setOfflineReady(false);
        }}
      >
        ×
      </button>
    </div>
  );
}
