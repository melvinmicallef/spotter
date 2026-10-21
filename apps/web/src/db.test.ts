import 'fake-indexeddb/auto';

import { deleteDB, openDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';

import type { Workout } from '@spotter/shared';

import { localRepository } from './db.js';

afterEach(async () => {
  await localRepository.resetConnectionForTests();
  await deleteDB('spotter');
});

describe('local workout repository', () => {
  it('atomically stores a workout and its outbox operation', async () => {
    const workout = exampleWorkout();
    const operation = await localRepository.saveWorkout(workout);

    expect(await localRepository.activeWorkout()).toEqual(workout);
    expect(await localRepository.outbox()).toEqual([operation]);
    expect(operation.workout.id).toBe(workout.id);
  });

  it('orders rapid writes by a durable sequence rather than timestamp ties', async () => {
    const first = exampleWorkout();
    const second = { ...first, notes: 'second edit' };
    const [firstOperation, secondOperation] = await Promise.all([
      localRepository.saveWorkout(first),
      localRepository.saveWorkout(second),
    ]);

    expect(firstOperation.sequence).toBeLessThan(secondOperation.sequence);
    expect(
      (await localRepository.outbox()).map((entry) => entry.workout.notes),
    ).toEqual([null, 'second edit']);
    expect((await localRepository.activeWorkout())?.notes).toBe('second edit');
  });

  it('replaces reference data and retains its revision', async () => {
    const now = new Date().toISOString();
    await localRepository.replaceReferences(
      7,
      [
        {
          id: crypto.randomUUID(),
          name: 'Back',
          createdAt: now,
          updatedAt: now,
        },
      ],
      [],
      [],
    );
    expect(await localRepository.referenceRevision()).toBe(7);
    expect((await localRepository.references()).muscles[0]?.name).toBe('Back');
  });

  it('persists session, exercise, and set notes for offline reload', async () => {
    const workout = exampleWorkout();
    workout.notes = 'Session note';
    workout.exercises = [
      {
        id: crypto.randomUUID(),
        exerciseId: null,
        exerciseName: 'Snapshot exercise',
        position: 0,
        notes: 'Exercise note',
        targetSets: null,
        targetReps: null,
        sets: [
          {
            id: crypto.randomUUID(),
            position: 0,
            reps: 8,
            weight: 40,
            weightUnit: 'kg',
            notes: 'Set note',
            completed: true,
          },
        ],
      },
    ];
    await localRepository.saveWorkout(workout);
    await localRepository.resetConnectionForTests();

    const restored = await localRepository.activeWorkout();
    expect(restored?.notes).toBe('Session note');
    expect(restored?.exercises[0]?.notes).toBe('Exercise note');
    expect(restored?.exercises[0]?.sets[0]?.notes).toBe('Set note');
  });

  it('upgrades version-one outbox records into deterministic sequence order', async () => {
    const workout = exampleWorkout();
    const operationId = crypto.randomUUID();
    const legacy = await openDB('spotter', 1, {
      upgrade(database) {
        const workouts = database.createObjectStore('workouts', {
          keyPath: 'id',
        });
        workouts.createIndex('by-status', 'status');
        const outbox = database.createObjectStore('outbox', {
          keyPath: 'operationId',
        });
        outbox.createIndex('by-created-at', 'createdAt');
        database.createObjectStore('muscles', { keyPath: 'id' });
        database.createObjectStore('exercises', { keyPath: 'id' });
        database.createObjectStore('templates', { keyPath: 'id' });
        database.createObjectStore('metadata', { keyPath: 'key' });
      },
    });
    await legacy.put('outbox', {
      operationId,
      kind: 'upsert_workout',
      createdAt: workout.updatedAt,
      workout,
      attempts: 2,
      lastError: 'offline',
    });
    legacy.close();

    const records = await localRepository.outbox();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      operationId,
      sequence: 1,
      failure: null,
    });
  });
});

function exampleWorkout(): Workout {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    templateId: null,
    name: 'Offline workout',
    status: 'in_progress',
    startedAt: now,
    completedAt: null,
    notes: null,
    updatedAt: now,
    exercises: [],
  };
}
