import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { Exercise, ExerciseInput, Muscle, Workout } from '@spotter/shared';

import { api } from '../api.js';
import type { WeightUnit } from '../measurement-system.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { StrengthProgressChart } from './StrengthProgressChart.js';
import { exerciseRouteFromPath, pathForExercise } from '../routes.js';

interface ExercisesViewProps {
  online: boolean;
  muscles: Muscle[];
  exercises: Exercise[];
  workoutHistory: Workout[];
  weightUnit: WeightUnit;
  routePath: string;
  onNavigate: (path: string) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}

export function ExercisesView(props: ExercisesViewProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const screen = exerciseRouteFromPath(props.routePath);
  const selectedExercise =
    'exerciseId' in screen
      ? props.exercises.find((exercise) => exercise.id === screen.exerciseId)
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
        error instanceof Error ? error.message : 'Exercise update failed',
      );
    }
  }

  const offlineNotice = !props.online && (
    <p className="notice">
      Exercise changes need a connection. Cached exercises remain available in
      workouts.
    </p>
  );

  if (screen.kind === 'create') {
    return (
      <ExerciseEditorPage
        title="Add exercise"
        online={props.online}
        muscles={props.muscles}
        notice={offlineNotice}
        onCancel={() => props.onNavigate(pathForExercise({ kind: 'list' }))}
        onError={props.onError}
        onSubmit={(draft, imageFile) =>
          void run(
            async () => {
              const image = imageFile
                ? await api.uploadImage(imageFile)
                : undefined;
              try {
                return await api.createExercise({
                  ...draft,
                  mediaId: image?.id ?? null,
                  source: null,
                });
              } catch (error) {
                if (image) await api.deleteMedia(image.id).catch(() => {});
                throw error;
              }
            },
            (createdExercise) =>
              props.onNavigate(
                pathForExercise({
                  kind: 'details',
                  exerciseId: createdExercise.id,
                }),
              ),
          )
        }
      />
    );
  }

  if (screen.kind === 'edit' && selectedExercise) {
    return (
      <ExerciseEditorPage
        title={`Edit ${selectedExercise.name}`}
        online={props.online}
        muscles={props.muscles}
        exercise={selectedExercise}
        notice={offlineNotice}
        onCancel={() =>
          props.onNavigate(
            pathForExercise({
              kind: 'details',
              exerciseId: selectedExercise.id,
            }),
          )
        }
        onError={props.onError}
        onSubmit={(draft, imageFile, removeImage) =>
          void run(
            async () => {
              const replacement = imageFile
                ? await api.uploadImage(imageFile)
                : undefined;
              let updatedExercise: Exercise;
              try {
                updatedExercise = await api.updateExercise(
                  selectedExercise.id,
                  {
                    ...draft,
                    mediaId:
                      replacement?.id ??
                      (removeImage
                        ? null
                        : (selectedExercise.media?.id ?? null)),
                    source: null,
                  },
                );
              } catch (error) {
                if (replacement)
                  await api.deleteMedia(replacement.id).catch(() => {});
                throw error;
              }
              if (selectedExercise.media && (replacement || removeImage)) {
                await api
                  .deleteMedia(selectedExercise.media.id)
                  .catch(() => {});
              }
              return updatedExercise;
            },
            () =>
              props.onNavigate(
                pathForExercise({
                  kind: 'details',
                  exerciseId: selectedExercise.id,
                }),
              ),
          )
        }
      />
    );
  }

  if (screen.kind === 'details' && selectedExercise) {
    return (
      <>
        <ExerciseDetails
          exercise={selectedExercise}
          workoutHistory={props.workoutHistory}
          weightUnit={props.weightUnit}
          online={props.online}
          notice={offlineNotice}
          onBack={() => props.onNavigate(pathForExercise({ kind: 'list' }))}
          onEdit={() =>
            props.onNavigate(
              pathForExercise({
                kind: 'edit',
                exerciseId: selectedExercise.id,
              }),
            )
          }
          onDelete={() => setDeleteDialogOpen(true)}
        />
        {deleteDialogOpen && (
          <ConfirmDialog
            title={`Delete ${selectedExercise.name}?`}
            message="This cannot be undone."
            confirmLabel="Delete exercise"
            onCancel={() => setDeleteDialogOpen(false)}
            onConfirm={() => {
              setDeleteDialogOpen(false);
              void run(
                () => api.deleteExercise(selectedExercise.id),
                () => props.onNavigate(pathForExercise({ kind: 'list' })),
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
          <span className="eyebrow">ONLINE LIBRARY</span>
          <h2>Exercises</h2>
        </div>
        <button
          type="button"
          disabled={!props.online}
          onClick={() => props.onNavigate(pathForExercise({ kind: 'create' }))}
        >
          Add exercise
        </button>
      </div>
      {offlineNotice}
      {props.exercises.length === 0 ? (
        <p className="empty-state">
          No exercises yet. Add your first exercise.
        </p>
      ) : (
        <div className="exercise-library-list">
          {props.exercises.map((exercise) => (
            <button
              className="exercise-library-row"
              type="button"
              key={`${exercise.id}-${exercise.updatedAt}`}
              onClick={() =>
                props.onNavigate(
                  pathForExercise({
                    kind: 'details',
                    exerciseId: exercise.id,
                  }),
                )
              }
            >
              <ExerciseImage exercise={exercise} compact />
              <span className="exercise-library-copy">
                <span className="exercise-library-title">{exercise.name}</span>
                <span className="exercise-library-muscles">
                  {exerciseMuscleSummary(exercise)}
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

function ExerciseDetails({
  exercise,
  workoutHistory,
  weightUnit,
  online,
  notice,
  onBack,
  onEdit,
  onDelete,
}: {
  exercise: Exercise;
  workoutHistory: Workout[];
  weightUnit: WeightUnit;
  online: boolean;
  notice: ReactNode;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <section className="page-section exercise-details-page">
      <button
        className="text-button back-button"
        type="button"
        onClick={onBack}
      >
        ← Exercises
      </button>
      {notice}
      <ExerciseInfo
        exercise={exercise}
        actions={
          <div className="exercise-detail-actions">
            <button
              className="icon-button exercise-action-button"
              type="button"
              aria-label={`Edit ${exercise.name}`}
              disabled={!online}
              onClick={onEdit}
            >
              <PencilIcon />
            </button>
            <button
              className="icon-button exercise-action-button danger-text"
              type="button"
              aria-label={`Delete ${exercise.name}`}
              disabled={!online}
              onClick={onDelete}
            >
              <TrashIcon />
            </button>
          </div>
        }
      />
      <StrengthProgressChart
        exercise={exercise}
        workouts={workoutHistory}
        weightUnit={weightUnit}
      />
    </section>
  );
}

export function ExerciseDetailsModal({
  exercise,
  onClose,
}: {
  exercise: Exercise;
  onClose: () => void;
}) {
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
        className="exercise-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-details-modal-title"
      >
        <header className="exercise-details-modal-header">
          <span className="eyebrow">EXERCISE GUIDE</span>
          <button
            className="icon-button exercise-details-modal-close"
            type="button"
            aria-label="Close exercise details"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <ExerciseInfo
          exercise={exercise}
          titleId="exercise-details-modal-title"
        />
      </section>
    </div>
  );
}

function ExerciseInfo({
  exercise,
  actions,
  titleId,
}: {
  exercise: Exercise;
  actions?: ReactNode;
  titleId?: string;
}) {
  const primary = exercise.muscles.filter(
    (muscle) => muscle.role === 'primary',
  );
  const secondary = exercise.muscles.filter(
    (muscle) => muscle.role === 'secondary',
  );
  return (
    <div className="exercise-details-hero">
      <ExerciseImage exercise={exercise} />
      <div className="exercise-details-copy">
        <div className="exercise-details-heading">
          <div>
            <ExerciseTypeIcon exerciseType={exercise.exerciseType} />
            <h2 id={titleId}>{exercise.name}</h2>
          </div>
          {actions}
        </div>
        <div className="exercise-instruction-section">
          <h3>Preparation</h3>
          <p>{exercise.preparation || 'No preparation added.'}</p>
        </div>
        <div className="exercise-instruction-section">
          <h3>Execution</h3>
          <p>{exercise.execution || 'No execution instructions added.'}</p>
        </div>
        <div className="exercise-instruction-section">
          <h3>Comments</h3>
          <p>{exercise.comments || 'No comments added.'}</p>
        </div>
        {exercise.referenceUrl && (
          <a
            className="exercise-reference-link"
            href={exercise.referenceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open exercise reference ↗
          </a>
        )}
        <MuscleGroup label="Primary muscles" muscles={primary} />
        <MuscleGroup label="Secondary muscles" muscles={secondary} />
      </div>
    </div>
  );
}

function ExerciseEditorPage({
  title,
  online,
  muscles,
  exercise,
  notice,
  onCancel,
  onError,
  onSubmit,
}: {
  title: string;
  online: boolean;
  muscles: Muscle[];
  exercise?: Exercise;
  notice: ReactNode;
  onCancel: () => void;
  onError: (message: string) => void;
  onSubmit: (
    draft: ExerciseDraft,
    imageFile: File | undefined,
    removeImage: boolean,
  ) => void;
}) {
  const [name, setName] = useState(exercise?.name ?? '');
  const [exerciseType, setExerciseType] = useState<
    ExerciseInput['exerciseType']
  >(exercise?.exerciseType ?? 'strength');
  const [preparation, setPreparation] = useState(exercise?.preparation ?? '');
  const [execution, setExecution] = useState(exercise?.execution ?? '');
  const [comments, setComments] = useState(exercise?.comments ?? '');
  const [referenceUrl, setReferenceUrl] = useState(
    exercise?.referenceUrl ?? '',
  );
  const [selectedMuscles, setSelectedMuscles] = useState<MuscleRoles>(
    Object.fromEntries(
      exercise?.muscles.map((muscle) => [muscle.id, muscle.role]) ?? [],
    ),
  );
  const [imageFile, setImageFile] = useState<File>();
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>();
  const [removeImage, setRemoveImage] = useState(false);
  const [imageDragActive, setImageDragActive] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    },
    [imagePreviewUrl],
  );

  const handleImageFile = (file?: File) => {
    if (!file) return;
    const validationError = validateExerciseImage(file);
    if (validationError) {
      onError(validationError);
      return;
    }
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  return (
    <section className="page-section exercise-editor-page">
      <button
        className="text-button back-button"
        type="button"
        onClick={onCancel}
      >
        ← Back
      </button>
      <span className="eyebrow">EXERCISE LIBRARY</span>
      <h2>{title}</h2>
      {notice}
      <fieldset disabled={!online}>
        <form
          className="form-card exercise-editor-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            onSubmit(
              {
                name: name.trim(),
                exerciseType,
                preparation: preparation.trim() || null,
                execution: execution.trim() || null,
                comments: comments.trim() || null,
                referenceUrl: referenceUrl.trim() || null,
                muscles: exerciseMuscleLinks(selectedMuscles),
              },
              imageFile,
              removeImage,
            );
          }}
        >
          <label className="field">
            Exercise name
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            Exercise type
            <select
              value={exerciseType}
              onChange={(event) =>
                setExerciseType(
                  event.target.value as ExerciseInput['exerciseType'],
                )
              }
            >
              <option value="strength">Strength</option>
              <option value="calisthenics">Calisthenics</option>
              <option value="cardio">Cardio</option>
            </select>
          </label>
          <label className="field">
            Preparation
            <textarea
              placeholder="Setup, equipment, stance, or starting position (optional)"
              value={preparation}
              onChange={(event) => setPreparation(event.target.value)}
            />
          </label>
          <label className="field">
            Execution
            <textarea
              placeholder="Movement steps and technique cues (optional)"
              value={execution}
              onChange={(event) => setExecution(event.target.value)}
            />
          </label>
          <label className="field">
            Comments
            <textarea
              placeholder="Additional exercise comments (optional)"
              value={comments}
              onChange={(event) => setComments(event.target.value)}
            />
          </label>
          <label className="field">
            Reference website (optional)
            <input
              type="url"
              placeholder="https://exrx.net/..."
              value={referenceUrl}
              onChange={(event) => setReferenceUrl(event.target.value)}
            />
          </label>
          <div className="field">
            <span>Target muscles</span>
            <MuscleRolesEditor
              muscles={muscles}
              selected={selectedMuscles}
              onChange={setSelectedMuscles}
            />
          </div>
          <div className="field">
            <span>Exercise image</span>
            <input
              ref={imageInputRef}
              className="sr-only"
              type="file"
              accept="image/gif,image/png,image/jpeg,.gif,.png,.jpg,.jpeg"
              aria-label="Choose an exercise image"
              onChange={(event) => {
                handleImageFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            {(imageFile || (exercise?.media && !removeImage)) && (
              <div className="exercise-image-preview">
                {imageFile ? (
                  imagePreviewUrl ? (
                    <img
                      className="exercise-detail-image"
                      src={imagePreviewUrl}
                      alt={`${name || 'Exercise'} image preview`}
                    />
                  ) : (
                    <div className="exercise-image-preview-loading" />
                  )
                ) : exercise ? (
                  <ExerciseImage exercise={exercise} />
                ) : (
                  <div
                    className="exercise-image-preview-loading"
                    aria-hidden="true"
                  />
                )}
                <button
                  className="exercise-image-remove"
                  type="button"
                  aria-label="Remove exercise image"
                  onClick={() => {
                    if (!imageFile && exercise?.media) setRemoveImage(true);
                    setImageFile(undefined);
                    setImagePreviewUrl(undefined);
                  }}
                >
                  <CrossIcon />
                </button>
              </div>
            )}
            <button
              className={`exercise-image-dropzone${
                imageDragActive ? ' is-dragging' : ''
              }`}
              type="button"
              onClick={() => imageInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setImageDragActive(true);
              }}
              onDragLeave={() => setImageDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setImageDragActive(false);
                handleImageFile(event.dataTransfer.files[0]);
              }}
            >
              <span>
                {imageFile || (exercise?.media && !removeImage)
                  ? 'Drop an image here or click to replace it'
                  : 'Drop an image here or click to choose a file'}
              </span>
              <small>GIF, PNG, or JPEG · Maximum 5 MB</small>
            </button>
            {removeImage && !imageFile && (
              <p className="exercise-image-removal-notice" role="status">
                Image will be removed when you save.{' '}
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setRemoveImage(false)}
                >
                  Undo
                </button>
              </p>
            )}
          </div>
          <div className="inline-actions exercise-editor-actions">
            <button className="secondary" type="button" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit">
              {exercise ? 'Save changes' : 'Create exercise'}
            </button>
          </div>
        </form>
      </fieldset>
    </section>
  );
}

function ExerciseImage({
  exercise,
  compact = false,
}: {
  exercise: Exercise;
  compact?: boolean;
}) {
  if (!exercise.media) {
    return (
      <span
        className={`exercise-image-placeholder${compact ? ' compact' : ''}`}
        aria-hidden="true"
      >
        {exercise.name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      className={compact ? 'exercise-list-image' : 'exercise-detail-image'}
      src={exercise.media.url}
      alt={`${exercise.name} demonstration`}
    />
  );
}

function MuscleGroup({
  label,
  muscles,
}: {
  label: string;
  muscles: Exercise['muscles'];
}) {
  return (
    <div className="exercise-muscle-group">
      <h3>{label}</h3>
      {muscles.length > 0 ? (
        <div className="exercise-muscle-tags">
          {muscles.map((muscle) => (
            <span key={muscle.id}>{muscleDisplayName(muscle)}</span>
          ))}
        </div>
      ) : (
        <p>None selected</p>
      )}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4l11-11-4-4L4 16v4Zm13-17 4 4-2 2-4-4 2-2Z" />
    </svg>
  );
}

function ExerciseTypeIcon({
  exerciseType,
}: {
  exerciseType: Exercise['exerciseType'];
}) {
  if (exerciseType === 'strength') {
    return (
      <svg
        className="exercise-type-icon"
        viewBox="0 0 48 48"
        role="img"
        aria-label="Strength exercise"
      >
        <path
          d="M12 24h24M7 18v12M12 14v20M36 14v20M41 18v12"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
      </svg>
    );
  }

  if (exerciseType === 'calisthenics') {
    return (
      <svg
        className="exercise-type-icon"
        viewBox="0 0 48 48"
        role="img"
        aria-label="Calisthenics exercise"
      >
        <g
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.5"
        >
          <path d="M5 9h38M8 9v7M40 9v7" />
          <path d="m24 22 0 9m0-7-6-7-5 4m11 3 6-7 5 4m-11 7-5 8m5-8 5 8" />
        </g>
        <circle cx="24" cy="18" r="3" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg
      className="exercise-type-icon"
      viewBox="0 0 48 48"
      role="img"
      aria-label="Cardio exercise"
    >
      <circle cx="30" cy="7" r="4" fill="currentColor" />
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4"
      >
        <path d="m27 14-6 10" />
        <path d="m26 15-6 2-5-3" />
        <path d="m28 15 6-3 5 3" />
        <path d="m21 24-7 6-5-1-4 5" />
        <path d="m21 24 8 5 7-1 7 5" />
      </g>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 3h8l1 2h4v2H3V5h4l1-2Zm-2 6h12l-1 12H7L6 9Zm3 2v8h2v-8H9Zm4 0v8h2v-8h-2Z" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

interface ExerciseDraft {
  name: string;
  exerciseType: ExerciseInput['exerciseType'];
  preparation: string | null;
  execution: string | null;
  comments: string | null;
  referenceUrl: string | null;
  muscles: ExerciseInput['muscles'];
}

type MuscleRole = ExerciseInput['muscles'][number]['role'];
type MuscleRoles = Record<string, MuscleRole>;

export function exerciseMuscleLinks(selected: MuscleRoles) {
  return Object.entries(selected)
    .sort((left, right) => roleOrder(left[1]) - roleOrder(right[1]))
    .map(([muscleId, role]) => ({
      muscleId,
      role,
    }));
}

export function exerciseMuscleSummary(exercise: Pick<Exercise, 'muscles'>) {
  const primary = exercise.muscles
    .filter((muscle) => muscle.role === 'primary')
    .map(muscleDisplayName);
  const secondary = exercise.muscles
    .filter((muscle) => muscle.role === 'secondary')
    .map(muscleDisplayName);
  return [...primary, ...secondary].join(' · ') || 'No target muscles';
}

export function validateExerciseImage(file?: Pick<File, 'size' | 'type'>) {
  if (!file) return null;
  if (!['image/gif', 'image/png', 'image/jpeg'].includes(file.type)) {
    return 'Choose a GIF, PNG, or JPEG image';
  }
  if (file.size > 5 * 1024 * 1024) {
    return 'Exercise images must be 5 MB or smaller';
  }
  return null;
}

function MuscleRolesEditor({
  muscles,
  selected,
  onChange,
}: {
  muscles: Muscle[];
  selected: MuscleRoles;
  onChange: (roles: MuscleRoles) => void;
}) {
  const [muscleId, setMuscleId] = useState('');
  const [role, setRole] = useState<MuscleRole>('primary');
  const availableMuscles = muscles.filter((muscle) => !selected[muscle.id]);
  const assignedMuscles = Object.entries(selected)
    .map(([id, assignedRole]) => ({
      muscle: muscles.find((muscle) => muscle.id === id),
      role: assignedRole,
    }))
    .filter(
      (entry): entry is { muscle: Muscle; role: MuscleRole } =>
        entry.muscle !== undefined,
    )
    .sort(
      (left, right) =>
        roleOrder(left.role) - roleOrder(right.role) ||
        left.muscle.name.localeCompare(right.muscle.name),
    );

  return (
    <div className="muscle-assignment-editor">
      <div
        className="assigned-muscle-list"
        role="group"
        aria-label="Assigned muscles"
      >
        {assignedMuscles.map(({ muscle, role: assignedRole }) => (
          <div className="assigned-muscle-row" key={muscle.id}>
            <strong>{muscleDisplayName(muscle)}</strong>
            <select
              aria-label={`${muscle.name} assigned role`}
              value={assignedRole}
              onChange={(event) =>
                onChange({
                  ...selected,
                  [muscle.id]: event.target.value as MuscleRole,
                })
              }
            >
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
            </select>
            <button
              className="icon-button danger-text"
              type="button"
              aria-label={`Remove ${muscle.name}`}
              onClick={() => {
                const next = { ...selected };
                delete next[muscle.id];
                onChange(next);
              }}
            >
              ×
            </button>
          </div>
        ))}
        {assignedMuscles.length === 0 && (
          <p className="empty-muscle-assignment">No target muscles added.</p>
        )}
      </div>
      <div className="muscle-add-controls">
        <label>
          Muscle
          <select
            aria-label="Muscle to add"
            value={muscleId}
            onChange={(event) => setMuscleId(event.target.value)}
          >
            <option value="">Choose a muscle…</option>
            {groupMuscleOptions(availableMuscles).map(([group, entries]) => (
              <optgroup label={group} key={group}>
                {entries.map((muscle) => (
                  <option key={muscle.id} value={muscle.id}>
                    {muscle.subgroup
                      ? `${muscle.subgroup} › ${muscle.name}`
                      : muscle.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          Role
          <select
            aria-label="Muscle role"
            value={role}
            onChange={(event) => setRole(event.target.value as MuscleRole)}
          >
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
          </select>
        </label>
        <button
          className="secondary"
          type="button"
          disabled={!muscleId}
          onClick={() => {
            if (!muscleId || selected[muscleId]) return;
            onChange({ ...selected, [muscleId]: role });
            setMuscleId('');
          }}
        >
          Add muscle
        </button>
      </div>
    </div>
  );
}

function roleOrder(role: MuscleRole): number {
  return role === 'primary' ? 0 : 1;
}

function muscleDisplayName(
  muscle: Pick<Muscle, 'group' | 'subgroup' | 'name'>,
) {
  return [muscle.group, muscle.subgroup, muscle.name]
    .filter(Boolean)
    .join(' › ');
}

function groupMuscleOptions(muscles: Muscle[]) {
  const groups = new Map<string, Muscle[]>();
  for (const muscle of muscles) {
    const entries = groups.get(muscle.group) ?? [];
    entries.push(muscle);
    groups.set(muscle.group, entries);
  }
  return [...groups.entries()];
}
