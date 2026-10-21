import { randomUUID } from 'node:crypto';

import type {
  Exercise,
  ExerciseInput,
  ExerciseMedia,
  Muscle,
  MuscleInput,
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

export interface MediaInput {
  id: string;
  kind: 'gif';
  mimeType: 'image/gif';
  byteSize: number;
  originalName: string;
}

export class SpotterStore {
  constructor(private readonly database: SpotterDatabase) {}

  listMuscles(): Muscle[] {
    return this.database
      .prepare('SELECT * FROM muscles ORDER BY name COLLATE NOCASE')
      .all()
      .map((row) => mapMuscle(row as Row));
  }

  createMuscle(input: MuscleInput): Muscle {
    const id = input.id ?? randomUUID();
    const now = new Date().toISOString();
    try {
      this.database.transaction(() => {
        this.database
          .prepare(
            'INSERT INTO muscles (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
          )
          .run(id, input.name, now, now);
        this.incrementReferenceRevision();
      })();
    } catch (error) {
      throw this.constraintError(
        error,
        'A muscle with this name already exists',
      );
    }
    return this.getMuscle(id);
  }

  updateMuscle(id: string, input: MuscleInput): Muscle {
    try {
      this.database.transaction(() => {
        const update = this.database
          .prepare('UPDATE muscles SET name = ?, updated_at = ? WHERE id = ?')
          .run(input.name, new Date().toISOString(), id);
        if (update.changes === 0)
          throw new AppError(404, 'NOT_FOUND', 'Muscle not found');
        this.incrementReferenceRevision();
      })();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw this.constraintError(
        error,
        'A muscle with this name already exists',
      );
    }
    return this.getMuscle(id);
  }

  deleteMuscle(id: string): void {
    try {
      this.database.transaction(() => {
        const result = this.database
          .prepare('DELETE FROM muscles WHERE id = ?')
          .run(id);
        if (result.changes === 0)
          throw new AppError(404, 'NOT_FOUND', 'Muscle not found');
        this.incrementReferenceRevision();
      })();
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (isSqliteConstraint(error)) {
        throw new AppError(
          409,
          'DEPENDENCY_EXISTS',
          'Muscle is still used by an exercise',
        );
      }
      throw error;
    }
  }

  listExercises(): Exercise[] {
    return this.database
      .prepare(
        `SELECT exercises.*, exercise_media.byte_size AS media_byte_size,
          exercise_media.original_name AS media_original_name,
          exercise_media.created_at AS media_created_at
         FROM exercises LEFT JOIN exercise_media ON exercise_media.id = exercises.media_id
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
             (id, name, instructions, media_id, source_url, source_title,
              source_media_url, source_imported_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            input.name,
            input.instructions,
            input.mediaId,
            input.source?.url ?? null,
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
        const result = this.database
          .prepare(
            `UPDATE exercises SET name = ?, instructions = ?, media_id = ?,
             source_url = ?, source_title = ?, source_media_url = ?,
             source_imported_at = ?, updated_at = ? WHERE id = ?`,
          )
          .run(
            input.name,
            input.instructions,
            input.mediaId,
            input.source?.url ?? null,
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

  deleteExercise(id: string): string | null {
    const mediaId = (
      this.database
        .prepare('SELECT media_id FROM exercises WHERE id = ?')
        .get(id) as { media_id: string | null } | undefined
    )?.media_id;
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
    return mediaId ?? null;
  }

  createMedia(input: MediaInput): ExerciseMedia {
    const createdAt = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO exercise_media
         (id, kind, mime_type, byte_size, original_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.kind,
        input.mimeType,
        input.byteSize,
        input.originalName,
        createdAt,
      );
    return this.getMedia(input.id);
  }

  getMedia(id: string): ExerciseMedia {
    const row = this.database
      .prepare('SELECT * FROM exercise_media WHERE id = ?')
      .get(id) as Row | undefined;
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Exercise media not found');
    return mapMedia(row);
  }

  deleteMedia(id: string): ExerciseMedia {
    const media = this.getMedia(id);
    this.database.transaction(() => {
      this.database.prepare('DELETE FROM exercise_media WHERE id = ?').run(id);
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
        this.database
          .prepare(
            'INSERT INTO workout_templates (id, name, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          )
          .run(id, input.name, input.notes, now, now);
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
        const result = this.database
          .prepare(
            'UPDATE workout_templates SET name = ?, notes = ?, updated_at = ? WHERE id = ?',
          )
          .run(input.name, input.notes, new Date().toISOString(), id);
        if (result.changes === 0)
          throw new AppError(404, 'NOT_FOUND', 'Template not found');
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
      notes: source.notes,
      exercises: source.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        notes: exercise.notes,
        targetSets: exercise.targetSets,
        targetReps: exercise.targetReps,
      })),
    });
  }

  deleteTemplate(id: string): void {
    this.database.transaction(() => {
      const result = this.database
        .prepare('DELETE FROM workout_templates WHERE id = ?')
        .run(id);
      if (result.changes === 0)
        throw new AppError(404, 'NOT_FOUND', 'Template not found');
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
      this.upsertWorkout(operation.workout);
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

  private getMuscle(id: string): Muscle {
    const row = this.database
      .prepare('SELECT * FROM muscles WHERE id = ?')
      .get(id) as Row | undefined;
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Muscle not found');
    return mapMuscle(row);
  }

  private getExercise(id: string): Exercise {
    const row = this.database
      .prepare(
        `SELECT exercises.*, exercise_media.byte_size AS media_byte_size,
          exercise_media.original_name AS media_original_name,
          exercise_media.created_at AS media_created_at
         FROM exercises LEFT JOIN exercise_media ON exercise_media.id = exercises.media_id
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
        `SELECT muscles.id, muscles.name, exercise_muscles.role
         FROM exercise_muscles JOIN muscles ON muscles.id = exercise_muscles.muscle_id
         WHERE exercise_muscles.exercise_id = ?
         ORDER BY exercise_muscles.role, muscles.name COLLATE NOCASE`,
      )
      .all(row.id)
      .map((muscle) => ({
        id: String((muscle as Row).id),
        name: String((muscle as Row).name),
        role: (muscle as Row).role as 'primary' | 'secondary',
      }));
    return {
      id: String(row.id),
      name: String(row.name),
      instructions: nullableString(row.instructions),
      muscles,
      media: row.media_id
        ? {
            id: String(row.media_id),
            kind: 'gif',
            url: `/api/media/${String(row.media_id)}`,
            mimeType: 'image/gif',
            byteSize: Number(row.media_byte_size),
            originalName: String(row.media_original_name),
            createdAt: String(row.media_created_at),
          }
        : null,
      source: row.source_url
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
    const exercises = this.database
      .prepare(
        `SELECT template_exercises.*, exercises.name AS exercise_name
         FROM template_exercises JOIN exercises ON exercises.id = template_exercises.exercise_id
         WHERE template_exercises.template_id = ? ORDER BY template_exercises.position`,
      )
      .all(row.id)
      .map((entry) => ({
        id: String((entry as Row).id),
        exerciseId: String((entry as Row).exercise_id),
        exerciseName: String((entry as Row).exercise_name),
        position: Number((entry as Row).position),
        notes: nullableString((entry as Row).notes),
        targetSets: nullableNumber((entry as Row).target_sets),
        targetReps: nullableNumber((entry as Row).target_reps),
      }));
    return {
      id: String(row.id),
      name: String(row.name),
      notes: nullableString(row.notes),
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
            notes: nullableString((setRow as Row).notes),
            completed: Boolean((setRow as Row).completed),
          }));
        return {
          id: String(exercise.id),
          exerciseId: nullableString(exercise.exercise_id),
          exerciseName: String(exercise.exercise_name),
          position: Number(exercise.position),
          notes: nullableString(exercise.notes),
          targetSets: nullableNumber(exercise.target_sets),
          targetReps: nullableNumber(exercise.target_reps),
          sets,
        };
      });
    return {
      id: String(row.id),
      templateId: nullableString(row.template_id),
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
    this.database
      .prepare('DELETE FROM template_exercises WHERE template_id = ?')
      .run(id);
    const insert = this.database.prepare(
      `INSERT INTO template_exercises
       (id, template_id, exercise_id, position, notes, target_sets, target_reps)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    exercises.forEach((exercise, position) =>
      insert.run(
        exercise.id ?? randomUUID(),
        id,
        exercise.exerciseId,
        position,
        exercise.notes,
        exercise.targetSets,
        exercise.targetReps,
      ),
    );
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
         (id, template_id, name, status, started_at, completed_at, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET template_id = excluded.template_id, name = excluded.name,
           status = excluded.status, started_at = excluded.started_at,
           completed_at = excluded.completed_at, notes = excluded.notes, updated_at = excluded.updated_at`,
      )
      .run(
        workout.id,
        templateExists ? workout.templateId : null,
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
       (id, workout_id, exercise_id, exercise_name, position, notes, target_sets, target_reps)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertSet = this.database.prepare(
      `INSERT INTO workout_sets
       (id, workout_exercise_id, position, reps, weight, weight_unit, notes, completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
        exercise.position,
        exercise.notes,
        exercise.targetSets,
        exercise.targetReps,
      );
      for (const set of exercise.sets) {
        insertSet.run(
          set.id,
          exercise.id,
          set.position,
          set.reps,
          set.weight,
          set.weightUnit,
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
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapMedia(row: Row): ExerciseMedia {
  return {
    id: String(row.id),
    kind: 'gif',
    url: `/api/media/${String(row.id)}`,
    mimeType: 'image/gif',
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
