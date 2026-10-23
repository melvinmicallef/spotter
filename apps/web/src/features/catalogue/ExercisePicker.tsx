import { useEffect, useMemo, useRef, useState } from 'react';

import type { Exercise } from '@spotter/shared';
import {
  exerciseMuscleSummary,
  muscleDisplayName,
} from '../../shared/exercise-muscles.js';

export function ExercisePicker({
  contextLabel,
  exercises,
  getAddedCount,
  onAdd,
  onClose,
  selectionMode = 'multiple',
}: {
  contextLabel: string;
  exercises: Exercise[];
  getAddedCount: (exerciseId: string) => number;
  onAdd: (exercise: Exercise) => void;
  onClose: () => void;
  selectionMode?: 'single' | 'multiple';
}) {
  const selectionMade = useRef(false);
  const [nameFilter, setNameFilter] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('');
  const muscles = useMemo(() => {
    const unique = new Map<string, string>();
    for (const exercise of exercises) {
      for (const muscle of exercise.muscles)
        unique.set(muscle.id, muscleDisplayName(muscle));
    }
    return [...unique.entries()].sort((left, right) =>
      left[1].localeCompare(right[1]),
    );
  }, [exercises]);
  const visibleExercises = exercises.filter(
    (exercise) =>
      exercise.name
        .toLocaleLowerCase()
        .includes(nameFilter.toLocaleLowerCase()) &&
      (!muscleFilter ||
        exercise.muscles.some((muscle) => muscle.id === muscleFilter)),
  );

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="exercise-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-picker-title"
      >
        <header>
          <div>
            <span className="eyebrow">ADD TO {contextLabel.toUpperCase()}</span>
            <h2 id="exercise-picker-title">Choose exercises</h2>
          </div>
          {selectionMode === 'multiple' ? (
            <button
              className="secondary exercise-picker-done"
              type="button"
              onClick={onClose}
            >
              Done
            </button>
          ) : (
            <button
              className="icon-button exercise-picker-close"
              type="button"
              aria-label="Close exercise picker"
              onClick={onClose}
            >
              ×
            </button>
          )}
        </header>
        <div className="exercise-picker-filters">
          <label className="field">
            Filter by name
            <input
              autoComplete="off"
              autoFocus
              type="search"
              value={nameFilter}
              onChange={(event) => setNameFilter(event.target.value)}
              placeholder="Search exercises"
            />
          </label>
          <label className="field">
            Filter by muscle
            <select
              autoComplete="off"
              value={muscleFilter}
              onChange={(event) => setMuscleFilter(event.target.value)}
            >
              <option value="">All muscles</option>
              {muscles.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="picker-result-count">
          {visibleExercises.length} exercise
          {visibleExercises.length === 1 ? '' : 's'}
        </p>
        <div className="exercise-picker-grid">
          {visibleExercises.map((exercise) => {
            const timesAdded = getAddedCount(exercise.id);
            return (
              <article className="exercise-picker-card" key={exercise.id}>
                {exercise.media ? (
                  <img
                    src={exercise.media.url}
                    alt={`${exercise.name} demonstration`}
                  />
                ) : (
                  <div
                    className="exercise-picker-placeholder"
                    aria-hidden="true"
                  >
                    No image
                  </div>
                )}
                <div className="exercise-picker-details">
                  <div>
                    <strong>{exercise.name}</strong>
                    <small className="type-badge">
                      {exercise.exerciseType}
                    </small>
                  </div>
                  <small>{exerciseMuscleSummary(exercise)}</small>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectionMode === 'single') {
                        if (selectionMade.current) return;
                        selectionMade.current = true;
                        onAdd(exercise);
                        onClose();
                      } else onAdd(exercise);
                    }}
                  >
                    {timesAdded > 0
                      ? `Add again (${timesAdded} added)`
                      : `Add to ${contextLabel}`}
                  </button>
                </div>
              </article>
            );
          })}
          {visibleExercises.length === 0 && (
            <p className="empty-state">No exercises match these filters.</p>
          )}
        </div>
      </section>
    </div>
  );
}
