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
          group: 'Back',
          subgroup: null,
          referenceUrl: 'https://exrx.net/Lists/Directory',
          isBuiltin: true,
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

  it('persists schedule swaps per active template and ISO week', async () => {
    const templateId = crypto.randomUUID();
    await localRepository.saveWeekSchedule(templateId, '2026-W43', {
      1: 5,
      5: 1,
    });
    await localRepository.resetConnectionForTests();

    expect(await localRepository.weekSchedule(templateId, '2026-W43')).toEqual({
      1: 5,
      5: 1,
    });
    expect(await localRepository.weekSchedule(templateId, '2026-W44')).toEqual(
      {},
    );
  });

  it('persists session, exercise, and set notes for offline reload', async () => {
    const workout = exampleWorkout();
    workout.notes = 'Session note';
    workout.exercises = [
      {
        id: crypto.randomUUID(),
        exerciseId: null,
        exerciseName: 'Snapshot exercise',
        exerciseType: 'strength',
        referenceUrl: null,
        position: 0,
        notes: 'Exercise note',
        targetSets: null,
        targetReps: null,
        targetDurationSeconds: null,
        targetDistance: null,
        targetDistanceUnit: 'km',
        sets: [
          {
            id: crypto.randomUUID(),
            position: 0,
            reps: 8,
            weight: 40,
            weightUnit: 'kg',
            durationSeconds: null,
            distance: null,
            distanceUnit: 'km',
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

  it('upgrades cached version-two data to the typed weekly model', async () => {
    const now = new Date().toISOString();
    const exerciseId = crypto.randomUUID();
    const templateId = crypto.randomUUID();
    const workoutId = crypto.randomUUID();
    const legacy = await openDB('spotter', 2, {
      upgrade(database) {
        const workouts = database.createObjectStore('workouts', {
          keyPath: 'id',
        });
        workouts.createIndex('by-status', 'status');
        const outbox = database.createObjectStore('outbox', {
          keyPath: 'operationId',
        });
        outbox.createIndex('by-sequence', 'sequence', { unique: true });
        database.createObjectStore('muscles', { keyPath: 'id' });
        database.createObjectStore('exercises', { keyPath: 'id' });
        database.createObjectStore('templates', { keyPath: 'id' });
        database.createObjectStore('metadata', { keyPath: 'key' });
      },
    });
    await legacy.put('exercises', {
      id: exerciseId,
      name: 'Legacy lift',
      instructions: 'Legacy setup and movement',
      muscles: [],
      media: null,
      source: null,
      createdAt: now,
      updatedAt: now,
    });
    await legacy.put('templates', {
      id: templateId,
      name: 'Legacy plan',
      notes: null,
      exercises: [
        {
          id: crypto.randomUUID(),
          exerciseId,
          exerciseName: 'Legacy lift',
          position: 0,
          notes: null,
          targetSets: 2,
          targetReps: 8,
        },
      ],
      createdAt: now,
      updatedAt: now,
    });
    const legacyWorkout = {
      id: workoutId,
      templateId,
      name: 'Legacy workout',
      status: 'in_progress',
      startedAt: now,
      completedAt: null,
      notes: null,
      updatedAt: now,
      exercises: [
        {
          id: crypto.randomUUID(),
          exerciseId,
          exerciseName: 'Legacy lift',
          position: 0,
          notes: null,
          targetSets: 1,
          targetReps: 5,
          sets: [
            {
              id: crypto.randomUUID(),
              position: 0,
              reps: 5,
              weight: 80,
              weightUnit: 'kg',
              notes: null,
              completed: false,
            },
          ],
        },
      ],
    };
    await legacy.put('workouts', legacyWorkout);
    await legacy.put('outbox', {
      operationId: crypto.randomUUID(),
      kind: 'upsert_workout',
      createdAt: now,
      workout: legacyWorkout,
      sequence: 1,
      attempts: 0,
      failure: null,
    });
    legacy.close();

    const references = await localRepository.references();
    expect(references.exercises[0]).toMatchObject({
      exerciseType: 'strength',
      preparation: null,
      execution: 'Legacy setup and movement',
    });
    expect(references.templates[0]?.exercises[0]).toMatchObject({
      exerciseType: 'strength',
      dayOfWeek: 1,
      targetDurationSeconds: null,
      targetDistance: null,
      targetDistanceUnit: 'km',
    });
    expect(references.templates[0]?.isActive).toBe(true);
    expect((await localRepository.activeWorkout())?.exercises[0]).toMatchObject(
      {
        exerciseType: 'strength',
        targetDurationSeconds: null,
        targetDistance: null,
      },
    );
    expect((await localRepository.outbox())[0]?.workout.templateDay).toBeNull();
  });

  it('upgrades a version-three cache with exactly one active template', async () => {
    const now = new Date().toISOString();
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    const legacy = await openDB('spotter', 3, {
      upgrade(database) {
        const workouts = database.createObjectStore('workouts', {
          keyPath: 'id',
        });
        workouts.createIndex('by-status', 'status');
        const outbox = database.createObjectStore('outbox', {
          keyPath: 'operationId',
        });
        outbox.createIndex('by-sequence', 'sequence', { unique: true });
        database.createObjectStore('muscles', { keyPath: 'id' });
        database.createObjectStore('exercises', { keyPath: 'id' });
        database.createObjectStore('templates', { keyPath: 'id' });
        database.createObjectStore('metadata', { keyPath: 'key' });
      },
    });
    await legacy.put('templates', {
      id: secondId,
      name: 'Later plan',
      notes: null,
      exercises: [],
      createdAt: '2026-10-21T10:00:00.000Z',
      updatedAt: now,
    });
    await legacy.put('templates', {
      id: firstId,
      name: 'Earlier plan',
      notes: null,
      exercises: [],
      createdAt: '2026-10-20T10:00:00.000Z',
      updatedAt: now,
    });
    legacy.close();

    const templates = (await localRepository.references()).templates;
    expect(templates.filter((template) => template.isActive)).toHaveLength(1);
    expect(templates.find((template) => template.isActive)?.id).toBe(firstId);
  });
});

function exampleWorkout(): Workout {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    templateId: null,
    templateDay: null,
    name: 'Offline workout',
    status: 'in_progress',
    startedAt: now,
    completedAt: null,
    notes: null,
    updatedAt: now,
    exercises: [],
  };
}
