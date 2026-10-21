import { useState } from 'react';

import type {
  Exercise,
  ExerciseInput,
  Muscle,
  WebsiteImportPreview,
} from '@spotter/shared';

import { api } from '../api.js';

interface ExercisesViewProps {
  online: boolean;
  muscles: Muscle[];
  exercises: Exercise[];
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}

export function ExercisesView(props: ExercisesViewProps) {
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseType, setExerciseType] =
    useState<ExerciseInput['exerciseType']>('strength');
  const [instructions, setInstructions] = useState('');
  const [selectedMuscles, setSelectedMuscles] = useState<MuscleRoles>({});
  const [gifFile, setGifFile] = useState<File>();
  const [importUrl, setImportUrl] = useState('');
  const [importPreview, setImportPreview] = useState<WebsiteImportPreview>();
  const [importExerciseType, setImportExerciseType] =
    useState<ExerciseInput['exerciseType']>('strength');

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await props.onRefresh();
    } catch (error) {
      props.onError(
        error instanceof Error ? error.message : 'Catalogue update failed',
      );
    }
  }

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">ONLINE LIBRARY</span>
          <h2>Exercises</h2>
        </div>
      </div>
      {!props.online && (
        <p className="notice">
          Exercise changes need a connection. Cached exercises remain available
          in workouts.
        </p>
      )}
      <div>
        <div>
          <fieldset disabled={!props.online}>
            <form
              className="form-card import-card"
              onSubmit={(event) => {
                event.preventDefault();
                if (!importUrl.trim()) return;
                void run(async () => {
                  setImportPreview(
                    await api.previewWebsiteImport(importUrl.trim()),
                  );
                });
              }}
            >
              <strong>Import from a website</strong>
              <label className="field">
                Exercise page URL
                <input
                  type="url"
                  placeholder="https://example.com/exercise"
                  value={importUrl}
                  onChange={(event) => setImportUrl(event.target.value)}
                />
              </label>
              <button type="submit">Preview website</button>
              {importPreview && (
                <div className="import-preview">
                  <label className="field">
                    Imported exercise name
                    <input
                      value={importPreview.title}
                      onChange={(event) =>
                        setImportPreview({
                          ...importPreview,
                          title: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    Imported instructions
                    <textarea
                      value={importPreview.description ?? ''}
                      onChange={(event) =>
                        setImportPreview({
                          ...importPreview,
                          description: event.target.value || null,
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    Imported exercise type
                    <select
                      value={importExerciseType}
                      onChange={(event) =>
                        setImportExerciseType(
                          event.target.value as ExerciseInput['exerciseType'],
                        )
                      }
                    >
                      <option value="strength">Strength</option>
                      <option value="cardio">Cardio</option>
                    </select>
                  </label>
                  {importPreview.gifUrl && (
                    <a
                      href={importPreview.gifUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Review detected GIF (it will not be downloaded)
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        await api.createExercise({
                          name: importPreview.title,
                          exerciseType: importExerciseType,
                          instructions: importPreview.description,
                          muscles: exerciseMuscleLinks(selectedMuscles),
                          mediaId: null,
                          source: {
                            url: importPreview.sourceUrl,
                            title: importPreview.title,
                            mediaUrl: importPreview.gifUrl,
                          },
                        });
                        setImportPreview(undefined);
                        setImportUrl('');
                        setSelectedMuscles({});
                      })
                    }
                  >
                    Confirm and create exercise
                  </button>
                </div>
              )}
            </form>
            <form
              className="form-card"
              onSubmit={(event) => {
                event.preventDefault();
                if (!exerciseName.trim()) return;
                void run(async () => {
                  const media = gifFile
                    ? await api.uploadGif(gifFile)
                    : undefined;
                  try {
                    await api.createExercise({
                      name: exerciseName,
                      exerciseType,
                      instructions: instructions.trim() || null,
                      muscles: exerciseMuscleLinks(selectedMuscles),
                      mediaId: media?.id ?? null,
                      source: null,
                    });
                  } catch (error) {
                    if (media) await api.deleteMedia(media.id).catch(() => {});
                    throw error;
                  }
                  setExerciseName('');
                  setExerciseType('strength');
                  setInstructions('');
                  setSelectedMuscles({});
                  setGifFile(undefined);
                });
              }}
            >
              <input
                aria-label="New exercise name"
                placeholder="Exercise name"
                value={exerciseName}
                onChange={(event) => setExerciseName(event.target.value)}
              />
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
                  <option value="cardio">Cardio</option>
                </select>
              </label>
              <textarea
                aria-label="Exercise instructions"
                placeholder="Instructions (optional)"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
              />
              <MuscleRolesEditor
                muscles={props.muscles}
                selected={selectedMuscles}
                onChange={setSelectedMuscles}
              />
              <label className="field">
                Demonstration GIF (maximum 5 MB)
                <input
                  type="file"
                  accept="image/gif,.gif"
                  onChange={(event) => setGifFile(event.target.files?.[0])}
                />
              </label>
              <button type="submit">Create exercise</button>
            </form>
            <div className="stack tight">
              {props.exercises.map((exercise) => (
                <ExerciseCard
                  key={`${exercise.id}-${exercise.updatedAt}`}
                  exercise={exercise}
                  muscles={props.muscles}
                  run={run}
                />
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    </section>
  );
}

function ExerciseCard({
  exercise,
  muscles,
  run,
}: {
  exercise: Exercise;
  muscles: Muscle[];
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(exercise.name);
  const [exerciseType, setExerciseType] = useState(exercise.exerciseType);
  const [instructions, setInstructions] = useState(exercise.instructions ?? '');
  const [selected, setSelected] = useState<MuscleRoles>(
    Object.fromEntries(
      exercise.muscles.map((muscle) => [muscle.id, muscle.role]),
    ),
  );
  const [gifFile, setGifFile] = useState<File>();
  const [removeMedia, setRemoveMedia] = useState(false);
  return (
    <article className="form-card">
      {exercise.media && !removeMedia && (
        <img
          className="exercise-gif"
          src={exercise.media.url}
          alt={`${exercise.name} demonstration`}
        />
      )}
      <input
        aria-label={`${exercise.name} name`}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <label className="field">
        Exercise type
        <select
          aria-label={`${exercise.name} type`}
          value={exerciseType}
          onChange={(event) =>
            setExerciseType(event.target.value as Exercise['exerciseType'])
          }
        >
          <option value="strength">Strength</option>
          <option value="cardio">Cardio</option>
        </select>
      </label>
      <textarea
        aria-label={`${exercise.name} instructions`}
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
      />
      <MuscleRolesEditor
        muscles={muscles}
        selected={selected}
        onChange={setSelected}
      />
      <label className="field">
        Replace demonstration GIF (maximum 5 MB)
        <input
          type="file"
          accept="image/gif,.gif"
          onChange={(event) => setGifFile(event.target.files?.[0])}
        />
      </label>
      {exercise.media && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={removeMedia}
            onChange={(event) => setRemoveMedia(event.target.checked)}
          />
          Remove current GIF
        </label>
      )}
      {exercise.source && (
        <a href={exercise.source.url} target="_blank" rel="noreferrer">
          Source: {exercise.source.title ?? exercise.source.url}
        </a>
      )}
      <div className="inline-actions">
        <button
          type="button"
          onClick={() =>
            void run(async () => {
              const replacement = gifFile
                ? await api.uploadGif(gifFile)
                : undefined;
              try {
                await api.updateExercise(exercise.id, {
                  name,
                  exerciseType,
                  instructions: instructions.trim() || null,
                  muscles: exerciseMuscleLinks(selected),
                  mediaId:
                    replacement?.id ??
                    (removeMedia ? null : (exercise.media?.id ?? null)),
                  source: exercise.source
                    ? {
                        url: exercise.source.url,
                        title: exercise.source.title,
                        mediaUrl: exercise.source.mediaUrl,
                      }
                    : null,
                });
              } catch (error) {
                if (replacement)
                  await api.deleteMedia(replacement.id).catch(() => {});
                throw error;
              }
              if (exercise.media && (replacement || removeMedia))
                await api.deleteMedia(exercise.media.id);
              setGifFile(undefined);
              setRemoveMedia(false);
            })
          }
        >
          Save
        </button>
        <button
          className="secondary danger-text"
          type="button"
          onClick={() => void run(() => api.deleteExercise(exercise.id))}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

type MuscleRole = ExerciseInput['muscles'][number]['role'];
type MuscleRoles = Record<string, MuscleRole>;

export function exerciseMuscleLinks(selected: MuscleRoles) {
  return Object.entries(selected).map(([muscleId, role]) => ({
    muscleId,
    role,
  }));
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
  return (
    <div className="muscle-role-grid" aria-label="Exercise muscle roles">
      {muscles.map((muscle) => (
        <label key={muscle.id}>
          {muscle.name}
          <select
            aria-label={`${muscle.name} role`}
            value={selected[muscle.id] ?? ''}
            onChange={(event) => {
              const next = { ...selected };
              if (event.target.value) {
                next[muscle.id] = event.target.value as MuscleRole;
              } else {
                delete next[muscle.id];
              }
              onChange(next);
            }}
          >
            <option value="">Not used</option>
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
          </select>
        </label>
      ))}
    </div>
  );
}
