import type {
  DayOfWeek,
  Exercise,
  Workout,
  WorkoutSet,
  WorkoutTemplate,
} from '@spotter/shared';

import { todayDayOfWeek, weekdayName, WEEKDAYS } from '../weekdays.js';

interface WorkoutViewProps {
  workout?: Workout;
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  onStart: (template: WorkoutTemplate, dayOfWeek: DayOfWeek) => void;
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
    const today = todayDayOfWeek();
    const hasScheduledDays = templates.some((template) =>
      template.exercises.some(() => true),
    );
    return (
      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">TODAY · {weekdayName(today)}</span>
            <h2>Start a scheduled workout</h2>
          </div>
        </div>
        {!hasScheduledDays && (
          <p className="empty-state">
            Create a weekly template and add exercises to a day before starting
            a workout.
          </p>
        )}
        <div className="grid cards-grid">
          {templates.map((template) => {
            const scheduledDays = WEEKDAYS.filter((day) =>
              template.exercises.some(
                (exercise) => exercise.dayOfWeek === day.value,
              ),
            );
            if (scheduledDays.length === 0) return null;
            return (
              <article className="card workout-template-card" key={template.id}>
                <div>
                  <strong>{template.name}</strong>
                  <small>
                    {template.exercises.length} exercises across{' '}
                    {scheduledDays.length} days
                  </small>
                </div>
                <div className="day-start-actions">
                  {scheduledDays.map((day) => {
                    const count = template.exercises.filter(
                      (entry) => entry.dayOfWeek === day.value,
                    ).length;
                    return (
                      <button
                        className={
                          day.value === today ? 'primary' : 'secondary'
                        }
                        type="button"
                        key={day.value}
                        onClick={() => onStart(template, day.value)}
                      >
                        Start {day.label} ({count})
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
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
          <option value="">Choose from exercises…</option>
          {exercises.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.name} ({exercise.exerciseType})
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
                <small className="type-badge">{entry.exerciseType}</small>
              </div>
              <div className="inline-actions">
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Move ${entry.exerciseName} up`}
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
                  aria-label={`Move ${entry.exerciseName} down`}
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
                  aria-label={`Remove ${entry.exerciseName}`}
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
            <TargetSummary exercise={entry} />
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

            {entry.exerciseType === 'cardio' ? (
              <CardioEfforts
                entry={entry}
                onChange={onChange}
                actions={actions}
              />
            ) : (
              <StrengthSets
                entry={entry}
                onChange={onChange}
                actions={actions}
              />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

type WorkoutEntry = Workout['exercises'][number];
type WorkoutActions = WorkoutViewProps['actions'];

function TargetSummary({ exercise }: { exercise: WorkoutEntry }) {
  if (exercise.exerciseType === 'cardio') {
    const minutes = exercise.targetDurationSeconds
      ? exercise.targetDurationSeconds / 60
      : null;
    if (minutes == null && exercise.targetDistance == null) return null;
    return (
      <p className="target-summary">
        Target:{' '}
        {[
          minutes == null ? null : `${minutes} min`,
          exercise.targetDistance == null
            ? null
            : `${exercise.targetDistance} ${exercise.targetDistanceUnit}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    );
  }
  if (exercise.targetSets == null && exercise.targetReps == null) return null;
  return (
    <p className="target-summary">
      Target: {exercise.targetSets ?? '—'} sets × {exercise.targetReps ?? '—'}{' '}
      reps
    </p>
  );
}

function StrengthSets({
  entry,
  onChange,
  actions,
}: {
  entry: WorkoutEntry;
  onChange: WorkoutViewProps['onChange'];
  actions: WorkoutActions;
}) {
  return (
    <>
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
                aria-label={`${entry.exerciseName} weight set ${setIndex + 1}`}
                inputMode="decimal"
                type="number"
                min="0"
                value={set.weight ?? ''}
                onChange={(event) =>
                  updateEffort(onChange, actions, entry.id, set.id, {
                    weight:
                      event.target.value === ''
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
              <select
                aria-label={`${entry.exerciseName} weight unit set ${setIndex + 1}`}
                value={set.weightUnit}
                onChange={(event) =>
                  updateEffort(onChange, actions, entry.id, set.id, {
                    weightUnit: event.target.value as WorkoutSet['weightUnit'],
                  })
                }
              >
                <option value="kg">kg</option>
                <option value="lb">lb</option>
              </select>
            </div>
            <input
              aria-label={`${entry.exerciseName} repetitions set ${setIndex + 1}`}
              inputMode="numeric"
              type="number"
              min="0"
              value={set.reps ?? ''}
              onChange={(event) =>
                updateEffort(onChange, actions, entry.id, set.id, {
                  reps:
                    event.target.value === ''
                      ? null
                      : Number(event.target.value),
                })
              }
            />
            <CompleteControl
              label={`${entry.exerciseName} set ${setIndex + 1} complete`}
              checked={set.completed}
              onChange={(completed) =>
                updateEffort(onChange, actions, entry.id, set.id, { completed })
              }
            />
            <RemoveEffort
              label={`Remove ${entry.exerciseName} set ${setIndex + 1}`}
              onClick={() =>
                onChange((current) =>
                  actions.removeSet(current, entry.id, set.id),
                )
              }
            />
          </div>
          <EffortNotes
            label={`${entry.exerciseName} set ${setIndex + 1} notes`}
            value={set.notes}
            onChange={(notes) =>
              updateEffort(onChange, actions, entry.id, set.id, { notes })
            }
          />
        </div>
      ))}
      <AddEffort
        label="+ Add set"
        entry={entry}
        onChange={onChange}
        actions={actions}
      />
    </>
  );
}

function CardioEfforts({
  entry,
  onChange,
  actions,
}: {
  entry: WorkoutEntry;
  onChange: WorkoutViewProps['onChange'];
  actions: WorkoutActions;
}) {
  return (
    <>
      <div className="set-head cardio-head">
        <span>Effort</span>
        <span>Minutes</span>
        <span>Distance</span>
        <span>Done</span>
        <span />
      </div>
      {entry.sets.map((effort, effortIndex) => (
        <div className="set-group" key={effort.id}>
          <div className="set-row">
            <strong>{effortIndex + 1}</strong>
            <input
              aria-label={`${entry.exerciseName} duration minutes effort ${effortIndex + 1}`}
              inputMode="decimal"
              type="number"
              min="0"
              step="0.1"
              value={
                effort.durationSeconds == null
                  ? ''
                  : effort.durationSeconds / 60
              }
              onChange={(event) =>
                updateEffort(onChange, actions, entry.id, effort.id, {
                  durationSeconds:
                    event.target.value === ''
                      ? null
                      : Math.round(Number(event.target.value) * 60),
                })
              }
            />
            <div className="number-unit">
              <input
                aria-label={`${entry.exerciseName} distance effort ${effortIndex + 1}`}
                inputMode="decimal"
                type="number"
                min="0"
                step="0.01"
                value={effort.distance ?? ''}
                onChange={(event) =>
                  updateEffort(onChange, actions, entry.id, effort.id, {
                    distance:
                      event.target.value === ''
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
              <select
                aria-label={`${entry.exerciseName} distance unit effort ${effortIndex + 1}`}
                value={effort.distanceUnit}
                onChange={(event) =>
                  updateEffort(onChange, actions, entry.id, effort.id, {
                    distanceUnit: event.target
                      .value as WorkoutSet['distanceUnit'],
                  })
                }
              >
                <option value="km">km</option>
                <option value="mi">mi</option>
              </select>
            </div>
            <CompleteControl
              label={`${entry.exerciseName} effort ${effortIndex + 1} complete`}
              checked={effort.completed}
              onChange={(completed) =>
                updateEffort(onChange, actions, entry.id, effort.id, {
                  completed,
                })
              }
            />
            <RemoveEffort
              label={`Remove ${entry.exerciseName} effort ${effortIndex + 1}`}
              onClick={() =>
                onChange((current) =>
                  actions.removeSet(current, entry.id, effort.id),
                )
              }
            />
          </div>
          <EffortNotes
            label={`${entry.exerciseName} effort ${effortIndex + 1} notes`}
            value={effort.notes}
            onChange={(notes) =>
              updateEffort(onChange, actions, entry.id, effort.id, { notes })
            }
          />
        </div>
      ))}
      <AddEffort
        label="+ Add effort"
        entry={entry}
        onChange={onChange}
        actions={actions}
      />
    </>
  );
}

function updateEffort(
  onChange: WorkoutViewProps['onChange'],
  actions: WorkoutActions,
  exerciseId: string,
  effortId: string,
  patch: Partial<WorkoutSet>,
) {
  onChange((current) =>
    actions.updateSet(current, exerciseId, effortId, patch),
  );
}

function CompleteControl({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <input
      aria-label={label}
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

function RemoveEffort({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="icon-button danger-text"
      type="button"
      aria-label={label}
      onClick={onClick}
    >
      ×
    </button>
  );
}

function EffortNotes({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (notes: string | null) => void;
}) {
  return (
    <label className="set-notes">
      <span className="sr-only">{label}</span>
      <input
        aria-label={label}
        placeholder="Notes"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
      />
    </label>
  );
}

function AddEffort({
  label,
  entry,
  onChange,
  actions,
}: {
  label: string;
  entry: WorkoutEntry;
  onChange: WorkoutViewProps['onChange'];
  actions: WorkoutActions;
}) {
  return (
    <button
      className="secondary full"
      type="button"
      onClick={() => onChange((current) => actions.addSet(current, entry.id))}
    >
      {label}
    </button>
  );
}
