import type {
  Exercise,
  Workout,
  WorkoutSet,
  WorkoutTemplate,
} from '@spotter/shared';

interface WorkoutViewProps {
  workout?: Workout;
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  onStart: (template?: WorkoutTemplate) => void;
  onChange: (update: (workout: Workout) => Workout) => void;
  actions: {
    addExercise: (workout: Workout, exercise: Exercise) => Workout;
    removeExercise: (workout: Workout, id: string) => Workout;
    moveExercise: (
      workout: Workout,
      index: number,
      direction: -1 | 1,
    ) => Workout;
    addSet: (workout: Workout, id: string) => Workout;
    removeSet: (workout: Workout, exerciseId: string, setId: string) => Workout;
    updateSet: (
      workout: Workout,
      exerciseId: string,
      setId: string,
      patch: Partial<WorkoutSet>,
    ) => Workout;
    updateWorkoutNotes: (workout: Workout, notes: string | null) => Workout;
    updateExerciseNotes: (
      workout: Workout,
      exerciseId: string,
      notes: string | null,
    ) => Workout;
    finish: (workout: Workout) => Workout;
  };
}

export function WorkoutView({
  workout,
  exercises,
  templates,
  onStart,
  onChange,
  actions,
}: WorkoutViewProps) {
  if (!workout) {
    return (
      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">TODAY</span>
            <h2>Start a workout</h2>
          </div>
        </div>
        <button
          className="primary large"
          type="button"
          onClick={() => onStart()}
        >
          Start an open workout
        </button>
        <div className="grid cards-grid">
          {templates.map((template) => (
            <article className="card" key={template.id}>
              <div>
                <strong>{template.name}</strong>
                <small>{template.exercises.length} exercises</small>
              </div>
              <button type="button" onClick={() => onStart(template)}>
                Start
              </button>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">IN PROGRESS</span>
          <h2>{workout.name}</h2>
        </div>
        <button
          className="danger"
          type="button"
          onClick={() => onChange(actions.finish)}
        >
          Finish
        </button>
      </div>

      <label className="field">
        Session notes
        <textarea
          value={workout.notes ?? ''}
          placeholder="How did this session feel?"
          onChange={(event) => {
            const notes = event.target.value || null;
            onChange((current) => actions.updateWorkoutNotes(current, notes));
          }}
        />
      </label>

      <label className="field compact">
        Add exercise
        <select
          value=""
          onChange={(event) => {
            const exercise = exercises.find(
              (item) => item.id === event.target.value,
            );
            if (exercise)
              onChange((current) => actions.addExercise(current, exercise));
          }}
        >
          <option value="">Choose from catalogue…</option>
          {exercises.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.name}
            </option>
          ))}
        </select>
      </label>

      <div className="stack">
        {workout.exercises.map((entry, exerciseIndex) => (
          <article className="workout-card" key={entry.id}>
            <header>
              <div>
                <span className="exercise-index">{exerciseIndex + 1}</span>
                <strong>{entry.exerciseName}</strong>
              </div>
              <div className="inline-actions">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Move up"
                  onClick={() =>
                    onChange((current) =>
                      actions.moveExercise(current, exerciseIndex, -1),
                    )
                  }
                >
                  ↑
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Move down"
                  onClick={() =>
                    onChange((current) =>
                      actions.moveExercise(current, exerciseIndex, 1),
                    )
                  }
                >
                  ↓
                </button>
                <button
                  className="icon-button danger-text"
                  type="button"
                  aria-label="Remove exercise"
                  onClick={() =>
                    onChange((current) =>
                      actions.removeExercise(current, entry.id),
                    )
                  }
                >
                  ×
                </button>
              </div>
            </header>
            <label className="field compact">
              Exercise notes
              <textarea
                value={entry.notes ?? ''}
                placeholder={`Notes for ${entry.exerciseName}`}
                onChange={(event) => {
                  const notes = event.target.value || null;
                  onChange((current) =>
                    actions.updateExerciseNotes(current, entry.id, notes),
                  );
                }}
              />
            </label>
            <div className="set-head">
              <span>Set</span>
              <span>kg / lb</span>
              <span>Reps</span>
              <span>Done</span>
              <span />
            </div>
            {entry.sets.map((set, setIndex) => (
              <div className="set-group" key={set.id}>
                <div className="set-row">
                  <strong>{setIndex + 1}</strong>
                  <div className="number-unit">
                    <input
                      aria-label="Weight"
                      inputMode="decimal"
                      type="number"
                      min="0"
                      value={set.weight ?? ''}
                      onChange={(event) =>
                        onChange((current) =>
                          actions.updateSet(current, entry.id, set.id, {
                            weight:
                              event.target.value === ''
                                ? null
                                : Number(event.target.value),
                          }),
                        )
                      }
                    />
                    <select
                      aria-label="Weight unit"
                      value={set.weightUnit}
                      onChange={(event) =>
                        onChange((current) =>
                          actions.updateSet(current, entry.id, set.id, {
                            weightUnit: event.target
                              .value as WorkoutSet['weightUnit'],
                          }),
                        )
                      }
                    >
                      <option value="kg">kg</option>
                      <option value="lb">lb</option>
                    </select>
                  </div>
                  <input
                    aria-label="Repetitions"
                    inputMode="numeric"
                    type="number"
                    min="0"
                    value={set.reps ?? ''}
                    onChange={(event) =>
                      onChange((current) =>
                        actions.updateSet(current, entry.id, set.id, {
                          reps:
                            event.target.value === ''
                              ? null
                              : Number(event.target.value),
                        }),
                      )
                    }
                  />
                  <input
                    aria-label="Set complete"
                    type="checkbox"
                    checked={set.completed}
                    onChange={(event) =>
                      onChange((current) =>
                        actions.updateSet(current, entry.id, set.id, {
                          completed: event.target.checked,
                        }),
                      )
                    }
                  />
                  <button
                    className="icon-button danger-text"
                    type="button"
                    aria-label="Remove set"
                    onClick={() =>
                      onChange((current) =>
                        actions.removeSet(current, entry.id, set.id),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
                <label className="set-notes">
                  <span className="sr-only">Set {setIndex + 1} notes</span>
                  <input
                    aria-label={`Set ${setIndex + 1} notes`}
                    placeholder="Set notes"
                    value={set.notes ?? ''}
                    onChange={(event) => {
                      const notes = event.target.value || null;
                      onChange((current) =>
                        actions.updateSet(current, entry.id, set.id, { notes }),
                      );
                    }}
                  />
                </label>
              </div>
            ))}
            <button
              className="secondary full"
              type="button"
              onClick={() =>
                onChange((current) => actions.addSet(current, entry.id))
              }
            >
              + Add set
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
