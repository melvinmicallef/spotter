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
} from '../workouts/schedule.js';

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
  databasePromise ??= openDB<SpotterDatabaseSchema>('spotter-v2', 1, {
    upgrade(db) {
      const workouts = db.createObjectStore('workouts', { keyPath: 'id' });
      workouts.createIndex('by-status', 'status');
      const outbox = db.createObjectStore('outbox', {
        keyPath: 'operationId',
      });
      outbox.createIndex('by-sequence', 'sequence', { unique: true });
      db.createObjectStore('muscles', { keyPath: 'id' });
      db.createObjectStore('exercises', { keyPath: 'id' });
      db.createObjectStore('templates', { keyPath: 'id' });
      db.createObjectStore('metadata', { keyPath: 'key' });
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
    return { muscles, exercises, templates };
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
