import { useEffect, useState } from 'react';

import { registerSW } from 'virtual:pwa-register';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function PwaUpdate() {
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    const apply = registerSW({
      immediate: true,
      onNeedRefresh: () => setUpdate(() => () => apply(true)),
      onOfflineReady: () => setOfflineReady(true),
    });

    const handleInstallPrompt = (event: Event) => {
      const promptEvent = event as InstallPromptEvent;
      if (typeof promptEvent.prompt !== 'function') return;
      event.preventDefault();
      setInstallPrompt(promptEvent);
    };
    const handleInstalled = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (!update && !offlineReady && !installPrompt) return null;

  function installApp() {
    if (!installPrompt) return;
    void installPrompt
      .prompt()
      .then(() => installPrompt.userChoice)
      .catch(() => {})
      .finally(() => setInstallPrompt(null));
  }

  return (
    <div className="update-banner" role="status">
      <span>
        {update
          ? 'An update is ready.'
          : offlineReady
            ? 'Spotter is ready offline.'
            : 'Install Spotter on this device.'}
      </span>
      {installPrompt && (
        <button type="button" onClick={installApp}>
          Install
        </button>
      )}
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
          setInstallPrompt(null);
        }}
      >
        ×
      </button>
    </div>
  );
}
