import { useEffect, useMemo, useState, type ReactNode } from 'react';

import type {
  CardioMode,
  DayOfWeek,
  Exercise,
  WorkoutTemplate,
  WorkoutTemplateInput,
} from '@spotter/shared';

import { api } from '../api.js';
import { convertDistance } from '../measurement-system.js';
import type { DistanceUnit } from '../measurement-system.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { pathForTemplate, templateRouteFromPath } from '../routes.js';
import { WEEKDAYS } from '../weekdays.js';

interface TemplatesViewProps {
  online: boolean;
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  distanceUnit?: DistanceUnit;
  routePath: string;
  onNavigate: (path: string) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}

export function TemplatesView(props: TemplatesViewProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const distanceUnit = props.distanceUnit ?? 'km';
  const screen = templateRouteFromPath(props.routePath);
  const selectedTemplate =
    'templateId' in screen
      ? props.templates.find((template) => template.id === screen.templateId)
      : undefined;

  async function run<T>(
    action: () => Promise<T>,
    onSuccess?: (result: T) => void,
  ) {
    try {
      const result = await action();
      await props.onRefresh();
      onSuccess?.(result);
    } catch (error) {
      props.onError(
        error instanceof Error ? error.message : 'Template update failed',
      );
    }
  }

  const offlineNotice = !props.online && (
    <p className="notice">
      Template changes need a connection. Cached templates can still start
      workouts.
    </p>
  );

  if (screen.kind === 'create') {
    return (
      <TemplateEditor
        key="new-template"
        title="Create template"
        submitLabel="Create template"
        online={props.online}
        exercises={props.exercises}
        distanceUnit={distanceUnit}
        initial={{
          name: '',
          isActive: false,
          notes: null,
          dayNames: [],
          exercises: [],
        }}
        notice={offlineNotice}
        onCancel={() => props.onNavigate(pathForTemplate({ kind: 'list' }))}
        onSubmit={(draft) =>
          void run(
            () => api.createTemplate(draft),
            (createdTemplate) => {
              props.onNavigate(
                pathForTemplate({
                  kind: 'details',
                  templateId: createdTemplate.id,
                }),
              );
            },
          )
        }
      />
    );
  }

  if (screen.kind === 'edit' && selectedTemplate) {
    return (
      <TemplateEditor
        key={selectedTemplate.id}
        title={`Edit ${selectedTemplate.name}`}
        submitLabel="Save weekly template"
        online={props.online}
        exercises={props.exercises}
        distanceUnit={distanceUnit}
        initial={toInput(selectedTemplate)}
        notice={offlineNotice}
        onCancel={() =>
          props.onNavigate(
            pathForTemplate({
              kind: 'details',
              templateId: selectedTemplate.id,
            }),
          )
        }
        onSubmit={(draft) =>
          void run(
            () => api.updateTemplate(selectedTemplate.id, draft),
            () =>
              props.onNavigate(
                pathForTemplate({
                  kind: 'details',
                  templateId: selectedTemplate.id,
                }),
              ),
          )
        }
      />
    );
  }

  if (screen.kind === 'details' && selectedTemplate) {
    return (
      <>
        <TemplateDetails
          template={selectedTemplate}
          exercises={props.exercises}
          distanceUnit={distanceUnit}
          online={props.online}
          notice={offlineNotice}
          onBack={() => props.onNavigate(pathForTemplate({ kind: 'list' }))}
          onEdit={() =>
            props.onNavigate(
              pathForTemplate({
                kind: 'edit',
                templateId: selectedTemplate.id,
              }),
            )
          }
          onSetActive={() =>
            void run(() =>
              api.updateTemplate(selectedTemplate.id, {
                ...toInput(selectedTemplate),
                isActive: true,
              }),
            )
          }
          onDuplicate={() =>
            void run(
              () => api.duplicateTemplate(selectedTemplate.id),
              (duplicate) =>
                props.onNavigate(
                  pathForTemplate({
                    kind: 'details',
                    templateId: duplicate.id,
                  }),
                ),
            )
          }
          onDelete={() => setDeleteDialogOpen(true)}
        />
        {deleteDialogOpen && (
          <ConfirmDialog
            title={`Delete ${selectedTemplate.name}?`}
            message="This cannot be undone."
            confirmLabel="Delete template"
            onCancel={() => setDeleteDialogOpen(false)}
            onConfirm={() => {
              setDeleteDialogOpen(false);
              void run(
                () => api.deleteTemplate(selectedTemplate.id),
                () => props.onNavigate(pathForTemplate({ kind: 'list' })),
              );
            }}
          />
        )}
      </>
    );
  }

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">WEEKLY PLANS</span>
          <h2>Templates</h2>
        </div>
        <button
          type="button"
          disabled={!props.online}
          onClick={() => props.onNavigate(pathForTemplate({ kind: 'create' }))}
        >
          Add template
        </button>
      </div>
      {offlineNotice}
      {props.templates.length === 0 ? (
        <p className="empty-state">
          No templates yet. Add your first template.
        </p>
      ) : (
        <div className="template-library-list">
          {props.templates.map((template) => (
            <button
              className="template-library-row"
              type="button"
              key={`${template.id}-${template.updatedAt}`}
              onClick={() =>
                props.onNavigate(
                  pathForTemplate({
                    kind: 'details',
                    templateId: template.id,
                  }),
                )
              }
            >
              <span className="template-library-copy">
                <span className="template-library-title">
                  {template.name}
                  {template.isActive && (
                    <span className="active-badge">Active</span>
                  )}
                </span>
                <span className="template-library-summary">
                  {templateSummary(template)}
                </span>
              </span>
              <span className="exercise-row-chevron" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function TemplateDetails({
  template,
  exercises,
  distanceUnit,
  online,
  notice,
  onBack,
  onEdit,
  onSetActive,
  onDuplicate,
  onDelete,
}: {
  template: WorkoutTemplate;
  exercises: Exercise[];
  distanceUnit: DistanceUnit;
  online: boolean;
  notice: ReactNode;
  onBack: () => void;
  onEdit: () => void;
  onSetActive: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <section className="page-section template-details-page">
      <button
        className="text-button back-button"
        type="button"
        onClick={onBack}
      >
        ← Templates
      </button>
      {notice}
      <div className="exercise-details-heading template-details-heading">
        <div>
          <span className="eyebrow">WEEKLY TEMPLATE</span>
          <h2>{template.name}</h2>
        </div>
        <div className="exercise-detail-actions">
          <button
            className="icon-button exercise-action-button"
            type="button"
            aria-label={`Edit ${template.name}`}
            disabled={!online}
            onClick={onEdit}
          >
            <PencilIcon />
          </button>
          <button
            className="icon-button exercise-action-button danger-text"
            type="button"
            aria-label={`Delete ${template.name}`}
            disabled={!online}
            onClick={onDelete}
          >
            <TrashIcon />
          </button>
        </div>
      </div>
      <div className="inline-actions template-details-actions">
        {template.isActive ? (
          <span className="active-badge">Active</span>
        ) : (
          <button
            className="secondary"
            type="button"
            disabled={!online}
            onClick={onSetActive}
          >
            Set active
          </button>
        )}
        <button
          className="secondary"
          type="button"
          disabled={!online}
          onClick={onDuplicate}
        >
          Duplicate
        </button>
      </div>
      {template.notes && (
        <p className="template-details-notes">{template.notes}</p>
      )}
      <div className="week-grid template-details-week">
        {WEEKDAYS.map((day) => {
          const entries = template.exercises.filter(
            (entry) => entry.dayOfWeek === day.value,
          );
          const dayName = template.dayNames?.find(
            (item) => item.dayOfWeek === day.value,
          )?.name;
          return (
            <section className="template-day" key={day.value}>
              <header>
                <h3>
                  {day.label}
                  {dayName && ` · ${dayName}`}
                </h3>
                <small>
                  {entries.length} exercise{entries.length === 1 ? '' : 's'}
                </small>
              </header>
              <div className="stack tight">
                {entries.map((entry, index) => {
                  const exercise = exercises.find(
                    (item) => item.id === entry.exerciseId,
                  );
                  return (
                    <div className="template-detail-entry" key={entry.id}>
                      <strong>
                        {index + 1}. {exercise?.name ?? entry.exerciseName}
                      </strong>
                      <small>
                        {templateTargetSummary(entry, exercise, distanceUnit)}
                      </small>
                    </div>
                  );
                })}
                {entries.length === 0 && (
                  <small className="template-day-empty">Rest day</small>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function TemplateEditor({
  title,
  submitLabel,
  online,
  exercises,
  distanceUnit,
  initial,
  notice,
  onCancel,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  online: boolean;
  exercises: Exercise[];
  distanceUnit: DistanceUnit;
  initial: WorkoutTemplateInput;
  notice: ReactNode;
  onCancel: () => void;
  onSubmit: (draft: WorkoutTemplateInput) => void;
}) {
  const [draft, setDraft] = useState<WorkoutTemplateInput>(initial);
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

  function updateDayName(dayOfWeek: DayOfWeek, name: string) {
    const otherDays = (draft.dayNames ?? []).filter(
      (dayName) => dayName.dayOfWeek !== dayOfWeek,
    );
    setDraft({
      ...draft,
      dayNames: name.trim() ? [...otherDays, { dayOfWeek, name }] : otherDays,
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
    <section className="page-section template-editor-page">
      <button
        className="text-button back-button"
        type="button"
        onClick={onCancel}
      >
        ← Back
      </button>
      <span className="eyebrow">WEEKLY PLANS</span>
      <h2>{title}</h2>
      {notice}
      <fieldset disabled={!online}>
        <form
          className="form-card template-card"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.name.trim()) return;
            onSubmit({
              ...draft,
              name: draft.name.trim(),
              dayNames: (draft.dayNames ?? [])
                .map((dayName) => ({
                  ...dayName,
                  name: dayName.name.trim(),
                }))
                .filter((dayName) => dayName.name),
            });
          }}
        >
          <label className="field">
            Template name
            <input
              required
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </label>
          <label className="field">
            Notes (optional)
            <textarea
              placeholder="Weekly template notes"
              value={draft.notes ?? ''}
              onChange={(event) =>
                setDraft({ ...draft, notes: event.target.value || null })
              }
            />
          </label>

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
                  <label className="template-day-name-field">
                    Day name (optional)
                    <input
                      aria-label={`${day.label} workout name`}
                      maxLength={100}
                      placeholder="e.g. Legs"
                      value={
                        draft.dayNames?.find(
                          (dayName) => dayName.dayOfWeek === day.value,
                        )?.name ?? ''
                      }
                      onChange={(event) =>
                        updateDayName(day.value, event.target.value)
                      }
                    />
                  </label>
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
                            <div className="cardio-target-editor">
                              <label>
                                Cardio mode
                                <select
                                  aria-label={`${exercise.name} cardio mode on ${day.label}`}
                                  value={entry.cardioMode ?? 'duration'}
                                  onChange={(event) => {
                                    const cardioMode = event.target
                                      .value as CardioMode;
                                    updateEntry(index, {
                                      cardioMode,
                                      targetDurationSeconds:
                                        cardioMode === 'duration'
                                          ? entry.targetDurationSeconds
                                          : null,
                                      intervalPrepSeconds:
                                        cardioMode === 'interval'
                                          ? (entry.intervalPrepSeconds ?? 0)
                                          : null,
                                      intervalWorkSeconds:
                                        cardioMode === 'interval'
                                          ? (entry.intervalWorkSeconds ?? 30)
                                          : null,
                                      intervalRestSeconds:
                                        cardioMode === 'interval'
                                          ? (entry.intervalRestSeconds ?? 30)
                                          : null,
                                      intervalIterations:
                                        cardioMode === 'interval'
                                          ? (entry.intervalIterations ?? 8)
                                          : null,
                                    });
                                  }}
                                >
                                  <option value="duration">Duration</option>
                                  <option value="interval">Interval</option>
                                </select>
                              </label>
                              {(entry.cardioMode ?? 'duration') ===
                              'duration' ? (
                                <TimeTargetFields
                                  label="Duration"
                                  value={entry.targetDurationSeconds}
                                  onChange={(targetDurationSeconds) =>
                                    updateEntry(index, {
                                      targetDurationSeconds,
                                    })
                                  }
                                  ariaLabel={`${exercise.name} duration on ${day.label}`}
                                />
                              ) : (
                                <>
                                  <TimeTargetFields
                                    label="Prep time"
                                    value={entry.intervalPrepSeconds ?? null}
                                    onChange={(intervalPrepSeconds) =>
                                      updateEntry(index, {
                                        intervalPrepSeconds:
                                          intervalPrepSeconds ?? 0,
                                      })
                                    }
                                    ariaLabel={`${exercise.name} prep time on ${day.label}`}
                                    allowZero
                                  />
                                  <TimeTargetFields
                                    label="Work time"
                                    value={entry.intervalWorkSeconds ?? null}
                                    onChange={(intervalWorkSeconds) =>
                                      updateEntry(index, {
                                        intervalWorkSeconds:
                                          intervalWorkSeconds ?? 0,
                                      })
                                    }
                                    ariaLabel={`${exercise.name} work time on ${day.label}`}
                                  />
                                  <TimeTargetFields
                                    label="Rest time"
                                    value={entry.intervalRestSeconds ?? null}
                                    onChange={(intervalRestSeconds) =>
                                      updateEntry(index, {
                                        intervalRestSeconds:
                                          intervalRestSeconds ?? 0,
                                      })
                                    }
                                    ariaLabel={`${exercise.name} rest time on ${day.label}`}
                                    allowZero
                                  />
                                  <label>
                                    Iterations
                                    <input
                                      aria-label={`${exercise.name} interval iterations on ${day.label}`}
                                      inputMode="numeric"
                                      type="number"
                                      min="1"
                                      max="999"
                                      value={entry.intervalIterations ?? ''}
                                      onChange={(event) =>
                                        updateEntry(index, {
                                          intervalIterations: event.target.value
                                            ? Number(event.target.value)
                                            : null,
                                        })
                                      }
                                    />
                                  </label>
                                </>
                              )}
                              <label>
                                Target distance ({distanceUnit})
                                <input
                                  aria-label={`${exercise.name} target distance on ${day.label}`}
                                  inputMode="decimal"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={
                                    convertDistance(
                                      entry.targetDistance,
                                      entry.targetDistanceUnit,
                                      distanceUnit,
                                    ) ?? ''
                                  }
                                  onChange={(event) =>
                                    updateEntry(index, {
                                      targetDistance: event.target.value
                                        ? Number(event.target.value)
                                        : null,
                                      targetDistanceUnit: distanceUnit,
                                    })
                                  }
                                />
                              </label>
                            </div>
                          ) : (
                            <div className="target-fields">
                              <label>
                                Target reps
                                <input
                                  aria-label={`${exercise?.name ?? 'Exercise'} target reps on ${day.label}`}
                                  inputMode="numeric"
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
                              <label>
                                Target sets
                                <input
                                  aria-label={`${exercise?.name ?? 'Exercise'} target sets on ${day.label}`}
                                  inputMode="numeric"
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
                            </div>
                          )}
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
                      targetSets: null,
                      targetReps: null,
                      targetDurationSeconds: null,
                      cardioMode: 'duration',
                      intervalPrepSeconds: null,
                      intervalWorkSeconds: null,
                      intervalRestSeconds: null,
                      intervalIterations: null,
                      targetDistance: null,
                      targetDistanceUnit: 'km',
                    },
                  ],
                }))
              }
              onClose={() => setPickerDay(undefined)}
            />
          )}

          <div className="inline-actions template-editor-actions">
            <button className="secondary" type="button" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit">{submitLabel}</button>
          </div>
        </form>
      </fieldset>
    </section>
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

function templateSummary(template: WorkoutTemplate): string {
  const exerciseCount = template.exercises.length;
  const dayCount = new Set([
    ...template.exercises.map((exercise) => exercise.dayOfWeek),
    ...(template.dayNames ?? []).map((dayName) => dayName.dayOfWeek),
  ]).size;
  return `${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'} across ${dayCount} day${dayCount === 1 ? '' : 's'}`;
}

function templateTargetSummary(
  entry: WorkoutTemplate['exercises'][number],
  exercise: Exercise | undefined,
  distanceUnit: DistanceUnit,
): string {
  const parts: string[] = [];
  if ((exercise?.exerciseType ?? entry.exerciseType) === 'cardio') {
    if (entry.cardioMode === 'interval') {
      parts.push(
        `Prep ${formatTimer(entry.intervalPrepSeconds ?? 0)} · Work ${formatTimer(entry.intervalWorkSeconds ?? 0)} · Rest ${formatTimer(entry.intervalRestSeconds ?? 0)} × ${entry.intervalIterations ?? 0}`,
      );
    } else if (entry.targetDurationSeconds != null) {
      parts.push(`${formatTimer(entry.targetDurationSeconds)}`);
    }
    if (entry.targetDistance != null) {
      parts.push(
        `${convertDistance(entry.targetDistance, entry.targetDistanceUnit, distanceUnit)} ${distanceUnit}`,
      );
    }
  } else {
    if (entry.targetSets != null) {
      parts.push(`${entry.targetSets} set${entry.targetSets === 1 ? '' : 's'}`);
    }
    if (entry.targetReps != null) {
      parts.push(`${entry.targetReps} rep${entry.targetReps === 1 ? '' : 's'}`);
    }
  }
  return parts.join(' · ') || 'No targets set';
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4l11-11-4-4L4 16v4Zm13-17 4 4-2 2-4-4 2-2Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4h8l1 2h4v2H3V6h4l1-2Zm-2 6h12l-1 10H7L6 10Zm3 2v6h2v-6H9Zm4 0v6h2v-6h-2Z" />
    </svg>
  );
}

function toInput(template: WorkoutTemplate): WorkoutTemplateInput {
  return {
    name: template.name,
    isActive: template.isActive,
    notes: template.notes,
    dayNames: template.dayNames ?? [],
    exercises: template.exercises.map((entry) => ({
      id: entry.id,
      exerciseId: entry.exerciseId,
      dayOfWeek: entry.dayOfWeek,
      targetSets: entry.targetSets,
      targetReps: entry.targetReps,
      targetDurationSeconds: entry.targetDurationSeconds,
      cardioMode: entry.cardioMode ?? 'duration',
      intervalPrepSeconds: entry.intervalPrepSeconds ?? null,
      intervalWorkSeconds: entry.intervalWorkSeconds ?? null,
      intervalRestSeconds: entry.intervalRestSeconds ?? null,
      intervalIterations: entry.intervalIterations ?? null,
      targetDistance: entry.targetDistance,
      targetDistanceUnit: entry.targetDistanceUnit,
    })),
  };
}

function TimeTargetFields({
  label,
  value,
  onChange,
  ariaLabel,
  allowZero = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  ariaLabel: string;
  allowZero?: boolean;
}) {
  const minutes = value == null ? '' : Math.floor(value / 60);
  const seconds = value == null ? '' : value % 60;
  function updatePart(part: 'minutes' | 'seconds', raw: string) {
    if (raw === '' && value == null) return;
    const nextMinutes =
      part === 'minutes'
        ? Number(raw || 0)
        : minutes === ''
          ? 0
          : Number(minutes);
    const nextSeconds =
      part === 'seconds'
        ? Math.min(59, Number(raw || 0))
        : seconds === ''
          ? 0
          : Number(seconds);
    const total = Math.max(0, nextMinutes * 60 + nextSeconds);
    onChange(total === 0 && !allowZero ? null : total);
  }
  return (
    <fieldset className="time-target-field">
      <legend>{label}</legend>
      <label>
        <span className="sr-only">{ariaLabel} minutes</span>
        <input
          aria-label={`${ariaLabel} minutes`}
          inputMode="numeric"
          type="number"
          min="0"
          value={minutes}
          onChange={(event) => updatePart('minutes', event.target.value)}
        />
        <span>min</span>
      </label>
      <label>
        <span className="sr-only">{ariaLabel} seconds</span>
        <input
          aria-label={`${ariaLabel} seconds`}
          inputMode="numeric"
          type="number"
          min="0"
          max="59"
          value={seconds}
          onChange={(event) => updatePart('seconds', event.target.value)}
        />
        <span>sec</span>
      </label>
    </fieldset>
  );
}

function formatTimer(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
