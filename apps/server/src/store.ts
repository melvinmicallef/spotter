import { randomUUID } from 'node:crypto';

import type {
  AppSettings,
  AppSettingsInput,
  CompletedWorkoutEdit,
  Exercise,
  ExerciseInput,
  ExerciseMedia,
  ExerciseType,
  Muscle,
  ReferenceData,
  SyncOperation,
  SyncResponse,
  Workout,
  WorkoutTemplate,
  WorkoutTemplateInput,
} from '@spotter/shared';

import type { SpotterDatabase } from './database.js';
import { AppError, isSqliteConstraint } from './errors.js';

type Row = Record<string, unknown>;

function legacyExerciseType(type: ExerciseType): 'strength' | 'cardio' {
  return type === 'calisthenics' ? 'strength' : type;
}

export interface MediaInput {
  id: string;
  mimeType: ExerciseMedia['mimeType'];
  byteSize: number;
  originalName: string;
}

export class SpotterStore {
  constructor(private readonly database: SpotterDatabase) {}

  listMuscles(): Muscle[] {
    return this.database
      .prepare(
        `SELECT * FROM muscles
         WHERE is_builtin = 1
         ORDER BY group_order, muscle_order, name COLLATE NOCASE`,
      )
      .all()
      .map((row) => mapMuscle(row as Row));
  }

  listExercises(): Exercise[] {
    return this.database
      .prepare(
        `SELECT exercises.*, exercise_images.mime_type AS image_mime_type,
          exercise_images.byte_size AS image_byte_size,
          exercise_images.original_name AS image_original_name,
          exercise_images.created_at AS image_created_at
         FROM exercises LEFT JOIN exercise_images ON exercise_images.id = exercises.image_id
         ORDER BY exercises.name COLLATE NOCASE`,
      )
      .all()
      .map((row) => this.mapExercise(row as Row));
  }

  createExercise(input: ExerciseInput): Exercise {
    const id = input.id ?? randomUUID();
    const now = new Date().toISOString();
    try {
      this.database.transaction(() => {
        this.database
          .prepare(
            `INSERT INTO exercises
             (id, name, exercise_type, exercise_category, preparation, execution, comments, image_id, source_url, source_title,
              source_media_url, source_imported_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            input.name,
            legacyExerciseType(input.exerciseType),
            input.exerciseType,
            input.preparation,
            input.execution,
            input.comments,
            input.mediaId,
            input.referenceUrl ?? input.source?.url ?? null,
            input.source?.title ?? null,
            input.source?.mediaUrl ?? null,
            input.source ? now : null,
            now,
            now,
          );
        this.replaceExerciseMuscles(id, input.muscles);
        this.incrementReferenceRevision();
      })();
    } catch (error) {
      throw this.constraintError(
        error,
        'Exercise name or muscle reference is invalid',
      );
    }
    return this.getExercise(id);
  }

  updateExercise(id: string, input: ExerciseInput): Exercise {
    try {
      this.database.transaction(() => {
        this.assertExerciseTypeChangeIsCompatible(id, input.exerciseType);
        const result = this.database
          .prepare(
            `UPDATE exercises SET name = ?, exercise_type = ?, exercise_category = ?, preparation = ?, execution = ?, comments = ?, image_id = ?,
             source_url = ?, source_title = ?, source_media_url = ?,
             source_imported_at = ?, updated_at = ? WHERE id = ?`,
          )
          .run(
            input.name,
            legacyExerciseType(input.exerciseType),
            input.exerciseType,
            input.preparation,
            input.execution,
            input.comments,
            input.mediaId,
            input.referenceUrl ?? input.source?.url ?? null,
            input.source?.title ?? null,
            input.source?.mediaUrl ?? null,
            input.source ? new Date().toISOString() : null,
            new Date().toISOString(),
            id,
          );
        if (result.changes === 0)
          throw new AppError(404, 'NOT_FOUND', 'Exercise not found');
        this.replaceExerciseMuscles(id, input.muscles);
        this.incrementReferenceRevision();
      })();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw this.constraintError(
        error,
        'Exercise name or muscle reference is invalid',
      );
    }
    return this.getExercise(id);
  }

  deleteExercise(id: string): ExerciseMedia | null {
    const imageId = (
      this.database
        .prepare('SELECT image_id FROM exercises WHERE id = ?')
        .get(id) as { image_id: string | null } | undefined
    )?.image_id;
    const media = imageId ? this.getMedia(imageId) : null;
    try {
      this.database.transaction(() => {
        const result = this.database
          .prepare('DELETE FROM exercises WHERE id = ?')
          .run(id);
        if (result.changes === 0)
          throw new AppError(404, 'NOT_FOUND', 'Exercise not found');
        this.incrementReferenceRevision();
      })();
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (isSqliteConstraint(error)) {
        throw new AppError(
          409,
          'DEPENDENCY_EXISTS',
          'Exercise is still used by a template',
        );
      }
      throw error;
    }
    return media;
  }

  createMedia(input: MediaInput): ExerciseMedia {
    const createdAt = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO exercise_images
         (id, mime_type, byte_size, original_name, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.mimeType,
        input.byteSize,
        input.originalName,
        createdAt,
      );
    return this.getMedia(input.id);
  }

  getMedia(id: string): ExerciseMedia {
    const row = this.database
      .prepare('SELECT * FROM exercise_images WHERE id = ?')
      .get(id) as Row | undefined;
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Exercise media not found');
    return mapMedia(row);
  }

  getSettings(): AppSettings {
    const row = this.database
      .prepare('SELECT stretching_poster_id FROM app_settings WHERE id = 1')
      .get() as Row | undefined;
    if (!row) throw new Error('Application settings row is missing');
    const posterId = nullableString(row.stretching_poster_id);
    return { stretchingPoster: posterId ? this.getMedia(posterId) : null };
  }

  updateSettings(input: AppSettingsInput): AppSettings {
    if (input.stretchingPosterId) this.getMedia(input.stretchingPosterId);
    this.database
      .prepare('UPDATE app_settings SET stretching_poster_id = ? WHERE id = 1')
      .run(input.stretchingPosterId);
    return this.getSettings();
  }

  mediaIsReferenced(id: string): boolean {
    return Boolean(
      this.database
        .prepare(
          `SELECT 1 FROM exercises WHERE image_id = ?
           UNION ALL
           SELECT 1 FROM app_settings WHERE stretching_poster_id = ?
           LIMIT 1`,
        )
        .get(id, id),
    );
  }

  deleteMedia(id: string): ExerciseMedia {
    const media = this.getMedia(id);
    if (this.mediaIsReferenced(id))
      throw new AppError(
        409,
        'DEPENDENCY_EXISTS',
        'Image is still assigned to an exercise or setting',
      );
    this.database.transaction(() => {
      this.database.prepare('DELETE FROM exercise_images WHERE id = ?').run(id);
      this.incrementReferenceRevision();
    })();
    return media;
  }

  listTemplates(): WorkoutTemplate[] {
    return this.database
      .prepare('SELECT * FROM workout_templates ORDER BY name COLLATE NOCASE')
      .all()
      .map((row) => this.mapTemplate(row as Row));
  }

  createTemplate(input: WorkoutTemplateInput): WorkoutTemplate {
    const id = input.id ?? randomUUID();
    const now = new Date().toISOString();
    try {
      this.database.transaction(() => {
        const hasActive = this.database
          .prepare('SELECT 1 FROM workout_templates WHERE is_active = 1')
          .get();
        const isActive = input.isActive || !hasActive;
        if (isActive)
          this.database
            .prepare(
              'UPDATE workout_templates SET is_active = 0, active_since = NULL',
            )
            .run();
        this.database
          .prepare(
            `INSERT INTO workout_templates
             (id, name, is_active, active_since, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            input.name,
            Number(isActive),
            isActive ? now : null,
            input.notes,
            now,
            now,
          );
        this.replaceTemplateDayNames(id, input.dayNames ?? []);
        this.replaceTemplateExercises(id, input.exercises);
        this.incrementReferenceRevision();
      })();
    } catch (error) {
      throw this.constraintError(
        error,
        'Template name or exercise reference is invalid',
      );
    }
    return this.getTemplate(id);
  }

  updateTemplate(id: string, input: WorkoutTemplateInput): WorkoutTemplate {
    try {
      this.database.transaction(() => {
        const existing = this.database
          .prepare(
            'SELECT is_active, active_since FROM workout_templates WHERE id = ?',
          )
          .get(id) as
          { is_active: number; active_since: string | null } | undefined;
        if (!existing)
          throw new AppError(404, 'NOT_FOUND', 'Template not found');
        const isActive = input.isActive || Boolean(existing.is_active);
        const activeSince = isActive
          ? existing.is_active
            ? (existing.active_since ?? new Date().toISOString())
            : new Date().toISOString()
          : null;
        if (isActive)
          this.database
            .prepare(
              `UPDATE workout_templates
               SET is_active = 0, active_since = NULL WHERE id <> ?`,
            )
            .run(id);
        const result = this.database
          .prepare(
            `UPDATE workout_templates
             SET name = ?, is_active = ?, active_since = ?, notes = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run(
            input.name,
            Number(isActive),
            activeSince,
            input.notes,
            new Date().toISOString(),
            id,
          );
        if (result.changes === 0)
          throw new AppError(404, 'NOT_FOUND', 'Template not found');
        if (input.dayNames !== undefined)
          this.replaceTemplateDayNames(id, input.dayNames);
        this.replaceTemplateExercises(id, input.exercises);
        this.incrementReferenceRevision();
      })();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw this.constraintError(
        error,
        'Template name or exercise reference is invalid',
      );
    }
    return this.getTemplate(id);
  }

  duplicateTemplate(id: string): WorkoutTemplate {
    const source = this.getTemplate(id);
    return this.createTemplate({
      name: this.availableTemplateCopyName(source.name),
      isActive: false,
      notes: null,
      dayNames: source.dayNames ?? [],
      exercises: source.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        dayOfWeek: exercise.dayOfWeek,
        targetSets: exercise.targetSets,
        targetReps: exercise.targetReps,
        targetDurationSeconds: exercise.targetDurationSeconds,
        cardioMode: exercise.cardioMode,
        intervalPrepSeconds: exercise.intervalPrepSeconds,
        intervalWorkSeconds: exercise.intervalWorkSeconds,
        intervalRestSeconds: exercise.intervalRestSeconds,
        intervalIterations: exercise.intervalIterations,
        targetDistance: exercise.targetDistance,
        targetDistanceUnit: exercise.targetDistanceUnit,
      })),
    });
  }

  deleteTemplate(id: string): void {
    this.database.transaction(() => {
      const wasActive = this.database
        .prepare('SELECT is_active FROM workout_templates WHERE id = ?')
        .get(id) as { is_active: number } | undefined;
      const result = this.database
        .prepare('DELETE FROM workout_templates WHERE id = ?')
        .run(id);
      if (result.changes === 0)
        throw new AppError(404, 'NOT_FOUND', 'Template not found');
      if (wasActive?.is_active)
        this.database
          .prepare(
            `UPDATE workout_templates SET is_active = 1, active_since = ?
             WHERE id = (
               SELECT id FROM workout_templates ORDER BY created_at, id LIMIT 1
             )`,
          )
          .run(new Date().toISOString());
      this.incrementReferenceRevision();
    })();
  }

  getReferenceData(cursor?: number): ReferenceData {
    const row = this.database
      .prepare(
        "SELECT value FROM app_metadata WHERE key = 'reference_revision'",
      )
      .get() as Row;
    const revision = Number(row.value);
    if (cursor === revision) {
      return {
        revision,
        changed: false,
        muscles: [],
        exercises: [],
        templates: [],
      };
    }
    return {
      revision,
      changed: true,
      muscles: this.listMuscles(),
      exercises: this.listExercises(),
      templates: this.listTemplates(),
    };
  }

  listWorkouts(): Workout[] {
    return this.database
      .prepare('SELECT * FROM workout_sessions ORDER BY started_at DESC')
      .all()
      .map((row) => this.mapWorkout(row as Row));
  }

  getWorkout(id: string): Workout {
    const row = this.database
      .prepare('SELECT * FROM workout_sessions WHERE id = ?')
      .get(id) as Row | undefined;
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Workout not found');
    return this.mapWorkout(row);
  }

  updateCompletedWorkout(id: string, input: CompletedWorkoutEdit): Workout {
    this.database.transaction(() => {
      const workout = this.getWorkout(id);
      if (workout.status !== 'completed')
        throw new AppError(
          409,
          'WORKOUT_NOT_COMPLETED',
          'Only completed workouts can be edited in history',
        );

      if (
        input.exercises.length !== workout.exercises.length ||
        input.exercises.some(
          (exercise, index) => exercise.id !== workout.exercises[index]?.id,
        )
      ) {
        throw new AppError(
          400,
          'WORKOUT_EXERCISES_IMMUTABLE',
          'History edits cannot add, remove, or reorder exercises',
        );
      }

      const existingSetOwner = new Map(
        workout.exercises.flatMap((exercise) =>
          exercise.sets.map((set) => [set.id, exercise.id] as const),
        ),
      );
      const submittedSetIds = new Set<string>();
      const hasSetWithOtherMeasurement = input.exercises.some((edited) => {
        const exercise = workout.exercises.find(
          (entry) => entry.id === edited.id,
        )!;
        return edited.sets.some(
          (set) =>
            (exercise.exerciseType === 'cardio' &&
              (set.reps !== null || set.weight !== null)) ||
            (exercise.exerciseType !== 'cardio' &&
              (set.durationSeconds !== null || set.distance !== null)) ||
            (exercise.exerciseType === 'calisthenics' && set.weight !== null),
        );
      });
      if (hasSetWithOtherMeasurement) {
        throw new AppError(
          400,
          'INVALID_WORKOUT_SET',
          'A set can only contain measurements supported by its exercise type',
        );
      }

      const findExistingSet = this.database.prepare(
        'SELECT workout_exercise_id FROM workout_sets WHERE id = ?',
      );
      for (const exercise of input.exercises) {
        for (const set of exercise.sets) {
          if (submittedSetIds.has(set.id))
            throw new AppError(
              400,
              'DUPLICATE_WORKOUT_SET',
              'Set IDs must be unique within a workout',
            );
          submittedSetIds.add(set.id);
          const originalOwner = existingSetOwner.get(set.id);
          if (originalOwner && originalOwner !== exercise.id)
            throw new AppError(
              400,
              'INVALID_WORKOUT_SET',
              'A set cannot be moved to another exercise',
            );
          if (!originalOwner && findExistingSet.get(set.id))
            throw new AppError(
              409,
              'WORKOUT_SET_ID_EXISTS',
              'This set ID already belongs to another workout',
            );
        }
      }

      const deleteSets = this.database.prepare(
        'DELETE FROM workout_sets WHERE workout_exercise_id = ?',
      );
      const insertSet = this.database.prepare(
        `INSERT INTO workout_sets
         (id, workout_exercise_id, position, reps, weight, weight_unit,
          duration_seconds, distance, distance_unit, notes, completed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const edited of input.exercises) {
        const original = workout.exercises.find(
          (exercise) => exercise.id === edited.id,
        )!;
        const originalSets = new Map(original.sets.map((set) => [set.id, set]));
        deleteSets.run(edited.id);
        edited.sets.forEach((set, position) => {
          const originalSet = originalSets.get(set.id);
          insertSet.run(
            set.id,
            edited.id,
            position,
            set.reps,
            set.weight,
            set.weightUnit,
            set.durationSeconds,
            set.distance,
            set.distanceUnit,
            originalSet?.notes ?? null,
            Number(originalSet?.completed ?? true),
          );
        });
      }

      const updatedAt = new Date(
        Math.max(Date.now(), Date.parse(workout.updatedAt) + 1),
      ).toISOString();
      this.database
        .prepare('UPDATE workout_sessions SET updated_at = ? WHERE id = ?')
        .run(updatedAt, id);
    })();
    return this.getWorkout(id);
  }

  deleteWorkout(id: string): void {
    this.database.transaction(() => {
      const row = this.database
        .prepare('SELECT status FROM workout_sessions WHERE id = ?')
        .get(id) as { status: string } | undefined;
      // Completed workouts may still be present in a device's local history
      // after the canonical server row has been removed. Treat repeated
      // deletion as success so the client can clear that stale local copy.
      if (!row) return;
      if (row.status !== 'completed')
        throw new AppError(
          409,
          'WORKOUT_IN_PROGRESS',
          'An in-progress workout cannot be deleted from history',
        );
      this.database
        .prepare('DELETE FROM workout_sessions WHERE id = ?')
        .run(id);
    })();
  }

  applySyncOperation(
    operation: SyncOperation,
  ): SyncResponse['results'][number] {
    return this.database.transaction(() => {
      const seen = this.database
        .prepare('SELECT 1 FROM processed_operations WHERE operation_id = ?')
        .get(operation.operationId);
      if (seen)
        return {
          operationId: operation.operationId,
          status: 'duplicate' as const,
        };
      if (operation.kind === 'upsert_workout') {
        this.upsertWorkout(operation.workout);
      } else {
        this.database
          .prepare('DELETE FROM workout_sessions WHERE id = ?')
          .run(operation.workoutId);
      }
      this.database
        .prepare(
          'INSERT INTO processed_operations (operation_id, processed_at) VALUES (?, ?)',
        )
        .run(operation.operationId, new Date().toISOString());
      return { operationId: operation.operationId, status: 'applied' as const };
    })();
  }

  close(): void {
    this.database.close();
  }

  private getExercise(id: string): Exercise {
    const row = this.database
      .prepare(
        `SELECT exercises.*, exercise_images.mime_type AS image_mime_type,
          exercise_images.byte_size AS image_byte_size,
          exercise_images.original_name AS image_original_name,
          exercise_images.created_at AS image_created_at
         FROM exercises LEFT JOIN exercise_images ON exercise_images.id = exercises.image_id
         WHERE exercises.id = ?`,
      )
      .get(id) as Row | undefined;
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Exercise not found');
    return this.mapExercise(row);
  }

  private getTemplate(id: string): WorkoutTemplate {
    const row = this.database
      .prepare('SELECT * FROM workout_templates WHERE id = ?')
      .get(id) as Row | undefined;
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Template not found');
    return this.mapTemplate(row);
  }

  private mapExercise(row: Row): Exercise {
    const muscles = this.database
      .prepare(
        `SELECT muscles.id, muscles.name, muscles.group_name,
          muscles.subgroup_name, exercise_muscles.role
         FROM exercise_muscles JOIN muscles ON muscles.id = exercise_muscles.muscle_id
         WHERE exercise_muscles.exercise_id = ?
         ORDER BY exercise_muscles.role, muscles.name COLLATE NOCASE`,
      )
      .all(row.id)
      .map((muscle) => ({
        id: String((muscle as Row).id),
        name: String((muscle as Row).name),
        group: String((muscle as Row).group_name),
        subgroup: nullableString((muscle as Row).subgroup_name),
        role: (muscle as Row).role as 'primary' | 'secondary',
      }));
    return {
      id: String(row.id),
      name: String(row.name),
      exerciseType: row.exercise_category as Exercise['exerciseType'],
      preparation: nullableString(row.preparation),
      execution: nullableString(row.execution),
      comments: nullableString(row.comments),
      referenceUrl: nullableString(row.source_url),
      muscles,
      media: row.image_id
        ? {
            id: String(row.image_id),
            kind: 'image',
            url: `/api/media/${String(row.image_id)}`,
            mimeType: row.image_mime_type as ExerciseMedia['mimeType'],
            byteSize: Number(row.image_byte_size),
            originalName: String(row.image_original_name),
            createdAt: String(row.image_created_at),
          }
        : null,
      source:
        row.source_url && row.source_imported_at
          ? {
              url: String(row.source_url),
              title: nullableString(row.source_title),
              mediaUrl: nullableString(row.source_media_url),
              importedAt: String(row.source_imported_at),
            }
          : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapTemplate(row: Row): WorkoutTemplate {
    const dayNames = this.database
      .prepare(
        `SELECT day_of_week, name FROM template_day_names
         WHERE template_id = ? ORDER BY day_of_week`,
      )
      .all(row.id)
      .map((dayName) => ({
        dayOfWeek: Number((dayName as Row).day_of_week),
        name: String((dayName as Row).name),
      }));
    const exercises = this.database
      .prepare(
        `SELECT template_exercises.*, exercises.name AS exercise_name,
          exercises.exercise_category AS exercise_type,
          exercises.source_url AS reference_url
         FROM template_exercises JOIN exercises ON exercises.id = template_exercises.exercise_id
         WHERE template_exercises.template_id = ?
         ORDER BY template_exercises.day_of_week, template_exercises.position`,
      )
      .all(row.id)
      .map((entry) => ({
        id: String((entry as Row).id),
        exerciseId: String((entry as Row).exercise_id),
        exerciseName: String((entry as Row).exercise_name),
        exerciseType: (entry as Row).exercise_type as Exercise['exerciseType'],
        referenceUrl: nullableString((entry as Row).reference_url),
        dayOfWeek: Number((entry as Row).day_of_week),
        position: Number((entry as Row).position),
        targetSets: nullableNumber((entry as Row).target_sets),
        targetReps: nullableNumber((entry as Row).target_reps),
        targetDurationSeconds: nullableNumber(
          (entry as Row).target_duration_seconds,
        ),
        cardioMode: ((entry as Row).cardio_mode ?? 'duration') as
          'duration' | 'interval',
        intervalPrepSeconds: nullableNumber(
          (entry as Row).interval_prep_seconds,
        ),
        intervalWorkSeconds: nullableNumber(
          (entry as Row).interval_work_seconds,
        ),
        intervalRestSeconds: nullableNumber(
          (entry as Row).interval_rest_seconds,
        ),
        intervalIterations: nullableNumber((entry as Row).interval_iterations),
        targetDistance: nullableNumber((entry as Row).target_distance),
        targetDistanceUnit: (entry as Row).target_distance_unit as 'km' | 'mi',
      }));
    return {
      id: String(row.id),
      name: String(row.name),
      isActive: Boolean(row.is_active),
      activeSince: nullableString(row.active_since),
      notes: nullableString(row.notes),
      dayNames,
      exercises,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapWorkout(row: Row): Workout {
    const exercises = this.database
      .prepare(
        'SELECT * FROM workout_exercises WHERE workout_id = ? ORDER BY position',
      )
      .all(row.id)
      .map((entry) => {
        const exercise = entry as Row;
        const sets = this.database
          .prepare(
            'SELECT * FROM workout_sets WHERE workout_exercise_id = ? ORDER BY position',
          )
          .all(exercise.id)
          .map((setRow) => ({
            id: String((setRow as Row).id),
            position: Number((setRow as Row).position),
            reps: nullableNumber((setRow as Row).reps),
            weight: nullableNumber((setRow as Row).weight),
            weightUnit: (setRow as Row).weight_unit as 'kg' | 'lb',
            durationSeconds: nullableNumber((setRow as Row).duration_seconds),
            distance: nullableNumber((setRow as Row).distance),
            distanceUnit: (setRow as Row).distance_unit as 'km' | 'mi',
            notes: nullableString((setRow as Row).notes),
            completed: Boolean((setRow as Row).completed),
          }));
        return {
          id: String(exercise.id),
          exerciseId: nullableString(exercise.exercise_id),
          exerciseName: String(exercise.exercise_name),
          exerciseType: exercise.exercise_category as Exercise['exerciseType'],
          referenceUrl: nullableString(exercise.reference_url),
          position: Number(exercise.position),
          notes: nullableString(exercise.notes),
          targetSets: nullableNumber(exercise.target_sets),
          targetReps: nullableNumber(exercise.target_reps),
          targetDurationSeconds: nullableNumber(
            exercise.target_duration_seconds,
          ),
          cardioMode: (exercise.cardio_mode ?? 'duration') as
            'duration' | 'interval',
          intervalPrepSeconds: nullableNumber(exercise.interval_prep_seconds),
          intervalWorkSeconds: nullableNumber(exercise.interval_work_seconds),
          intervalRestSeconds: nullableNumber(exercise.interval_rest_seconds),
          intervalIterations: nullableNumber(exercise.interval_iterations),
          targetDistance: nullableNumber(exercise.target_distance),
          targetDistanceUnit: exercise.target_distance_unit as 'km' | 'mi',
          completed: Boolean(exercise.completed),
          sets,
        };
      });
    return {
      id: String(row.id),
      templateId: nullableString(row.template_id),
      templateDay: nullableNumber(row.template_day),
      templateDayName: nullableString(row.template_day_name),
      name: String(row.name),
      status: row.status as Workout['status'],
      startedAt: String(row.started_at),
      completedAt: nullableString(row.completed_at),
      notes: nullableString(row.notes),
      updatedAt: String(row.updated_at),
      exercises,
    };
  }

  private replaceExerciseMuscles(
    id: string,
    muscles: ExerciseInput['muscles'],
  ) {
    this.database
      .prepare('DELETE FROM exercise_muscles WHERE exercise_id = ?')
      .run(id);
    const insert = this.database.prepare(
      'INSERT INTO exercise_muscles (exercise_id, muscle_id, role) VALUES (?, ?, ?)',
    );
    for (const muscle of muscles) insert.run(id, muscle.muscleId, muscle.role);
  }

  private replaceTemplateExercises(
    id: string,
    exercises: WorkoutTemplateInput['exercises'],
  ) {
    const findExercise = this.database.prepare(
      'SELECT exercise_category FROM exercises WHERE id = ?',
    );
    for (const exercise of exercises) {
      const catalogueExercise = findExercise.get(exercise.exerciseId) as
        { exercise_category: ExerciseType } | undefined;
      if (!catalogueExercise) continue;
      this.assertTemplateTargetsMatchType(
        catalogueExercise.exercise_category,
        exercise,
      );
    }
    this.database
      .prepare('DELETE FROM template_exercises WHERE template_id = ?')
      .run(id);
    const insert = this.database.prepare(
      `INSERT INTO template_exercises
       (id, template_id, exercise_id, day_of_week, position,
        target_sets, target_reps, target_duration_seconds, target_distance,
        target_distance_unit, cardio_mode, interval_prep_seconds,
        interval_work_seconds, interval_rest_seconds, interval_iterations)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const positions = new Map<number, number>();
    exercises.forEach((exercise) => {
      const position = positions.get(exercise.dayOfWeek) ?? 0;
      positions.set(exercise.dayOfWeek, position + 1);
      insert.run(
        exercise.id ?? randomUUID(),
        id,
        exercise.exerciseId,
        exercise.dayOfWeek,
        position,
        exercise.targetSets,
        exercise.targetReps,
        exercise.targetDurationSeconds,
        exercise.targetDistance,
        exercise.targetDistanceUnit,
        exercise.cardioMode ?? 'duration',
        exercise.intervalPrepSeconds ?? null,
        exercise.intervalWorkSeconds ?? null,
        exercise.intervalRestSeconds ?? null,
        exercise.intervalIterations ?? null,
      );
    });
  }

  private replaceTemplateDayNames(
    id: string,
    dayNames: NonNullable<WorkoutTemplateInput['dayNames']>,
  ) {
    this.database
      .prepare('DELETE FROM template_day_names WHERE template_id = ?')
      .run(id);
    const insert = this.database.prepare(
      `INSERT INTO template_day_names (template_id, day_of_week, name)
       VALUES (?, ?, ?)`,
    );
    for (const dayName of dayNames)
      insert.run(id, dayName.dayOfWeek, dayName.name);
  }

  private assertExerciseTypeChangeIsCompatible(
    id: string,
    exerciseType: ExerciseType,
  ) {
    const current = this.database
      .prepare('SELECT exercise_category FROM exercises WHERE id = ?')
      .get(id) as { exercise_category: ExerciseType } | undefined;
    if (!current || current.exercise_category === exerciseType) return;

    const incompatible = this.database
      .prepare(
        exerciseType === 'cardio'
          ? `SELECT 1 FROM template_exercises
             WHERE exercise_id = ?
               AND (target_sets IS NOT NULL OR target_reps IS NOT NULL)
             LIMIT 1`
          : `SELECT 1 FROM template_exercises
             WHERE exercise_id = ?
               AND (target_duration_seconds IS NOT NULL OR target_distance IS NOT NULL
                 OR interval_prep_seconds IS NOT NULL OR interval_work_seconds IS NOT NULL
                 OR interval_rest_seconds IS NOT NULL OR interval_iterations IS NOT NULL)
             LIMIT 1`,
      )
      .get(id);
    if (incompatible) {
      throw new AppError(
        409,
        'EXERCISE_TYPE_CONFLICT',
        'Update the exercise targets in its templates before changing its type',
        { exerciseId: id, exerciseType },
      );
    }
  }

  private assertTemplateTargetsMatchType(
    exerciseType: ExerciseType,
    exercise: WorkoutTemplateInput['exercises'][number],
  ) {
    const hasStrengthTargets =
      exercise.targetSets !== null || exercise.targetReps !== null;
    const hasCardioTargets =
      exercise.targetDurationSeconds !== null ||
      exercise.targetDistance !== null ||
      exercise.intervalPrepSeconds != null ||
      exercise.intervalWorkSeconds != null ||
      exercise.intervalRestSeconds != null ||
      exercise.intervalIterations != null;
    if (
      (exerciseType !== 'cardio' && hasCardioTargets) ||
      (exerciseType === 'cardio' && hasStrengthTargets)
    ) {
      throw new AppError(
        400,
        'INVALID_TEMPLATE_TARGETS',
        exerciseType === 'cardio'
          ? 'Cardio exercises use duration or interval settings with optional distance'
          : 'Strength and calisthenics exercises use set and rep targets',
        { exerciseId: exercise.exerciseId, exerciseType },
      );
    }
  }

  private upsertWorkout(workout: Workout) {
    const existing = this.database
      .prepare('SELECT updated_at FROM workout_sessions WHERE id = ?')
      .get(workout.id) as { updated_at: string } | undefined;
    if (existing && existing.updated_at >= workout.updatedAt) return;

    const templateExists = workout.templateId
      ? this.database
          .prepare('SELECT 1 FROM workout_templates WHERE id = ?')
          .get(workout.templateId)
      : false;
    this.database
      .prepare(
        `INSERT INTO workout_sessions
         (id, template_id, template_day, template_day_name, name, status,
          started_at, completed_at, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET template_id = excluded.template_id,
           template_day = excluded.template_day,
           template_day_name = excluded.template_day_name, name = excluded.name,
           status = excluded.status, started_at = excluded.started_at,
           completed_at = excluded.completed_at, notes = excluded.notes, updated_at = excluded.updated_at`,
      )
      .run(
        workout.id,
        templateExists ? workout.templateId : null,
        workout.templateDay,
        workout.templateDayName ?? null,
        workout.name,
        workout.status,
        workout.startedAt,
        workout.completedAt,
        workout.notes,
        workout.updatedAt,
      );
    this.database
      .prepare('DELETE FROM workout_exercises WHERE workout_id = ?')
      .run(workout.id);
    const insertExercise = this.database.prepare(
      `INSERT INTO workout_exercises
       (id, workout_id, exercise_id, exercise_name, exercise_type, exercise_category, reference_url, position,
        notes, target_sets, target_reps, target_duration_seconds,
        target_distance, target_distance_unit, completed, cardio_mode,
        interval_prep_seconds, interval_work_seconds, interval_rest_seconds,
        interval_iterations)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertSet = this.database.prepare(
      `INSERT INTO workout_sets
       (id, workout_exercise_id, position, reps, weight, weight_unit,
        duration_seconds, distance, distance_unit, notes, completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const exercise of workout.exercises) {
      const exerciseExists = exercise.exerciseId
        ? this.database
            .prepare('SELECT 1 FROM exercises WHERE id = ?')
            .get(exercise.exerciseId)
        : false;
      insertExercise.run(
        exercise.id,
        workout.id,
        exerciseExists ? exercise.exerciseId : null,
        exercise.exerciseName,
        legacyExerciseType(exercise.exerciseType),
        exercise.exerciseType,
        exercise.referenceUrl,
        exercise.position,
        exercise.notes,
        exercise.targetSets,
        exercise.targetReps,
        exercise.targetDurationSeconds,
        exercise.targetDistance,
        exercise.targetDistanceUnit,
        Number(exercise.completed ?? false),
        exercise.cardioMode ?? 'duration',
        exercise.intervalPrepSeconds ?? null,
        exercise.intervalWorkSeconds ?? null,
        exercise.intervalRestSeconds ?? null,
        exercise.intervalIterations ?? null,
      );
      for (const set of exercise.sets) {
        insertSet.run(
          set.id,
          exercise.id,
          set.position,
          set.reps,
          set.weight,
          set.weightUnit,
          set.durationSeconds,
          set.distance,
          set.distanceUnit,
          set.notes,
          Number(set.completed),
        );
      }
    }
  }

  private incrementReferenceRevision() {
    this.database
      .prepare(
        "UPDATE app_metadata SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'reference_revision'",
      )
      .run();
  }

  private availableTemplateCopyName(name: string): string {
    let copy = `${name} copy`;
    let suffix = 2;
    while (
      this.database
        .prepare('SELECT 1 FROM workout_templates WHERE name = ?')
        .get(copy)
    ) {
      copy = `${name} copy ${suffix++}`;
    }
    return copy;
  }

  private constraintError(error: unknown, message: string): Error {
    return isSqliteConstraint(error)
      ? new AppError(409, 'CONFLICT', message)
      : (error as Error);
  }
}

function mapMuscle(row: Row): Muscle {
  return {
    id: String(row.id),
    name: String(row.name),
    group: String(row.group_name),
    subgroup: nullableString(row.subgroup_name),
    referenceUrl: nullableString(row.reference_url),
    isBuiltin: Boolean(row.is_builtin),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapMedia(row: Row): ExerciseMedia {
  return {
    id: String(row.id),
    kind: 'image',
    url: `/api/media/${String(row.id)}`,
    mimeType: row.mime_type as ExerciseMedia['mimeType'],
    byteSize: Number(row.byte_size),
    originalName: String(row.original_name),
    createdAt: String(row.created_at),
  };
}

function nullableString(value: unknown): string | null {
  return value == null ? null : String(value);
}

function nullableNumber(value: unknown): number | null {
  return value == null ? null : Number(value);
}
