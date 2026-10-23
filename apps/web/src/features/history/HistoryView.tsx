import { useState, type FormEvent } from 'react';
import type { Workout, WorkoutExercise, WorkoutSet } from '@spotter/shared';

import {
  convertDistance,
  convertWeight,
} from '../settings/measurement-system.js';
import type {
  DistanceUnit,
  WeightUnit,
} from '../settings/measurement-system.js';
import { historyRouteFromPath, pathForHistory } from '../../shared/routes.js';
import { addSet, removeSet, updateSet } from '../workouts/workout.js';
import { weekdayName } from '../../shared/weekdays.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';

interface HistoryViewProps {
  workouts: Workout[];
  online: boolean;
  routePath?: string;
  editableWorkoutIds?: ReadonlySet<string>;
  weightUnit?: WeightUnit;
  distanceUnit?: DistanceUnit;
  onNavigate?: (path: string) => void;
  onSaveWorkout?: (workout: Workout) => Promise<Workout>;
  onDeleteWorkout: (workout: Workout) => void;
}

export function HistoryView({
  workouts,
  online,
  routePath,
  editableWorkoutIds = new Set(),
  weightUnit = 'kg',
  distanceUnit = 'km',
  onNavigate = () => {},
  onSaveWorkout = async (workout) => workout,
  onDeleteWorkout,
}: HistoryViewProps) {
  const [workoutToDelete, setWorkoutToDelete] = useState<Workout | null>(null);
  const defaultRoute = workouts[0]
    ? pathForHistory({ kind: 'details', workoutId: workouts[0].id })
    : '/history';
  const route = historyRouteFromPath(routePath ?? defaultRoute);

  if (route.kind === 'details') {
    const workout = workouts.find((entry) => entry.id === route.workoutId);
    return (
      <HistoryDetailsPage
        key={route.workoutId}
        workout={workout}
        online={online}
        canEdit={editableWorkoutIds.has(route.workoutId)}
        weightUnit={weightUnit}
        distanceUnit={distanceUnit}
        onBack={() => onNavigate(pathForHistory({ kind: 'list' }))}
        onSaveWorkout={onSaveWorkout}
      />
    );
  }

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">LOGBOOK</span>
          <h2>History</h2>
        </div>
      </div>
      <div className="stack">
        {workouts.length === 0 && (
          <p className="empty-state">
            Completed workouts will appear here after your first session.
          </p>
        )}
        {workouts.map((workout) => {
          const exerciseCount = workout.exercises.length;
          const templateName = workoutTemplateName(workout);
          const workoutDate = formatWorkoutDate(workout.startedAt);
          return (
            <article
              className="card history-card history-entry"
              key={workout.id}
            >
              <button
                className="history-open-button"
                type="button"
                onClick={() =>
                  onNavigate(
                    pathForHistory({ kind: 'details', workoutId: workout.id }),
                  )
                }
              >
                <span className="history-open-copy">
                  <strong>{workoutDate}</strong>
                  <small>{templateName}</small>
                  <span className="history-exercise-names">
                    {workout.exercises.length > 0
                      ? workout.exercises
                          .map((exercise) => exercise.exerciseName)
                          .join(' · ')
                      : 'No exercises'}
                  </span>
                </span>
                <span className="history-open-meta">
                  <span>
                    {exerciseCount} exercise
                    {exerciseCount === 1 ? '' : 's'}
                  </span>
                  <span aria-hidden="true">View details ›</span>
                </span>
              </button>
              {workout.status === 'completed' && (
                <button
                  className="danger history-delete-button"
                  type="button"
                  disabled={!online}
                  title={
                    online ? 'Delete workout' : 'Connect to delete workout'
                  }
                  aria-label={`Delete workout ${templateName} from ${workoutDate}`}
                  onClick={() => setWorkoutToDelete(workout)}
                >
                  Delete
                </button>
              )}
            </article>
          );
        })}
      </div>
      {workoutToDelete && (
        <ConfirmDialog
          title="Delete workout?"
          message={`${formatWorkoutDate(workoutToDelete.startedAt)} · ${workoutTemplateName(workoutToDelete)} will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete workout"
          onCancel={() => setWorkoutToDelete(null)}
          onConfirm={() => {
            onDeleteWorkout(workoutToDelete);
            setWorkoutToDelete(null);
          }}
        />
      )}
    </section>
  );
}

function HistoryDetailsPage({
  workout,
  online,
  canEdit,
  weightUnit,
  distanceUnit,
  onBack,
  onSaveWorkout,
}: {
  workout: Workout | undefined;
  online: boolean;
  canEdit: boolean;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  onBack: () => void;
  onSaveWorkout: (workout: Workout) => Promise<Workout>;
}) {
  const [draft, setDraft] = useState<Workout | null>(null);
  const [savedWorkout, setSavedWorkout] = useState<Workout | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  if (!workout) {
    return (
      <section className="page-section">
        <button
          className="text-button back-button"
          type="button"
          onClick={onBack}
        >
          ← History
        </button>
        <p className="empty-state">
          This workout is not available on this device.
        </p>
      </section>
    );
  }

  const displayedWorkout = savedWorkout ?? workout;
  const currentWorkout = draft ?? displayedWorkout;
  const editing = draft !== null;

  function changeSet(
    exerciseId: string,
    setId: string,
    patch: Partial<WorkoutSet>,
  ) {
    setDraft((current) =>
      current ? updateSet(current, exerciseId, setId, patch) : current,
    );
  }

  function changeIntervalSettings(
    exerciseId: string,
    patch: Partial<
      Pick<
        WorkoutExercise,
        | 'intervalPrepSeconds'
        | 'intervalWorkSeconds'
        | 'intervalRestSeconds'
        | 'intervalIterations'
      >
    >,
  ) {
    setDraft((current) =>
      current
        ? {
            ...current,
            exercises: current.exercises.map((exercise) =>
              exercise.id === exerciseId ? { ...exercise, ...patch } : exercise,
            ),
          }
        : current,
    );
  }

  function changeIntervalWorkDuration(
    exerciseId: string,
    durationSeconds: number | null,
  ) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        exercises: current.exercises.map((exercise) => {
          if (exercise.id !== exerciseId) return exercise;
          const result = exercise.sets[0] ?? createIntervalResultSet();
          return {
            ...exercise,
            sets: [{ ...result, position: 0, durationSeconds }],
          };
        }),
      };
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await onSaveWorkout(normalizeIntervalResults(draft));
      setSavedWorkout(updated);
      setDraft(null);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Unable to save workout edits',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page-section history-details-page">
      <button
        className="text-button back-button"
        type="button"
        onClick={onBack}
      >
        ← History
      </button>
      <div className="section-heading">
        <div>
          <span className="eyebrow">COMPLETED WORKOUT</span>
          <h2>{workoutTemplateName(currentWorkout)}</h2>
          <p className="target-summary">
            {formatWorkoutDate(currentWorkout.startedAt)}
          </p>
        </div>
        {editing ? (
          <div className="inline-actions">
            <button
              className="secondary"
              type="button"
              disabled={saving}
              onClick={() => {
                setDraft(null);
                setSaveError(null);
              }}
            >
              Cancel
            </button>
            <button
              form="history-workout-editor"
              type="submit"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={
              !online || !canEdit || currentWorkout.status !== 'completed'
            }
            title={
              !online
                ? 'Connect to edit workout history'
                : !canEdit
                  ? 'Sync this workout before editing it'
                  : 'Edit recorded workout values'
            }
            onClick={() => {
              setDraft(currentWorkout);
              setSaveError(null);
            }}
          >
            Edit workout
          </button>
        )}
      </div>
      {!online && !editing && (
        <p className="notice">Connect to edit a completed workout.</p>
      )}
      {online && !canEdit && !editing && (
        <p className="notice">
          This workout must sync to the server before it can be edited.
        </p>
      )}
      {saveError && <p className="notice history-edit-error">{saveError}</p>}
      {editing ? (
        <form
          id="history-workout-editor"
          className="history-workout-exercises"
          onSubmit={(event) => void save(event)}
        >
          {currentWorkout.exercises.map((exercise) => {
            const interval = isIntervalCardio(exercise);
            return (
              <article
                className="card history-exercise history-edit-exercise"
                key={exercise.id}
              >
                <header>
                  <div>
                    <h3>{exercise.exerciseName}</h3>
                    <small className="type-badge">
                      {exercise.exerciseType}
                    </small>
                  </div>
                  {!interval && (
                    <span className="history-edit-count">
                      {exercise.sets.length}{' '}
                      {exercise.sets.length === 1 ? 'set' : 'sets'}
                    </span>
                  )}
                </header>
                {interval ? (
                  <IntervalHistoryEditor
                    exercise={exercise}
                    onChangeSettings={(patch) =>
                      changeIntervalSettings(exercise.id, patch)
                    }
                    onChangeWorkDuration={(durationSeconds) =>
                      changeIntervalWorkDuration(exercise.id, durationSeconds)
                    }
                  />
                ) : (
                  <>
                    <div className="history-edit-set-list">
                      {exercise.sets.map((set, setIndex) => (
                        <div
                          className={`history-edit-set ${exercise.exerciseType}-edit-set`}
                          key={set.id}
                        >
                          <strong>Set {setIndex + 1}</strong>
                          {exercise.exerciseType === 'cardio' ? (
                            <>
                              <label>
                                Duration (seconds)
                                <input
                                  inputMode="numeric"
                                  type="number"
                                  min="0"
                                  value={set.durationSeconds ?? ''}
                                  onChange={(event) =>
                                    changeSet(exercise.id, set.id, {
                                      durationSeconds: inputNumber(
                                        event.target.value,
                                      ),
                                    })
                                  }
                                />
                              </label>
                              <label>
                                Distance ({distanceUnit})
                                <input
                                  inputMode="decimal"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={
                                    convertDistance(
                                      set.distance,
                                      set.distanceUnit,
                                      distanceUnit,
                                    ) ?? ''
                                  }
                                  onChange={(event) =>
                                    changeSet(exercise.id, set.id, {
                                      distance: inputNumber(event.target.value),
                                      distanceUnit,
                                    })
                                  }
                                />
                              </label>
                            </>
                          ) : (
                            <>
                              {exercise.exerciseType === 'strength' && (
                                <label>
                                  Weight ({weightUnit})
                                  <input
                                    inputMode="decimal"
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={
                                      convertWeight(
                                        set.weight,
                                        set.weightUnit,
                                        weightUnit,
                                      ) ?? ''
                                    }
                                    onChange={(event) =>
                                      changeSet(exercise.id, set.id, {
                                        weight: inputNumber(event.target.value),
                                        weightUnit,
                                      })
                                    }
                                  />
                                </label>
                              )}
                              <label>
                                Reps
                                <input
                                  inputMode="numeric"
                                  type="number"
                                  min="0"
                                  value={set.reps ?? ''}
                                  onChange={(event) =>
                                    changeSet(exercise.id, set.id, {
                                      reps: inputNumber(event.target.value),
                                    })
                                  }
                                />
                              </label>
                            </>
                          )}
                          <button
                            className="icon-button danger-text history-remove-set"
                            type="button"
                            aria-label={`Remove ${exercise.exerciseName} set ${setIndex + 1}`}
                            onClick={() =>
                              setDraft((current) =>
                                current
                                  ? removeSet(current, exercise.id, set.id)
                                  : current,
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      className="secondary history-add-set"
                      type="button"
                      onClick={() =>
                        setDraft((current) =>
                          current ? addSet(current, exercise.id) : current,
                        )
                      }
                    >
                      + Add set
                    </button>
                  </>
                )}
              </article>
            );
          })}
        </form>
      ) : (
        <div className="history-workout-exercises">
          {currentWorkout.notes && (
            <article className="card history-exercise">
              {currentWorkout.notes}
            </article>
          )}
          {currentWorkout.exercises.map((exercise) => {
            const interval = isIntervalCardio(exercise);
            const intervalWorkSeconds = interval
              ? totalIntervalWorkSeconds(exercise.sets)
              : null;
            return (
              <article className="card history-exercise" key={exercise.id}>
                <header>
                  <h3>{exercise.exerciseName}</h3>
                  <small className="type-badge">{exercise.exerciseType}</small>
                </header>
                {exercise.notes && <p>{exercise.notes}</p>}
                {exercise.exerciseType === 'cardio' && (
                  <p className="history-cardio-target">
                    {interval
                      ? `Interval · ${exercise.intervalIterations ?? 0} rounds · Prep ${formatClock(exercise.intervalPrepSeconds ?? 0)} · Work ${formatClock(exercise.intervalWorkSeconds ?? 0)} · Rest ${formatClock(exercise.intervalRestSeconds ?? 0)}`
                      : exercise.targetDurationSeconds == null
                        ? null
                        : `Duration target · ${formatClock(exercise.targetDurationSeconds)}`}
                  </p>
                )}
                {interval ? (
                  <p className="history-interval-result">
                    Total work time ·{' '}
                    {intervalWorkSeconds == null
                      ? 'No result'
                      : formatDuration(intervalWorkSeconds)}
                  </p>
                ) : (
                  <ol>
                    {exercise.sets.map((set, index) => (
                      <li key={set.id}>
                        <span>{`Set ${index + 1} · `}</span>
                        <span>
                          {exercise.exerciseType === 'cardio'
                            ? formatCardioEffort(set)
                            : exercise.exerciseType === 'calisthenics'
                              ? formatCalisthenicsSet(set)
                              : formatStrengthSet(set)}
                        </span>
                        {set.notes && <small>{set.notes}</small>}
                      </li>
                    ))}
                  </ol>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function IntervalHistoryEditor({
  exercise,
  onChangeSettings,
  onChangeWorkDuration,
}: {
  exercise: WorkoutExercise;
  onChangeSettings: (
    patch: Partial<
      Pick<
        WorkoutExercise,
        | 'intervalPrepSeconds'
        | 'intervalWorkSeconds'
        | 'intervalRestSeconds'
        | 'intervalIterations'
      >
    >,
  ) => void;
  onChangeWorkDuration: (durationSeconds: number | null) => void;
}) {
  return (
    <div className="history-interval-editor">
      <div className="history-interval-settings">
        <strong>Interval settings</strong>
        <label>
          Prep time (seconds)
          <input
            aria-label={`${exercise.exerciseName} prep time in history`}
            inputMode="numeric"
            type="number"
            min="0"
            max={7 * 24 * 60 * 60}
            value={exercise.intervalPrepSeconds ?? 0}
            onChange={(event) =>
              onChangeSettings({
                intervalPrepSeconds: boundedInteger(
                  event.target.value,
                  0,
                  7 * 24 * 60 * 60,
                ),
              })
            }
          />
        </label>
        <label>
          Work time (seconds)
          <input
            aria-label={`${exercise.exerciseName} work time in history`}
            inputMode="numeric"
            type="number"
            min="1"
            max={7 * 24 * 60 * 60}
            value={exercise.intervalWorkSeconds ?? 30}
            onChange={(event) =>
              onChangeSettings({
                intervalWorkSeconds: boundedInteger(
                  event.target.value,
                  1,
                  7 * 24 * 60 * 60,
                ),
              })
            }
          />
        </label>
        <label>
          Rest time (seconds)
          <input
            aria-label={`${exercise.exerciseName} rest time in history`}
            inputMode="numeric"
            type="number"
            min="0"
            max={7 * 24 * 60 * 60}
            value={exercise.intervalRestSeconds ?? 30}
            onChange={(event) =>
              onChangeSettings({
                intervalRestSeconds: boundedInteger(
                  event.target.value,
                  0,
                  7 * 24 * 60 * 60,
                ),
              })
            }
          />
        </label>
        <label>
          Rounds
          <input
            aria-label={`${exercise.exerciseName} rounds in history`}
            inputMode="numeric"
            type="number"
            min="1"
            max="999"
            value={exercise.intervalIterations ?? 8}
            onChange={(event) =>
              onChangeSettings({
                intervalIterations: boundedInteger(event.target.value, 1, 999),
              })
            }
          />
        </label>
      </div>
      <label className="history-interval-work-duration">
        Total work time (seconds)
        <input
          aria-label={`${exercise.exerciseName} total work time in history`}
          inputMode="numeric"
          type="number"
          min="0"
          max={7 * 24 * 60 * 60}
          value={totalIntervalWorkSeconds(exercise.sets) ?? ''}
          onChange={(event) =>
            onChangeWorkDuration(inputIntegerOrNull(event.target.value))
          }
        />
      </label>
    </div>
  );
}

function workoutTemplateName(workout: Workout) {
  const daySuffix = workout.templateDay
    ? ` · ${weekdayName(workout.templateDay)}`
    : null;
  const templateName =
    daySuffix && workout.name.endsWith(daySuffix)
      ? workout.name.slice(0, -daySuffix.length)
      : workout.name;
  return workout.templateDayName
    ? `${templateName} · ${workout.templateDayName}`
    : templateName;
}

function formatWorkoutDate(value: string) {
  const date = new Date(value);
  const day = date.getDate();
  const weekday = new Intl.DateTimeFormat('en', { weekday: 'long' }).format(
    date,
  );
  const month = new Intl.DateTimeFormat('en', { month: 'long' }).format(date);
  return `${weekday} ${day}${ordinalSuffix(day)} ${month} ${date.getFullYear()}`;
}

function ordinalSuffix(day: number) {
  if (day % 100 >= 11 && day % 100 <= 13) return 'th';
  if (day % 10 === 1) return 'st';
  if (day % 10 === 2) return 'nd';
  if (day % 10 === 3) return 'rd';
  return 'th';
}

function formatStrengthSet(set: WorkoutSet) {
  const load =
    set.weight == null ? 'Bodyweight' : `${set.weight} ${set.weightUnit}`;
  return `${load}${set.reps == null ? '' : ` × ${set.reps} reps`}`;
}

function formatCalisthenicsSet(set: WorkoutSet) {
  return set.reps == null ? '— reps' : `${set.reps} reps`;
}

function formatCardioEffort(set: WorkoutSet) {
  const measurements = [
    set.durationSeconds == null ? null : formatDuration(set.durationSeconds),
    set.distance == null ? null : `${set.distance} ${set.distanceUnit}`,
  ].filter(Boolean);
  return measurements.length > 0 ? measurements.join(' · ') : 'No result';
}

function isIntervalCardio(exercise: WorkoutExercise) {
  return (
    exercise.exerciseType === 'cardio' && exercise.cardioMode === 'interval'
  );
}

function totalIntervalWorkSeconds(sets: WorkoutSet[]) {
  const durations = sets
    .map((set) => set.durationSeconds)
    .filter((duration): duration is number => duration != null);
  return durations.length > 0
    ? durations.reduce((total, duration) => total + duration, 0)
    : null;
}

function normalizeIntervalResults(workout: Workout): Workout {
  return {
    ...workout,
    exercises: workout.exercises.map((exercise) => {
      if (!isIntervalCardio(exercise) || exercise.sets.length === 0)
        return exercise;
      const result = exercise.sets[0]!;
      return {
        ...exercise,
        sets: [
          {
            ...result,
            position: 0,
            durationSeconds: totalIntervalWorkSeconds(exercise.sets),
            distance: null,
          },
        ],
      };
    }),
  };
}

function createIntervalResultSet(): WorkoutSet {
  return {
    id: crypto.randomUUID(),
    position: 0,
    reps: null,
    weight: null,
    weightUnit: 'kg',
    durationSeconds: null,
    distance: null,
    distanceUnit: 'km',
    notes: null,
    completed: true,
  };
}

function boundedInteger(value: string, min: number, max: number) {
  if (value === '') return min;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function inputIntegerOrNull(value: string) {
  if (value === '') return null;
  return boundedInteger(value, 0, 7 * 24 * 60 * 60);
}

function inputNumber(value: string): number | null {
  return value === '' ? null : Number(value);
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatClock(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
