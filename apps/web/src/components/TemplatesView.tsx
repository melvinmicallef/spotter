import { useEffect, useMemo, useState } from 'react';

import type {
  DayOfWeek,
  Exercise,
  WorkoutTemplate,
  WorkoutTemplateInput,
} from '@spotter/shared';

import { api } from '../api.js';
import { WEEKDAYS } from '../weekdays.js';

interface TemplatesViewProps {
  online: boolean;
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}

export function TemplatesView(props: TemplatesViewProps) {
  const [name, setName] = useState('');

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await props.onRefresh();
    } catch (error) {
      props.onError(
        error instanceof Error ? error.message : 'Template update failed',
      );
    }
  }

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">WEEKLY PLANS</span>
          <h2>Templates</h2>
        </div>
      </div>
      {!props.online && (
        <p className="notice">
          Template changes need a connection. Cached templates can still start
          workouts.
        </p>
      )}
      <fieldset disabled={!props.online}>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            void run(async () => {
              await api.createTemplate({
                name,
                isActive: false,
                notes: null,
                exercises: [],
              });
              setName('');
            });
          }}
        >
          <input
            aria-label="New weekly template name"
            placeholder="New weekly template name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit">Create weekly template</button>
        </form>
        <div className="stack">
          {props.templates.map((template) => (
            <TemplateCard
              key={`${template.id}-${template.updatedAt}`}
              template={template}
              exercises={props.exercises}
              run={run}
            />
          ))}
        </div>
      </fieldset>
    </section>
  );
}

function TemplateCard({
  template,
  exercises,
  run,
}: {
  template: WorkoutTemplate;
  exercises: Exercise[];
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<WorkoutTemplateInput>(() =>
    toInput(template),
  );
  const [pickerDay, setPickerDay] = useState<DayOfWeek>();

  function updateEntry(
    index: number,
    patch: Partial<WorkoutTemplateInput['exercises'][number]>,
  ) {
    setDraft({
      ...draft,
      exercises: draft.exercises.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    });
  }

  function move(day: DayOfWeek, dayIndex: number, direction: -1 | 1) {
    const dayEntries = draft.exercises
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.dayOfWeek === day);
    const destination = dayIndex + direction;
    if (destination < 0 || destination >= dayEntries.length) return;
    const sourceIndex = dayEntries[dayIndex]!.index;
    const destinationIndex = dayEntries[destination]!.index;
    const next = [...draft.exercises];
    [next[sourceIndex], next[destinationIndex]] = [
      next[destinationIndex]!,
      next[sourceIndex]!,
    ];
    setDraft({ ...draft, exercises: next });
  }

  return (
    <article className="form-card template-card">
      <div className="template-title-row">
        <input
          aria-label={`${template.name} name`}
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        {template.isActive ? (
          <span className="active-badge">Active</span>
        ) : (
          <button
            className="secondary"
            type="button"
            onClick={() =>
              void run(() =>
                api.updateTemplate(template.id, {
                  ...draft,
                  isActive: true,
                }),
              )
            }
          >
            Set active
          </button>
        )}
      </div>
      <textarea
        aria-label={`${template.name} notes`}
        placeholder="Weekly template notes"
        value={draft.notes ?? ''}
        onChange={(event) =>
          setDraft({ ...draft, notes: event.target.value || null })
        }
      />

      <div className="week-grid">
        {WEEKDAYS.map((day) => {
          const entries = draft.exercises
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => entry.dayOfWeek === day.value);
          return (
            <section className="template-day" key={day.value}>
              <header>
                <h3>{day.label}</h3>
                <small>
                  {entries.length} exercise{entries.length === 1 ? '' : 's'}
                </small>
              </header>
              <div className="stack tight">
                {entries.map(({ entry, index }, dayIndex) => {
                  const exercise = exercises.find(
                    (item) => item.id === entry.exerciseId,
                  );
                  return (
                    <div
                      className="template-entry"
                      key={entry.id ?? `${entry.exerciseId}-${index}`}
                    >
                      <div className="template-entry-heading">
                        <span>
                          <strong>{dayIndex + 1}.</strong>{' '}
                          {exercise?.name ?? 'Unavailable exercise'}
                          <small className="type-badge">
                            {exercise?.exerciseType ?? 'strength'}
                          </small>
                        </span>
                        <div className="inline-actions">
                          <button
                            className="icon-button"
                            type="button"
                            aria-label={`Move ${exercise?.name ?? 'exercise'} up on ${day.label}`}
                            onClick={() => move(day.value, dayIndex, -1)}
                          >
                            ↑
                          </button>
                          <button
                            className="icon-button"
                            type="button"
                            aria-label={`Move ${exercise?.name ?? 'exercise'} down on ${day.label}`}
                            onClick={() => move(day.value, dayIndex, 1)}
                          >
                            ↓
                          </button>
                          <button
                            className="icon-button danger-text"
                            type="button"
                            aria-label={`Remove ${exercise?.name ?? 'exercise'} from ${day.label}`}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                exercises: draft.exercises.filter(
                                  (_, entryIndex) => entryIndex !== index,
                                ),
                              })
                            }
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      {exercise?.exerciseType === 'cardio' ? (
                        <div className="target-fields">
                          <label>
                            Target minutes
                            <input
                              aria-label={`${exercise.name} target minutes on ${day.label}`}
                              type="number"
                              min="1"
                              value={
                                entry.targetDurationSeconds == null
                                  ? ''
                                  : entry.targetDurationSeconds / 60
                              }
                              onChange={(event) =>
                                updateEntry(index, {
                                  targetDurationSeconds: event.target.value
                                    ? Math.round(
                                        Number(event.target.value) * 60,
                                      )
                                    : null,
                                })
                              }
                            />
                          </label>
                          <label>
                            Target distance
                            <input
                              aria-label={`${exercise.name} target distance on ${day.label}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={entry.targetDistance ?? ''}
                              onChange={(event) =>
                                updateEntry(index, {
                                  targetDistance: event.target.value
                                    ? Number(event.target.value)
                                    : null,
                                })
                              }
                            />
                          </label>
                          <label>
                            Unit
                            <select
                              aria-label={`${exercise.name} distance unit on ${day.label}`}
                              value={entry.targetDistanceUnit}
                              onChange={(event) =>
                                updateEntry(index, {
                                  targetDistanceUnit: event.target.value as
                                    'km' | 'mi',
                                })
                              }
                            >
                              <option value="km">km</option>
                              <option value="mi">mi</option>
                            </select>
                          </label>
                        </div>
                      ) : (
                        <div className="target-fields">
                          <label>
                            Target sets
                            <input
                              aria-label={`${exercise?.name ?? 'Exercise'} target sets on ${day.label}`}
                              type="number"
                              min="1"
                              value={entry.targetSets ?? ''}
                              onChange={(event) =>
                                updateEntry(index, {
                                  targetSets: event.target.value
                                    ? Number(event.target.value)
                                    : null,
                                })
                              }
                            />
                          </label>
                          <label>
                            Target reps
                            <input
                              aria-label={`${exercise?.name ?? 'Exercise'} target reps on ${day.label}`}
                              type="number"
                              min="1"
                              value={entry.targetReps ?? ''}
                              onChange={(event) =>
                                updateEntry(index, {
                                  targetReps: event.target.value
                                    ? Number(event.target.value)
                                    : null,
                                })
                              }
                            />
                          </label>
                        </div>
                      )}
                      <textarea
                        aria-label={`${exercise?.name ?? 'Exercise'} template notes on ${day.label}`}
                        placeholder="Exercise notes"
                        value={entry.notes ?? ''}
                        onChange={(event) =>
                          updateEntry(index, {
                            notes: event.target.value || null,
                          })
                        }
                      />
                    </div>
                  );
                })}
              </div>
              <button
                className="secondary full"
                type="button"
                aria-label={`Add exercise to ${day.label}`}
                onClick={() => setPickerDay(day.value)}
              >
                + Add exercise
              </button>
            </section>
          );
        })}
      </div>

      {pickerDay && (
        <ExercisePicker
          day={pickerDay}
          exercises={exercises}
          entries={draft.exercises}
          onAdd={(exercise) =>
            setDraft((current) => ({
              ...current,
              exercises: [
                ...current.exercises,
                {
                  exerciseId: exercise.id,
                  dayOfWeek: pickerDay,
                  notes: null,
                  targetSets: null,
                  targetReps: null,
                  targetDurationSeconds: null,
                  targetDistance: null,
                  targetDistanceUnit: 'km',
                },
              ],
            }))
          }
          onClose={() => setPickerDay(undefined)}
        />
      )}

      <div className="inline-actions">
        <button
          type="button"
          onClick={() => void run(() => api.updateTemplate(template.id, draft))}
        >
          Save weekly template
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() => void run(() => api.duplicateTemplate(template.id))}
        >
          Duplicate
        </button>
        <button
          className="secondary danger-text"
          type="button"
          onClick={() => void run(() => api.deleteTemplate(template.id))}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

function ExercisePicker({
  day,
  exercises,
  entries,
  onAdd,
  onClose,
}: {
  day: DayOfWeek;
  exercises: Exercise[];
  entries: WorkoutTemplateInput['exercises'];
  onAdd: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const [nameFilter, setNameFilter] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('');
  const dayName = WEEKDAYS.find((entry) => entry.value === day)!.label;
  const muscles = useMemo(() => {
    const unique = new Map<string, string>();
    for (const exercise of exercises) {
      for (const muscle of exercise.muscles) unique.set(muscle.id, muscle.name);
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
            <span className="eyebrow">ADD TO {dayName.toUpperCase()}</span>
            <h2 id="exercise-picker-title">Choose exercises</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close exercise picker"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="exercise-picker-filters">
          <label className="field">
            Filter by name
            <input
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
            const timesAdded = entries.filter(
              (entry) =>
                entry.dayOfWeek === day && entry.exerciseId === exercise.id,
            ).length;
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
                  <small>
                    {exercise.muscles.length > 0
                      ? exercise.muscles
                          .map((muscle) => muscle.name)
                          .join(' · ')
                      : 'No muscles assigned'}
                  </small>
                  <button type="button" onClick={() => onAdd(exercise)}>
                    {timesAdded > 0
                      ? `Add again (${timesAdded} added)`
                      : `Add to ${dayName}`}
                  </button>
                </div>
              </article>
            );
          })}
          {visibleExercises.length === 0 && (
            <p className="empty-state">No exercises match these filters.</p>
          )}
        </div>
        <button className="secondary full" type="button" onClick={onClose}>
          Done
        </button>
      </section>
    </div>
  );
}

function toInput(template: WorkoutTemplate): WorkoutTemplateInput {
  return {
    name: template.name,
    isActive: template.isActive,
    notes: template.notes,
    exercises: template.exercises.map((entry) => ({
      id: entry.id,
      exerciseId: entry.exerciseId,
      dayOfWeek: entry.dayOfWeek,
      notes: entry.notes,
      targetSets: entry.targetSets,
      targetReps: entry.targetReps,
      targetDurationSeconds: entry.targetDurationSeconds,
      targetDistance: entry.targetDistance,
      targetDistanceUnit: entry.targetDistanceUnit,
    })),
  };
}
