import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

import type {
  Exercise,
  Muscle,
  SyncOperation,
  Workout,
  WorkoutTemplate,
} from '@spotter/shared';

export interface OutboxRecord extends SyncOperation {
  attempts: number;
  lastError: string | null;
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
    indexes: { 'by-created-at': string };
  };
  muscles: { key: string; value: Muscle };
  exercises: { key: string; value: Exercise };
  templates: { key: string; value: WorkoutTemplate };
  metadata: { key: string; value: MetadataRecord };
}

let databasePromise: Promise<IDBPDatabase<SpotterDatabaseSchema>> | undefined;

function database() {
  databasePromise ??= openDB<SpotterDatabaseSchema>('spotter', 1, {
    upgrade(db) {
      const workouts = db.createObjectStore('workouts', { keyPath: 'id' });
      workouts.createIndex('by-status', 'status');
      const outbox = db.createObjectStore('outbox', { keyPath: 'operationId' });
      outbox.createIndex('by-created-at', 'createdAt');
      db.createObjectStore('muscles', { keyPath: 'id' });
      db.createObjectStore('exercises', { keyPath: 'id' });
      db.createObjectStore('templates', { keyPath: 'id' });
      db.createObjectStore('metadata', { keyPath: 'key' });
    },
  });
  return databasePromise;
}

export const localRepository = {
  async saveWorkout(workout: Workout): Promise<OutboxRecord> {
    const db = await database();
    const transaction = db.transaction(['workouts', 'outbox'], 'readwrite');
    const operation: OutboxRecord = {
      operationId: crypto.randomUUID(),
      kind: 'upsert_workout',
      createdAt: new Date().toISOString(),
      workout,
      attempts: 0,
      lastError: null,
    };
    await Promise.all([
      transaction.objectStore('workouts').put(workout),
      transaction.objectStore('outbox').put(operation),
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

  async outbox(limit = 50): Promise<OutboxRecord[]> {
    const records = await (
      await database()
    ).getAllFromIndex('outbox', 'by-created-at');
    return records.slice(0, limit);
  },

  async acknowledge(operationId: string): Promise<void> {
    await (await database()).delete('outbox', operationId);
  },

  async fail(operationId: string, message: string): Promise<void> {
    const db = await database();
    const record = await db.get('outbox', operationId);
    if (!record) return;
    await db.put('outbox', {
      ...record,
      attempts: record.attempts + 1,
      lastError: message,
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

  async resetConnectionForTests() {
    const db = await databasePromise;
    db?.close();
    databasePromise = undefined;
  },
};
