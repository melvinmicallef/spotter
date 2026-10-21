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
          <article className="history-card" key={workout.id}>
            <div>
              <strong>{workout.name}</strong>
              <small>{new Date(workout.startedAt).toLocaleString()}</small>
            </div>
            <div className="history-stats">
              <span>{workout.exercises.length} exercises</span>
              <span>
                {workout.exercises.reduce(
                  (total, exercise) =>
                    total + exercise.sets.filter((set) => set.completed).length,
                  0,
                )}{' '}
                completed sets
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
