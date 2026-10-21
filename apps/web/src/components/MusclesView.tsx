import { useState } from 'react';

import type { Muscle } from '@spotter/shared';

import { api } from '../api.js';

interface MusclesViewProps {
  online: boolean;
  muscles: Muscle[];
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}

export function MusclesView(props: MusclesViewProps) {
  const [name, setName] = useState('');

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await props.onRefresh();
    } catch (error) {
      props.onError(
        error instanceof Error ? error.message : 'Muscle update failed',
      );
    }
  }

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">ONLINE LIBRARY</span>
          <h2>Muscles</h2>
        </div>
      </div>
      {!props.online && (
        <p className="notice">Muscle changes need a connection.</p>
      )}
      <fieldset disabled={!props.online}>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            void run(async () => {
              await api.createMuscle({ name });
              setName('');
            });
          }}
        >
          <input
            aria-label="New muscle name"
            placeholder="e.g. Hamstrings"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit">Add muscle</button>
        </form>
        <div className="stack tight">
          {props.muscles.map((muscle) => (
            <MuscleRow
              key={`${muscle.id}-${muscle.updatedAt}`}
              muscle={muscle}
              run={run}
            />
          ))}
        </div>
      </fieldset>
    </section>
  );
}

function MuscleRow({
  muscle,
  run,
}: {
  muscle: Muscle;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(muscle.name);
  return (
    <div className="list-row">
      <input
        aria-label={`${muscle.name} name`}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button
        className="secondary"
        type="button"
        onClick={() => void run(() => api.updateMuscle(muscle.id, { name }))}
      >
        Save
      </button>
      <button
        className="icon-button danger-text"
        type="button"
        aria-label={`Delete ${muscle.name}`}
        onClick={() => void run(() => api.deleteMuscle(muscle.id))}
      >
        ×
      </button>
    </div>
  );
}
