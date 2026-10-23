import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { Exercise, ExerciseInput, Muscle, Workout } from '@spotter/shared';

import { api } from '../../shared/api.js';
import {
  exerciseMuscleSummary,
  muscleDisplayName,
} from '../../shared/exercise-muscles.js';
export { exerciseMuscleSummary } from '../../shared/exercise-muscles.js';
import { useSubmission } from '../../shared/use-submission.js';
import { SaveButton } from '../../components/SaveButton.js';
import type { WeightUnit } from '../settings/measurement-system.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { StrengthProgressChart } from '../history/StrengthProgressChart.js';
import { exerciseRouteFromPath, pathForExercise } from '../../shared/routes.js';

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
  const [primaryMuscleFilter, setPrimaryMuscleFilter] = useState('');
  const screen = exerciseRouteFromPath(props.routePath);
  const primaryMuscles = Array.from(
    new Map(
      props.exercises.flatMap((exercise) =>
        exercise.muscles
          .filter((muscle) => muscle.role === 'primary')
          .map((muscle) => [muscle.id, muscle] as const),
      ),
    ).values(),
  ).sort((a, b) => muscleDisplayName(a).localeCompare(muscleDisplayName(b)));
  const visibleExercises = props.exercises
    .filter(
      (exercise) =>
        !primaryMuscleFilter ||
        exercise.muscles.some(
          (muscle) =>
            muscle.role === 'primary' && muscle.id === primaryMuscleFilter,
        ),
    )
    .slice()
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
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
          run(
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
          run(
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
        <>
          <label className="field exercise-library-filter">
            Filter by primary muscle
            <select
              autoComplete="off"
              aria-label="Filter by primary muscle"
              value={primaryMuscleFilter}
              onChange={(event) => setPrimaryMuscleFilter(event.target.value)}
            >
              <option value="">All primary muscles</option>
              {primaryMuscles.map((muscle) => (
                <option key={muscle.id} value={muscle.id}>
                  {muscleDisplayName(muscle)}
                </option>
              ))}
            </select>
          </label>
          {visibleExercises.length === 0 ? (
            <p className="empty-state">No exercises use this primary muscle.</p>
          ) : (
            <div className="exercise-library-list">
              {visibleExercises.map((exercise) => (
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
                    <span className="exercise-library-title">
                      {exercise.name}
                    </span>
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
        </>
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
          showReference={false}
        />
      </section>
    </div>
  );
}

function ExerciseInfo({
  exercise,
  actions,
  titleId,
  showReference = true,
}: {
  exercise: Exercise;
  actions?: ReactNode;
  titleId?: string;
  showReference?: boolean;
}) {
  const primary = exercise.muscles.filter(
    (muscle) => muscle.role === 'primary',
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
        {showReference && exercise.referenceUrl && (
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
  ) => Promise<void>;
}) {
  const { pending, submit } = useSubmission();
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
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>(
    exercise?.muscles
      .filter((muscle) => muscle.role === 'primary')
      .map((muscle) => muscle.id) ?? [],
  );
  const [imageFile, setImageFile] = useState<File>();
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>();
  const [removeImage, setRemoveImage] = useState(false);
  const [imageDragActive, setImageDragActive] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const hasImage = Boolean(imageFile || (exercise?.media && !removeImage));

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
      <fieldset disabled={!online || pending}>
        <form
          autoComplete="off"
          className="form-card exercise-editor-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            void submit(() =>
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
              ),
            );
          }}
        >
          <label className="field">
            Exercise name
            <input
              autoComplete="off"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            Exercise type
            <select
              autoComplete="off"
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
              autoComplete="off"
              placeholder="Setup, equipment, stance, or starting position (optional)"
              value={preparation}
              onChange={(event) => setPreparation(event.target.value)}
            />
          </label>
          <label className="field">
            Execution
            <textarea
              autoComplete="off"
              placeholder="Movement steps and technique cues (optional)"
              value={execution}
              onChange={(event) => setExecution(event.target.value)}
            />
          </label>
          <label className="field">
            Comments
            <textarea
              autoComplete="off"
              placeholder="Additional exercise comments (optional)"
              value={comments}
              onChange={(event) => setComments(event.target.value)}
            />
          </label>
          <label className="field">
            Reference website (optional)
            <input
              autoComplete="off"
              type="url"
              placeholder="https://exrx.net/..."
              value={referenceUrl}
              onChange={(event) => setReferenceUrl(event.target.value)}
            />
          </label>
          <div className="field">
            <span>Target muscles</span>
            <TargetMusclesEditor
              muscles={muscles}
              selected={selectedMuscles}
              onChange={setSelectedMuscles}
            />
          </div>
          <div className="field">
            <span>Exercise image</span>
            {!hasImage && (
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
            )}
            {hasImage && (
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
            {!hasImage && (
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
                <span>Drop an image here or click to choose a file</span>
                <small>GIF, PNG, or JPEG · Maximum 5 MB</small>
              </button>
            )}
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
            <SaveButton
              pending={pending}
              pendingLabel={exercise ? 'Saving…' : 'Creating…'}
            >
              {exercise ? 'Save changes' : 'Create exercise'}
            </SaveButton>
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
      <path
        d="M24 41.2 21.1 38.6C10.8 29.3 4 23.1 4 15.5 4 9.3 8.9 4.5 15 4.5c3.5 0 6.8 1.6 9 4.3 2.2-2.7 5.5-4.3 9-4.3 6.1 0 11 4.8 11 11 0 7.6-6.8 13.8-17.1 23.1L24 41.2Z"
        fill="currentColor"
      />
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

export function exerciseMuscleLinks(selected: string[]) {
  return selected.map((muscleId) => ({
    muscleId,
    role: 'primary' as const,
  }));
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

function TargetMusclesEditor({
  muscles,
  selected,
  onChange,
}: {
  muscles: Muscle[];
  selected: string[];
  onChange: (muscleIds: string[]) => void;
}) {
  const [muscleId, setMuscleId] = useState('');
  const availableMuscles = muscles.filter(
    (muscle) => !selected.includes(muscle.id),
  );
  const assignedMuscles = muscles
    .filter((muscle) => selected.includes(muscle.id))
    .sort((left, right) => left.name.localeCompare(right.name));

  return (
    <div className="muscle-assignment-editor">
      <div
        className="assigned-muscle-list"
        role="group"
        aria-label="Assigned muscles"
      >
        {assignedMuscles.map((muscle) => (
          <div className="assigned-muscle-row" key={muscle.id}>
            <strong>{muscleDisplayName(muscle)}</strong>
            <button
              className="icon-button danger-text"
              type="button"
              aria-label={`Remove ${muscle.name}`}
              onClick={() => {
                onChange(selected.filter((id) => id !== muscle.id));
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
            autoComplete="off"
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
        <button
          className="secondary"
          type="button"
          disabled={!muscleId}
          onClick={() => {
            if (!muscleId || selected.includes(muscleId)) return;
            onChange([...selected, muscleId]);
            setMuscleId('');
          }}
        >
          Add muscle
        </button>
      </div>
    </div>
  );
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
