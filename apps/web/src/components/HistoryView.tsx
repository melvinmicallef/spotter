import { useState } from 'react';
import type { Workout } from '@spotter/shared';

import { ConfirmDialog } from './ConfirmDialog.js';
import { weekdayName } from '../weekdays.js';

interface HistoryViewProps {
  workouts: Workout[];
  online: boolean;
  onDeleteWorkout: (workout: Workout) => void;
}

export function HistoryView({
  workouts,
  online,
  onDeleteWorkout,
}: HistoryViewProps) {
  const [workoutToDelete, setWorkoutToDelete] = useState<Workout | null>(null);

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
          const templateName = workoutTemplateName(workout);
          const workoutDate = formatWorkoutDate(workout.startedAt);
          return (
            <article className="history-card history-entry" key={workout.id}>
              <details className="history-details">
                <summary>
                  <div>
                    <strong>{workoutDate}</strong>
                    <small>{templateName}</small>
                  </div>
                  <div className="history-stats">
                    <span>{workout.exercises.length} exercises</span>
                  </div>
                </summary>
                <div className="history-body">
                  {workout.notes && <p>{workout.notes}</p>}
                  {workout.exercises.map((exercise) => (
                    <section key={exercise.id} className="history-exercise">
                      <h3>
                        {exercise.exerciseName}{' '}
                        <small className="type-badge">
                          {exercise.exerciseType}
                        </small>
                      </h3>
                      {exercise.notes && <p>{exercise.notes}</p>}
                      <ol>
                        {exercise.sets.map((set) => (
                          <li key={set.id}>
                            <span>
                              {exercise.exerciseType === 'cardio'
                                ? formatCardioEffort(set)
                                : formatStrengthSet(set)}
                            </span>
                            {set.notes && <small>{set.notes}</small>}
                          </li>
                        ))}
                      </ol>
                    </section>
                  ))}
                </div>
              </details>
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

function formatStrengthSet(set: Workout['exercises'][number]['sets'][number]) {
  const load =
    set.weight == null ? 'Bodyweight' : `${set.weight} ${set.weightUnit}`;
  return `${load}${set.reps == null ? '' : ` × ${set.reps} reps`}`;
}

function formatCardioEffort(set: Workout['exercises'][number]['sets'][number]) {
  const measurements = [
    set.durationSeconds == null
      ? null
      : `${formatDuration(set.durationSeconds)}`,
    set.distance == null ? null : `${set.distance} ${set.distanceUnit}`,
  ].filter(Boolean);
  return measurements.length > 0 ? measurements.join(' · ') : 'No result';
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (remainingSeconds > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${minutes} min`;
}
