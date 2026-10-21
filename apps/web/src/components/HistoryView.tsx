import type { Workout } from '@spotter/shared';

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
                  completed sets
                </span>
              </div>
            </summary>
            <div className="history-body">
              {workout.notes && <p>{workout.notes}</p>}
              {workout.exercises.map((exercise) => (
                <section key={exercise.id} className="history-exercise">
                  <h3>{exercise.exerciseName}</h3>
                  {exercise.notes && <p>{exercise.notes}</p>}
                  <ol>
                    {exercise.sets.map((set) => (
                      <li key={set.id}>
                        <span>
                          {set.weight == null
                            ? 'Bodyweight'
                            : `${set.weight} ${set.weightUnit}`}
                          {set.reps == null ? '' : ` × ${set.reps} reps`}
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
