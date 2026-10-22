import { useMemo, useState } from 'react';

import type {
  DayOfWeek,
  Exercise,
  Workout,
  WorkoutSet,
  WorkoutTemplate,
} from '@spotter/shared';

import { weekdayName, WEEKDAYS } from '../weekdays.js';
import { convertDistance, convertWeight } from '../measurement-system.js';
import type { DistanceUnit, WeightUnit } from '../measurement-system.js';
import { ExerciseDetailsModal } from './CatalogueView.js';

interface WorkoutViewProps {
  workout?: Workout;
  previousWorkouts: Workout[];
  exercises: Exercise[];
  activeTemplate?: WorkoutTemplate;
  today: DayOfWeek;
  scheduledDay: DayOfWeek;
  weekKey: string;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  onStart: (template: WorkoutTemplate, dayOfWeek: DayOfWeek) => void;
  onSwapToday: (dayOfWeek: DayOfWeek) => void;
  onResetWeek: () => void;
  onShowStretching: () => void;
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
    setExerciseCompleted: (
      workout: Workout,
      exerciseId: string,
      completed: boolean,
    ) => Workout;
    finish: (workout: Workout) => Workout;
  };
}

export function WorkoutView({
  workout,
  previousWorkouts,
  exercises,
  activeTemplate,
  today,
  scheduledDay,
  weekKey,
  weightUnit,
  distanceUnit,
  onStart,
  onSwapToday,
  onResetWeek,
  onShowStretching,
  onChange,
  actions,
}: WorkoutViewProps) {
  const [exerciseDetailsId, setExerciseDetailsId] = useState<string | null>(
    null,
  );
  const exerciseDetails = exercises.find(
    (exercise) => exercise.id === exerciseDetailsId,
  );
  const previousSetsByExercise = useMemo(() => {
    const previousSets = new Map<string, WorkoutSet[]>();
    const sortedWorkouts = [...previousWorkouts]
      .filter((item) => item.status === 'completed')
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));

    for (const previousWorkout of sortedWorkouts) {
      for (const previousExercise of previousWorkout.exercises) {
        if (
          previousExercise.exerciseId &&
          !previousSets.has(previousExercise.exerciseId)
        ) {
          previousSets.set(
            previousExercise.exerciseId,
            [...previousExercise.sets].sort(
              (left, right) => left.position - right.position,
            ),
          );
        }
      }
    }

    return previousSets;
  }, [previousWorkouts]);
  const scheduledDayName = activeTemplate?.dayNames?.find(
    (dayName) => dayName.dayOfWeek === scheduledDay,
  )?.name;
  if (!workout) {
    const scheduledExercises =
      activeTemplate?.exercises.filter(
        (exercise) => exercise.dayOfWeek === scheduledDay,
      ) ?? [];
    return (
      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">TODAY · {weekdayName(today)}</span>
            <h2>Today&apos;s workout</h2>
          </div>
          <button
            className="secondary"
            type="button"
            onClick={onShowStretching}
          >
            Show stretching
          </button>
        </div>
        {!activeTemplate ? (
          <p className="empty-state">
            Create a weekly template and set it active before starting a
            workout.
          </p>
        ) : (
          <article className="card today-workout-card">
            <div>
              <span className="active-badge">Active plan</span>
              <h3>{activeTemplate.name}</h3>
              {scheduledDayName && (
                <p className="target-summary">{scheduledDayName}</p>
              )}
              {scheduledDay !== today && (
                <p className="notice compact-notice">
                  Using {weekdayName(scheduledDay)}&apos;s workout today for{' '}
                  {weekKey}.
                </p>
              )}
              <p>
                {scheduledExercises.length === 0
                  ? `${weekdayName(scheduledDay)} is a rest day.`
                  : `${scheduledExercises.length} exercise${scheduledExercises.length === 1 ? '' : 's'} scheduled from ${weekdayName(scheduledDay)}.`}
              </p>
              {scheduledExercises.length > 0 && (
                <ol className="scheduled-exercise-list">
                  {scheduledExercises.map((entry) => (
                    <li key={entry.id}>{entry.exerciseName}</li>
                  ))}
                </ol>
              )}
            </div>
            <button
              type="button"
              disabled={scheduledExercises.length === 0}
              onClick={() => onStart(activeTemplate, scheduledDay)}
            >
              Start today&apos;s workout
            </button>
            <div className="week-swap-panel">
              <strong>Swap today for this week</strong>
              <p>
                Choose another day&apos;s plan. The reusable template will not
                be changed.
              </p>
              <div className="day-swap-actions">
                {WEEKDAYS.filter((day) => day.value !== today).map((day) => {
                  const count = activeTemplate.exercises.filter(
                    (entry) => entry.dayOfWeek === day.value,
                  ).length;
                  return (
                    <button
                      className="secondary"
                      type="button"
                      key={day.value}
                      onClick={() => onSwapToday(day.value)}
                    >
                      {day.label} ({count})
                    </button>
                  );
                })}
              </div>
              {scheduledDay !== today && (
                <button
                  className="secondary danger-text"
                  type="button"
                  onClick={onResetWeek}
                >
                  Reset this week&apos;s swaps
                </button>
              )}
            </div>
          </article>
        )}
      </section>
    );
  }

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">IN PROGRESS</span>
          <h2>{workout.name}</h2>
          {workout.templateDayName && (
            <p className="target-summary">{workout.templateDayName}</p>
          )}
        </div>
        <div className="inline-actions">
          <button
            className="secondary"
            type="button"
            onClick={onShowStretching}
          >
            Show stretching
          </button>
          <button
            className="danger"
            type="button"
            onClick={() => onChange(actions.finish)}
          >
            Finish
          </button>
        </div>
      </div>

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
          <article
            className={`workout-card${entry.exerciseType !== 'cardio' ? ' workout-strength-card' : ''}${entry.completed ? ' workout-card-completed' : ''}`}
            key={entry.id}
          >
            {entry.completed ? (
              <div className="workout-completed-summary">
                <div className="workout-completed-info">
                  <span className="exercise-index">{exerciseIndex + 1}</span>
                  <strong>{entry.exerciseName}</strong>
                  <small className="type-badge">{entry.exerciseType}</small>
                  <span className="workout-completed-badge">Completed</span>
                  <span className="workout-completed-count">
                    {entry.sets.length}{' '}
                    {entry.exerciseType === 'cardio' ? 'efforts' : 'sets'}
                  </span>
                </div>
                <button
                  className="secondary workout-reopen-button"
                  type="button"
                  onClick={() =>
                    onChange((current) =>
                      actions.setExerciseCompleted(current, entry.id, false),
                    )
                  }
                  aria-label={`Reopen ${entry.exerciseName}`}
                >
                  Reopen
                </button>
              </div>
            ) : (
              <>
                <div
                  className={
                    entry.exerciseType !== 'cardio'
                      ? 'workout-strength-info'
                      : 'workout-card-main'
                  }
                >
                  <header>
                    <div>
                      <span className="exercise-index">
                        {exerciseIndex + 1}
                      </span>
                      <strong>{entry.exerciseName}</strong>
                      <small className="type-badge">{entry.exerciseType}</small>
                      {entry.referenceUrl && (
                        <a
                          className="workout-reference-link"
                          href={entry.referenceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Reference ↗
                        </a>
                      )}
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
                  <TargetSummary exercise={entry} distanceUnit={distanceUnit} />
                  <button
                    className="secondary workout-guide-button"
                    type="button"
                    disabled={
                      !exercises.some((item) => item.id === entry.exerciseId)
                    }
                    onClick={() => setExerciseDetailsId(entry.exerciseId)}
                    aria-label={`How to do ${entry.exerciseName}`}
                  >
                    How to do it
                  </button>
                  <button
                    className="secondary workout-complete-button"
                    type="button"
                    onClick={() =>
                      onChange((current) =>
                        actions.setExerciseCompleted(current, entry.id, true),
                      )
                    }
                    aria-label={`Mark ${entry.exerciseName} as completed`}
                  >
                    ✓ Mark complete
                  </button>
                </div>

                {entry.exerciseType === 'cardio' ? (
                  <CardioEfforts
                    entry={entry}
                    distanceUnit={distanceUnit}
                    onChange={onChange}
                    actions={actions}
                  />
                ) : entry.exerciseType === 'calisthenics' ? (
                  <CalisthenicsSets
                    entry={entry}
                    previousSets={
                      previousSetsByExercise.get(entry.exerciseId ?? '') ?? []
                    }
                    onChange={onChange}
                    actions={actions}
                  />
                ) : (
                  <StrengthSets
                    entry={entry}
                    previousSets={
                      previousSetsByExercise.get(entry.exerciseId ?? '') ?? []
                    }
                    weightUnit={weightUnit}
                    onChange={onChange}
                    actions={actions}
                  />
                )}
              </>
            )}
          </article>
        ))}
      </div>
      {exerciseDetails && (
        <ExerciseDetailsModal
          exercise={exerciseDetails}
          onClose={() => setExerciseDetailsId(null)}
        />
      )}
    </section>
  );
}

type WorkoutEntry = Workout['exercises'][number];
type WorkoutActions = WorkoutViewProps['actions'];

function TargetSummary({
  exercise,
  distanceUnit,
}: {
  exercise: WorkoutEntry;
  distanceUnit: DistanceUnit;
}) {
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
            : `${convertDistance(exercise.targetDistance, exercise.targetDistanceUnit, distanceUnit)} ${distanceUnit}`,
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
  previousSets,
  weightUnit,
  onChange,
  actions,
}: {
  entry: WorkoutEntry;
  previousSets: WorkoutSet[];
  weightUnit: WeightUnit;
  onChange: WorkoutViewProps['onChange'];
  actions: WorkoutActions;
}) {
  return (
    <div className="workout-strength-sets">
      <div className="strength-workout-grid-scroll">
        <div className="strength-workout-grid">
          {entry.sets.map((set, setIndex) => {
            const previousSet = previousSets[setIndex];
            return (
              <div className="strength-grid-set" key={set.id}>
                <div className="strength-grid-set-heading">
                  <span>Set {setIndex + 1}</span>
                  <RemoveEffort
                    label={`Remove ${entry.exerciseName} set ${setIndex + 1}`}
                    onClick={() =>
                      onChange((current) =>
                        actions.removeSet(current, entry.id, set.id),
                      )
                    }
                  />
                </div>
                <div className="strength-grid-cell strength-grid-weight">
                  <div className="strength-grid-number-unit">
                    <input
                      aria-label={`${entry.exerciseName} weight set ${setIndex + 1}`}
                      placeholder={
                        previousSet?.weight == null
                          ? 'Wt'
                          : String(
                              displayWeight(
                                previousSet.weight,
                                previousSet.weightUnit,
                                weightUnit,
                              ),
                            )
                      }
                      inputMode="decimal"
                      type="number"
                      min="0"
                      value={displayWeight(
                        set.weight,
                        set.weightUnit,
                        weightUnit,
                      )}
                      onChange={(event) =>
                        updateEffort(onChange, actions, entry.id, set.id, {
                          weight:
                            event.target.value === ''
                              ? null
                              : Number(event.target.value),
                          weightUnit,
                        })
                      }
                    />
                    <span className="unit-label">{weightUnit}</span>
                  </div>
                </div>
                <div className="strength-grid-cell strength-grid-reps">
                  <input
                    aria-label={`${entry.exerciseName} repetitions set ${setIndex + 1}`}
                    placeholder={
                      previousSet?.reps == null
                        ? 'Reps'
                        : String(previousSet.reps)
                    }
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
                </div>
              </div>
            );
          })}
          <div className="strength-grid-add">
            <span className="strength-grid-set-heading">Sets</span>
            <button
              className="secondary"
              type="button"
              onClick={() =>
                onChange((current) => actions.addSet(current, entry.id))
              }
            >
              + Add set
            </button>
          </div>
        </div>
      </div>
      <details className="workout-effort-notes">
        <summary>Set notes</summary>
        <div className="workout-effort-notes-list">
          {entry.sets.map((set, setIndex) => (
            <EffortNotes
              key={set.id}
              label={`${entry.exerciseName} set ${setIndex + 1} notes`}
              value={set.notes}
              onChange={(notes) =>
                updateEffort(onChange, actions, entry.id, set.id, { notes })
              }
            />
          ))}
        </div>
      </details>
    </div>
  );
}

function CalisthenicsSets({
  entry,
  previousSets,
  onChange,
  actions,
}: {
  entry: WorkoutEntry;
  previousSets: WorkoutSet[];
  onChange: WorkoutViewProps['onChange'];
  actions: WorkoutActions;
}) {
  return (
    <div className="workout-strength-sets">
      <div className="strength-workout-grid-scroll">
        <div className="strength-workout-grid">
          {entry.sets.map((set, setIndex) => {
            const previousSet = previousSets[setIndex];
            return (
              <div
                className="strength-grid-set calisthenics-grid-set"
                key={set.id}
              >
                <div className="strength-grid-set-heading">
                  <span>Set {setIndex + 1}</span>
                  <RemoveEffort
                    label={`Remove ${entry.exerciseName} set ${setIndex + 1}`}
                    onClick={() =>
                      onChange((current) =>
                        actions.removeSet(current, entry.id, set.id),
                      )
                    }
                  />
                </div>
                <div className="strength-grid-cell strength-grid-reps">
                  <input
                    aria-label={`${entry.exerciseName} repetitions set ${setIndex + 1}`}
                    placeholder={
                      previousSet?.reps == null
                        ? 'Reps'
                        : String(previousSet.reps)
                    }
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
                </div>
              </div>
            );
          })}
          <div className="strength-grid-add calisthenics-grid-add">
            <span className="strength-grid-set-heading">Sets</span>
            <button
              className="secondary"
              type="button"
              onClick={() =>
                onChange((current) => actions.addSet(current, entry.id))
              }
            >
              + Add set
            </button>
          </div>
        </div>
      </div>
      <details className="workout-effort-notes">
        <summary>Set notes</summary>
        <div className="workout-effort-notes-list">
          {entry.sets.map((set, setIndex) => (
            <EffortNotes
              key={set.id}
              label={`${entry.exerciseName} set ${setIndex + 1} notes`}
              value={set.notes}
              onChange={(notes) =>
                updateEffort(onChange, actions, entry.id, set.id, { notes })
              }
            />
          ))}
        </div>
      </details>
    </div>
  );
}

function CardioEfforts({
  entry,
  distanceUnit,
  onChange,
  actions,
}: {
  entry: WorkoutEntry;
  distanceUnit: DistanceUnit;
  onChange: WorkoutViewProps['onChange'];
  actions: WorkoutActions;
}) {
  return (
    <>
      <div className="set-head cardio-head">
        <span>Effort</span>
        <span>Minutes</span>
        <span>Distance ({distanceUnit})</span>
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
                value={
                  convertDistance(
                    effort.distance,
                    effort.distanceUnit,
                    distanceUnit,
                  ) ?? ''
                }
                onChange={(event) =>
                  updateEffort(onChange, actions, entry.id, effort.id, {
                    distance:
                      event.target.value === ''
                        ? null
                        : Number(event.target.value),
                    distanceUnit,
                  })
                }
              />
              <span className="unit-label">{distanceUnit}</span>
            </div>
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

function displayWeight(
  weight: number | null,
  recordedUnit: WorkoutSet['weightUnit'],
  displayUnit: WeightUnit,
) {
  return convertWeight(weight, recordedUnit, displayUnit) ?? '';
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
