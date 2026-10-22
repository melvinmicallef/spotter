import { useState, type FormEvent } from 'react';
import type { Workout, WorkoutSet } from '@spotter/shared';

import { convertDistance, convertWeight } from '../measurement-system.js';
import type { DistanceUnit, WeightUnit } from '../measurement-system.js';
import { historyRouteFromPath, pathForHistory } from '../routes.js';
import { addSet, removeSet, updateSet } from '../workout.js';
import { weekdayName } from '../weekdays.js';
import { ConfirmDialog } from './ConfirmDialog.js';

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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await onSaveWorkout(draft);
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
                  : 'Edit recorded sets'
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
          {currentWorkout.exercises.map((exercise) => (
            <article
              className="card history-exercise history-edit-exercise"
              key={exercise.id}
            >
              <header>
                <div>
                  <h3>{exercise.exerciseName}</h3>
                  <small className="type-badge">{exercise.exerciseType}</small>
                </div>
                <span className="history-edit-count">
                  {exercise.sets.length}{' '}
                  {exercise.sets.length === 1 ? 'set' : 'sets'}
                </span>
              </header>
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
            </article>
          ))}
        </form>
      ) : (
        <div className="history-workout-exercises">
          {currentWorkout.notes && (
            <article className="card history-exercise">
              {currentWorkout.notes}
            </article>
          )}
          {currentWorkout.exercises.map((exercise) => (
            <article className="card history-exercise" key={exercise.id}>
              <header>
                <h3>{exercise.exerciseName}</h3>
                <small className="type-badge">{exercise.exerciseType}</small>
              </header>
              {exercise.notes && <p>{exercise.notes}</p>}
              {exercise.exerciseType === 'cardio' && (
                <p className="history-cardio-target">
                  {exercise.cardioMode === 'interval'
                    ? `Interval · Prep ${formatClock(exercise.intervalPrepSeconds ?? 0)} · Work ${formatClock(exercise.intervalWorkSeconds ?? 0)} · Rest ${formatClock(exercise.intervalRestSeconds ?? 0)} × ${exercise.intervalIterations ?? 0}`
                    : exercise.targetDurationSeconds == null
                      ? null
                      : `Duration target · ${formatClock(exercise.targetDurationSeconds)}`}
                </p>
              )}
              <ol>
                {exercise.sets.map((set, index) => (
                  <li key={set.id}>
                    <span>Set {index + 1} · </span>
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
            </article>
          ))}
        </div>
      )}
    </section>
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
