import { useEffect, useState } from 'react';

import { healthResponseSchema, versionResponseSchema } from '@spotter/shared';

export function App() {
  const [message, setMessage] = useState('Connecting to your Spotter server…');
  const [version, setVersion] = useState('0.1.0');

  useEffect(() => {
    Promise.all([
      fetch('/api/health').then(async (response) =>
        healthResponseSchema.parse(await response.json()),
      ),
      fetch('/api/version').then(async (response) =>
        versionResponseSchema.parse(await response.json()),
      ),
    ])
      .then(([, versionResponse]) => {
        setMessage('Your workout data is ready.');
        setVersion(versionResponse.version);
      })
      .catch(() =>
        setMessage(
          'The app shell is ready; the server is currently unavailable.',
        ),
      );
  }, []);

  return (
    <main className="shell">
      <header className="hero">
        <span className="eyebrow">SPOTTER · v{version}</span>
        <h1>Training that keeps up when the signal drops.</h1>
        <p>{message}</p>
      </header>
      <section className="card">
        <div>
          <span className="status-dot" aria-hidden="true" />
          <strong>Ready for your next session</strong>
        </div>
        <button type="button">Start workout</button>
      </section>
    </main>
  );
}
