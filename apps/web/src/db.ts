import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

import type {
  Exercise,
  Muscle,
  SyncOperation,
  Workout,
  WorkoutTemplate,
} from '@spotter/shared';

import {
  completeWeekDay,
  parseWeekProgress,
  weekProgressMetadataKey,
  type WeekProgress,
} from './schedule.js';

export type OutboxRecord = SyncOperation & {
  sequence: number;
  attempts: number;
  failure: OutboxFailure | null;
};

export interface OutboxFailure {
  classification: 'rejected' | 'transient';
  code: string;
  message: string;
  details?: unknown;
}

interface MetadataRecord {
  key: string;
  value: string | number;
}

interface SpotterDatabaseSchema extends DBSchema {
  workouts: {
    key: string;
    value: Workout;
    indexes: { 'by-status': Workout['status'] };
  };
  outbox: {
    key: string;
    value: OutboxRecord;
    indexes: { 'by-sequence': number };
  };
  muscles: { key: string; value: Muscle };
  exercises: { key: string; value: Exercise };
  templates: { key: string; value: WorkoutTemplate };
  metadata: { key: string; value: MetadataRecord };
}

let databasePromise: Promise<IDBPDatabase<SpotterDatabaseSchema>> | undefined;

function database() {
  databasePromise ??= openDB<SpotterDatabaseSchema>('spotter', 7, {
    async upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const workouts = db.createObjectStore('workouts', { keyPath: 'id' });
        workouts.createIndex('by-status', 'status');
        db.createObjectStore('outbox', { keyPath: 'operationId' });
        db.createObjectStore('muscles', { keyPath: 'id' });
        db.createObjectStore('exercises', { keyPath: 'id' });
        db.createObjectStore('templates', { keyPath: 'id' });
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
      if (oldVersion < 2) {
        const outbox = transaction.objectStore('outbox');
        outbox.createIndex('by-sequence', 'sequence', { unique: true });
        const existing = (await outbox.getAll()).sort(
          (left, right) =>
            left.createdAt.localeCompare(right.createdAt) ||
            left.operationId.localeCompare(right.operationId),
        );
        let nextSequence = 1;
        for (const record of existing) {
          await outbox.put({
            ...record,
            sequence: nextSequence++,
            failure: null,
          });
        }
        await transaction.objectStore('metadata').put({
          key: 'nextOutboxSequence',
          value: nextSequence,
        });
      }
      if (oldVersion < 3) {
        const exerciseStore = transaction.objectStore('exercises');
        const cachedExercises = await exerciseStore.getAll();
        const exerciseTypes = new Map<string, Exercise['exerciseType']>();
        for (const exercise of cachedExercises) {
          const normalized = normalizeExercise(exercise);
          exerciseTypes.set(normalized.id, normalized.exerciseType);
          await exerciseStore.put(normalized);
        }

        const templateStore = transaction.objectStore('templates');
        for (const template of await templateStore.getAll()) {
          await templateStore.put(normalizeTemplate(template, exerciseTypes));
        }

        const workoutStore = transaction.objectStore('workouts');
        for (const workout of await workoutStore.getAll()) {
          await workoutStore.put(normalizeWorkout(workout));
        }

        const outboxStore = transaction.objectStore('outbox');
        for (const operation of await outboxStore.getAll()) {
          await outboxStore.put(normalizeOutboxRecord(operation));
        }
      }
      if (oldVersion < 4) {
        const templateStore = transaction.objectStore('templates');
        const cachedTemplates = (await templateStore.getAll()).sort(
          (left, right) =>
            left.createdAt.localeCompare(right.createdAt) ||
            left.id.localeCompare(right.id),
        );
        const hasActive = cachedTemplates.some((template) => template.isActive);
        for (const [index, template] of cachedTemplates.entries()) {
          await templateStore.put({
            ...template,
            isActive: hasActive ? Boolean(template.isActive) : index === 0,
          });
        }
      }
      if (oldVersion < 5) {
        const exerciseStore = transaction.objectStore('exercises');
        for (const exercise of await exerciseStore.getAll()) {
          await exerciseStore.put(normalizeExercise(exercise));
        }
      }
      if (oldVersion < 6) {
        const muscleStore = transaction.objectStore('muscles');
        for (const muscle of await muscleStore.getAll()) {
          await muscleStore.put(normalizeMuscle(muscle));
        }
        const exerciseStore = transaction.objectStore('exercises');
        for (const exercise of await exerciseStore.getAll()) {
          await exerciseStore.put(normalizeExercise(exercise));
        }
        const templateStore = transaction.objectStore('templates');
        const exerciseReferences = new Map(
          (await exerciseStore.getAll()).map((exercise) => [
            exercise.id,
            exercise.referenceUrl,
          ]),
        );
        for (const template of await templateStore.getAll()) {
          await templateStore.put(
            normalizeTemplate(template, new Map(), exerciseReferences),
          );
        }
        const workoutStore = transaction.objectStore('workouts');
        for (const workout of await workoutStore.getAll()) {
          await workoutStore.put(normalizeWorkout(workout));
        }
        const outboxStore = transaction.objectStore('outbox');
        for (const operation of await outboxStore.getAll()) {
          await outboxStore.put(normalizeOutboxRecord(operation));
        }
      }
      if (oldVersion < 7) {
        const workoutStore = transaction.objectStore('workouts');
        for (const workout of await workoutStore.getAll()) {
          await workoutStore.put(normalizeWorkout(workout));
        }
        const outboxStore = transaction.objectStore('outbox');
        for (const operation of await outboxStore.getAll()) {
          await outboxStore.put(normalizeOutboxRecord(operation));
        }
      }
    },
  });
  return databasePromise;
}

export const localRepository = {
  async saveWorkout(
    workout: Workout,
    completionWeekKey?: string,
  ): Promise<OutboxRecord> {
    const db = await database();
    const transaction = db.transaction(
      ['workouts', 'outbox', 'metadata'],
      'readwrite',
    );
    const metadata = transaction.objectStore('metadata');
    const counter = await metadata.get('nextOutboxSequence');
    const sequence =
      typeof counter?.value === 'number' ? counter.value : Date.now();
    const operation: OutboxRecord = {
      operationId: crypto.randomUUID(),
      kind: 'upsert_workout',
      createdAt: new Date().toISOString(),
      workout,
      sequence,
      attempts: 0,
      failure: null,
    };
    if (
      completionWeekKey &&
      workout.status === 'completed' &&
      workout.templateId &&
      workout.templateDay != null
    ) {
      const progressKey = weekProgressMetadataKey(
        workout.templateId,
        completionWeekKey,
      );
      const currentProgress = await metadata.get(progressKey);
      const nextProgress = completeWeekDay(
        parseWeekProgress(currentProgress?.value),
        workout.templateDay,
      );
      await metadata.put({
        key: progressKey,
        value: JSON.stringify(nextProgress),
      });
    }
    await Promise.all([
      transaction.objectStore('workouts').put(workout),
      transaction.objectStore('outbox').put(operation),
      metadata.put({ key: 'nextOutboxSequence', value: sequence + 1 }),
      transaction.done,
    ]);
    return operation;
  },

  async activeWorkout(): Promise<Workout | undefined> {
    return (await database()).getFromIndex(
      'workouts',
      'by-status',
      'in_progress',
    );
  },

  async workouts(): Promise<Workout[]> {
    return (await database()).getAll('workouts');
  },

  async deleteWorkout(id: string): Promise<void> {
    const db = await database();
    const transaction = db.transaction(['workouts', 'outbox'], 'readwrite');
    const outbox = transaction.objectStore('outbox');
    const operations = await outbox.getAll();
    await Promise.all([
      transaction.objectStore('workouts').delete(id),
      ...operations
        .filter((operation) =>
          operation.kind === 'upsert_workout'
            ? operation.workout.id === id
            : operation.workoutId === id,
        )
        .map((operation) => outbox.delete(operation.operationId)),
    ]);
    await transaction.done;
  },

  async cancelWorkout(id: string): Promise<void> {
    const db = await database();
    const transaction = db.transaction(
      ['workouts', 'outbox', 'metadata'],
      'readwrite',
    );
    const outbox = transaction.objectStore('outbox');
    const metadata = transaction.objectStore('metadata');
    const operations = await outbox.getAll();
    const counter = await metadata.get('nextOutboxSequence');
    const sequence =
      typeof counter?.value === 'number' ? counter.value : Date.now();
    const operation: OutboxRecord = {
      operationId: crypto.randomUUID(),
      kind: 'delete_workout',
      createdAt: new Date().toISOString(),
      workoutId: id,
      sequence,
      attempts: 0,
      failure: null,
    };
    await Promise.all([
      transaction.objectStore('workouts').delete(id),
      ...operations
        .filter(
          (candidate) =>
            candidate.kind === 'upsert_workout' && candidate.workout.id === id,
        )
        .map((candidate) => outbox.delete(candidate.operationId)),
      outbox.put(operation),
      metadata.put({ key: 'nextOutboxSequence', value: sequence + 1 }),
      transaction.done,
    ]);
  },

  async outbox(limit = 50): Promise<OutboxRecord[]> {
    const records = await (
      await database()
    ).getAllFromIndex('outbox', 'by-sequence');
    return records.slice(0, limit);
  },

  async acknowledge(operationId: string): Promise<void> {
    await (await database()).delete('outbox', operationId);
  },

  async fail(operationId: string, failure: OutboxFailure): Promise<void> {
    const db = await database();
    const record = await db.get('outbox', operationId);
    if (!record) return;
    await db.put('outbox', {
      ...record,
      attempts: record.attempts + 1,
      failure,
    });
  },

  async referenceRevision(): Promise<number | undefined> {
    const result = await (
      await database()
    ).get('metadata', 'referenceRevision');
    return typeof result?.value === 'number' ? result.value : undefined;
  },

  async replaceReferences(
    revision: number,
    muscles: Muscle[],
    exercises: Exercise[],
    templates: WorkoutTemplate[],
  ): Promise<void> {
    const db = await database();
    const transaction = db.transaction(
      ['muscles', 'exercises', 'templates', 'metadata'],
      'readwrite',
    );
    await Promise.all([
      transaction.objectStore('muscles').clear(),
      transaction.objectStore('exercises').clear(),
      transaction.objectStore('templates').clear(),
    ]);
    for (const muscle of muscles)
      await transaction.objectStore('muscles').put(muscle);
    for (const exercise of exercises)
      await transaction.objectStore('exercises').put(exercise);
    for (const template of templates)
      await transaction.objectStore('templates').put(template);
    await transaction
      .objectStore('metadata')
      .put({ key: 'referenceRevision', value: revision });
    await transaction.done;
  },

  async references() {
    const db = await database();
    const [muscles, exercises, templates] = await Promise.all([
      db.getAll('muscles'),
      db.getAll('exercises'),
      db.getAll('templates'),
    ]);
    return {
      muscles: muscles.map(normalizeMuscle),
      exercises: exercises.map(normalizeExercise),
      templates,
    };
  },

  async weekProgress(
    templateId: string,
    weekKey: string,
  ): Promise<WeekProgress> {
    const record = await (
      await database()
    ).get('metadata', weekProgressMetadataKey(templateId, weekKey));
    return parseWeekProgress(record?.value);
  },

  async saveWeekProgress(
    templateId: string,
    weekKey: string,
    progress: WeekProgress,
  ): Promise<void> {
    const key = weekProgressMetadataKey(templateId, weekKey);
    await (
      await database()
    ).put('metadata', {
      key,
      value: JSON.stringify(progress),
    });
  },

  async resetConnectionForTests() {
    const db = await databasePromise;
    db?.close();
    databasePromise = undefined;
  },
};

function normalizeExercise(exercise: Exercise): Exercise {
  const legacyInstructions = (
    exercise as Exercise & { instructions?: string | null }
  ).instructions;
  const normalized = {
    ...exercise,
    exerciseType: exercise.exerciseType ?? 'strength',
    preparation: exercise.preparation ?? null,
    execution: exercise.execution ?? legacyInstructions ?? null,
    comments: exercise.comments ?? null,
    referenceUrl: exercise.referenceUrl ?? exercise.source?.url ?? null,
  };
  delete (normalized as typeof normalized & { instructions?: unknown })
    .instructions;
  return normalized;
}

function normalizeTemplate(
  template: WorkoutTemplate,
  exerciseTypes: Map<string, Exercise['exerciseType']>,
  exerciseReferences: Map<string, string | null> = new Map(),
): WorkoutTemplate {
  return {
    ...template,
    isActive: template.isActive ?? false,
    dayNames: template.dayNames ?? [],
    exercises: template.exercises.map((entry) => ({
      ...entry,
      exerciseType:
        entry.exerciseType ?? exerciseTypes.get(entry.exerciseId) ?? 'strength',
      referenceUrl:
        entry.referenceUrl ?? exerciseReferences.get(entry.exerciseId) ?? null,
      dayOfWeek: entry.dayOfWeek ?? 1,
      targetDurationSeconds: entry.targetDurationSeconds ?? null,
      cardioMode: entry.cardioMode ?? 'duration',
      intervalPrepSeconds: entry.intervalPrepSeconds ?? null,
      intervalWorkSeconds: entry.intervalWorkSeconds ?? null,
      intervalRestSeconds: entry.intervalRestSeconds ?? null,
      intervalIterations: entry.intervalIterations ?? null,
      targetDistance: entry.targetDistance ?? null,
      targetDistanceUnit: entry.targetDistanceUnit ?? 'km',
    })),
  };
}

function normalizeWorkout(workout: Workout): Workout {
  return {
    ...workout,
    templateDay: workout.templateDay ?? null,
    templateDayName: workout.templateDayName ?? null,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      completed: exercise.completed ?? false,
      exerciseType: exercise.exerciseType ?? 'strength',
      referenceUrl: exercise.referenceUrl ?? null,
      targetDurationSeconds: exercise.targetDurationSeconds ?? null,
      cardioMode: exercise.cardioMode ?? 'duration',
      intervalPrepSeconds: exercise.intervalPrepSeconds ?? null,
      intervalWorkSeconds: exercise.intervalWorkSeconds ?? null,
      intervalRestSeconds: exercise.intervalRestSeconds ?? null,
      intervalIterations: exercise.intervalIterations ?? null,
      targetDistance: exercise.targetDistance ?? null,
      targetDistanceUnit: exercise.targetDistanceUnit ?? 'km',
      sets: exercise.sets.map((set) => ({
        ...set,
        durationSeconds: set.durationSeconds ?? null,
        distance: set.distance ?? null,
        distanceUnit: set.distanceUnit ?? 'km',
      })),
    })),
  };
}

function normalizeOutboxRecord(operation: OutboxRecord): OutboxRecord {
  return operation.kind === 'upsert_workout'
    ? { ...operation, workout: normalizeWorkout(operation.workout) }
    : operation;
}

function normalizeMuscle(muscle: Muscle): Muscle {
  return {
    ...muscle,
    group: muscle.group ?? 'Legacy',
    subgroup: muscle.subgroup ?? null,
    referenceUrl: muscle.referenceUrl ?? null,
    isBuiltin: muscle.isBuiltin ?? false,
  };
}
