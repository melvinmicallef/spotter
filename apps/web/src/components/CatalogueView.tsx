import { useState } from 'react';

import type { Exercise, Muscle } from '@spotter/shared';

import { api } from '../api.js';

interface CatalogueViewProps {
  online: boolean;
  muscles: Muscle[];
  exercises: Exercise[];
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}

export function CatalogueView(props: CatalogueViewProps) {
  const [muscleName, setMuscleName] = useState('');
  const [exerciseName, setExerciseName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await props.onRefresh();
    } catch (error) {
      props.onError(
        error instanceof Error ? error.message : 'Catalogue update failed',
      );
    }
  }

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">ONLINE LIBRARY</span>
          <h2>Catalogue</h2>
        </div>
      </div>
      {!props.online && (
        <p className="notice">
          Catalogue changes need a connection. Cached exercises remain available
          in workouts.
        </p>
      )}
      <div className="split-grid">
        <div>
          <h3>Muscles</h3>
          <fieldset disabled={!props.online}>
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!muscleName.trim()) return;
                void run(async () => {
                  await api.createMuscle({ name: muscleName });
                  setMuscleName('');
                });
              }}
            >
              <input
                aria-label="New muscle name"
                placeholder="e.g. Hamstrings"
                value={muscleName}
                onChange={(event) => setMuscleName(event.target.value)}
              />
              <button type="submit">Add</button>
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
        </div>
        <div>
          <h3>Exercises</h3>
          <fieldset disabled={!props.online}>
            <form
              className="form-card"
              onSubmit={(event) => {
                event.preventDefault();
                if (!exerciseName.trim()) return;
                void run(async () => {
                  await api.createExercise({
                    name: exerciseName,
                    instructions: instructions.trim() || null,
                    muscles: selectedMuscles.map((muscleId) => ({
                      muscleId,
                      role: 'primary',
                    })),
                  });
                  setExerciseName('');
                  setInstructions('');
                  setSelectedMuscles([]);
                });
              }}
            >
              <input
                aria-label="New exercise name"
                placeholder="Exercise name"
                value={exerciseName}
                onChange={(event) => setExerciseName(event.target.value)}
              />
              <textarea
                aria-label="Exercise instructions"
                placeholder="Instructions (optional)"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
              />
              <MuscleChecks
                muscles={props.muscles}
                selected={selectedMuscles}
                onChange={setSelectedMuscles}
              />
              <button type="submit">Create exercise</button>
            </form>
            <div className="stack tight">
              {props.exercises.map((exercise) => (
                <ExerciseCard
                  key={`${exercise.id}-${exercise.updatedAt}`}
                  exercise={exercise}
                  muscles={props.muscles}
                  run={run}
                />
              ))}
            </div>
          </fieldset>
        </div>
      </div>
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

function ExerciseCard({
  exercise,
  muscles,
  run,
}: {
  exercise: Exercise;
  muscles: Muscle[];
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(exercise.name);
  const [instructions, setInstructions] = useState(exercise.instructions ?? '');
  const [selected, setSelected] = useState(
    exercise.muscles.map((muscle) => muscle.id),
  );
  return (
    <article className="form-card">
      <input
        aria-label={`${exercise.name} name`}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <textarea
        aria-label={`${exercise.name} instructions`}
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
      />
      <MuscleChecks
        muscles={muscles}
        selected={selected}
        onChange={setSelected}
      />
      <div className="inline-actions">
        <button
          type="button"
          onClick={() =>
            void run(() =>
              api.updateExercise(exercise.id, {
                name,
                instructions: instructions.trim() || null,
                muscles: selected.map((muscleId) => ({
                  muscleId,
                  role: 'primary',
                })),
              }),
            )
          }
        >
          Save
        </button>
        <button
          className="secondary danger-text"
          type="button"
          onClick={() => void run(() => api.deleteExercise(exercise.id))}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

function MuscleChecks({
  muscles,
  selected,
  onChange,
}: {
  muscles: Muscle[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="check-grid">
      {muscles.map((muscle) => (
        <label key={muscle.id}>
          <input
            type="checkbox"
            checked={selected.includes(muscle.id)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, muscle.id]
                  : selected.filter((id) => id !== muscle.id),
              )
            }
          />
          {muscle.name}
        </label>
      ))}
    </div>
  );
}
