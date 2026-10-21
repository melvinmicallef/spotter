import { useState } from 'react';

import type {
  Exercise,
  WorkoutTemplate,
  WorkoutTemplateInput,
} from '@spotter/shared';

import { api } from '../api.js';

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
          <span className="eyebrow">PLANS</span>
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
              await api.createTemplate({ name, notes: null, exercises: [] });
              setName('');
            });
          }}
        >
          <input
            aria-label="New template name"
            placeholder="New template name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit">Create</button>
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

  function move(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= draft.exercises.length) return;
    const next = [...draft.exercises];
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    setDraft({ ...draft, exercises: next });
  }

  return (
    <article className="form-card template-card">
      <input
        aria-label={`${template.name} name`}
        value={draft.name}
        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
      />
      <textarea
        aria-label={`${template.name} notes`}
        placeholder="Template notes"
        value={draft.notes ?? ''}
        onChange={(event) =>
          setDraft({ ...draft, notes: event.target.value || null })
        }
      />
      <div className="stack tight">
        {draft.exercises.map((entry, index) => {
          const exercise = exercises.find(
            (item) => item.id === entry.exerciseId,
          );
          return (
            <div
              className="list-row template-entry"
              key={entry.id ?? `${entry.exerciseId}-${index}`}
            >
              <span>
                <strong>{index + 1}.</strong>{' '}
                {exercise?.name ?? 'Unavailable exercise'}
              </span>
              <input
                aria-label="Target sets"
                type="number"
                min="1"
                placeholder="Sets"
                value={entry.targetSets ?? ''}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    exercises: draft.exercises.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            targetSets: event.target.value
                              ? Number(event.target.value)
                              : null,
                          }
                        : item,
                    ),
                  })
                }
              />
              <input
                aria-label="Target reps"
                type="number"
                min="1"
                placeholder="Reps"
                value={entry.targetReps ?? ''}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    exercises: draft.exercises.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            targetReps: event.target.value
                              ? Number(event.target.value)
                              : null,
                          }
                        : item,
                    ),
                  })
                }
              />
              <div className="inline-actions">
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  className="icon-button danger-text"
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      exercises: draft.exercises.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    })
                  }
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <select
        value=""
        aria-label="Add exercise to template"
        onChange={(event) => {
          if (!event.target.value) return;
          setDraft({
            ...draft,
            exercises: [
              ...draft.exercises,
              {
                exerciseId: event.target.value,
                notes: null,
                targetSets: null,
                targetReps: null,
              },
            ],
          });
        }}
      >
        <option value="">Add exercise…</option>
        {exercises.map((exercise) => (
          <option key={exercise.id} value={exercise.id}>
            {exercise.name}
          </option>
        ))}
      </select>
      <div className="inline-actions">
        <button
          type="button"
          onClick={() => void run(() => api.updateTemplate(template.id, draft))}
        >
          Save template
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

function toInput(template: WorkoutTemplate): WorkoutTemplateInput {
  return {
    name: template.name,
    notes: template.notes,
    exercises: template.exercises.map((entry) => ({
      id: entry.id,
      exerciseId: entry.exerciseId,
      notes: entry.notes,
      targetSets: entry.targetSets,
      targetReps: entry.targetReps,
    })),
  };
}
