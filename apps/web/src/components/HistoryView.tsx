import type { Workout } from '@spotter/shared';

import { weekdayName } from '../weekdays.js';

export function HistoryView({ workouts }: { workouts: Workout[] }) {
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
        {workouts.map((workout) => (
          <details className="history-card history-details" key={workout.id}>
            <summary>
              <div>
                <strong>{workout.name}</strong>
                <small>{new Date(workout.startedAt).toLocaleString()}</small>
                {workout.templateDay && (
                  <small>{weekdayName(workout.templateDay)}</small>
                )}
              </div>
              <div className="history-stats">
                <span>{workout.exercises.length} exercises</span>
                <span>
                  {workout.exercises.reduce(
                    (total, exercise) =>
                      total +
                      exercise.sets.filter((set) => set.completed).length,
                    0,
                  )}{' '}
                  completed efforts
                </span>
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
                        <span>
                          {set.completed ? 'Completed' : 'Not completed'}
                        </span>
                        {set.notes && <small>{set.notes}</small>}
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
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
