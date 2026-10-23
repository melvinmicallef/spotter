import 'fake-indexeddb/auto';

import { deleteDB, openDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';

import type { Workout } from '@spotter/shared';

import { localRepository } from './db.js';

afterEach(async () => {
  await localRepository.resetConnectionForTests();
  await deleteDB('spotter-v2');
});

describe('local workout repository', () => {
  it('starts in a new store without replaying operations from the old namespace', async () => {
    const previous = await openDB('spotter', 1, {
      upgrade(database) {
        database.createObjectStore('outbox', { keyPath: 'operationId' });
      },
    });
    await previous.put('outbox', {
      operationId: crypto.randomUUID(),
      kind: 'delete_workout',
      workoutId: crypto.randomUUID(),
    });
    previous.close();

    expect(await localRepository.outbox()).toEqual([]);
    await deleteDB('spotter');
  });

  it('atomically stores a workout and its outbox operation', async () => {
    const workout = exampleWorkout();
    const operation = await localRepository.saveWorkout(workout);

    expect(await localRepository.activeWorkout()).toEqual(workout);
    expect(await localRepository.outbox()).toEqual([operation]);
    expect(operation).toMatchObject({
      kind: 'upsert_workout',
      workout: { id: workout.id },
    });
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
      (await localRepository.outbox()).map((entry) =>
        entry.kind === 'upsert_workout' ? entry.workout.notes : null,
      ),
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

  it('persists completed days per active template and ISO week', async () => {
    const templateId = crypto.randomUUID();
    await localRepository.saveWeekProgress(templateId, '2026-W43', {
      completedDays: [1, 5],
    });
    await localRepository.resetConnectionForTests();

    expect(await localRepository.weekProgress(templateId, '2026-W43')).toEqual({
      completedDays: [1, 5],
    });
    expect(await localRepository.weekProgress(templateId, '2026-W44')).toEqual({
      completedDays: [],
    });
  });

  it('marks a template day complete atomically with the finished workout', async () => {
    const workout = exampleWorkout();
    workout.templateId = crypto.randomUUID();
    workout.templateDay = 3;
    workout.status = 'completed';
    workout.completedAt = new Date().toISOString();
    await localRepository.saveWorkout(workout, '2026-W43');

    expect(
      await localRepository.weekProgress(workout.templateId, '2026-W43'),
    ).toEqual({ completedDays: [3] });
    expect(
      await localRepository.weekProgress(workout.templateId, '2026-W44'),
    ).toEqual({ completedDays: [] });
  });

  it('deletes a cancelled workout and leaves an ordered server tombstone', async () => {
    const workout = exampleWorkout();
    await localRepository.saveWorkout(workout);
    await localRepository.cancelWorkout(workout.id);

    expect(await localRepository.activeWorkout()).toBeUndefined();
    expect(await localRepository.workouts()).toEqual([]);
    expect(await localRepository.outbox()).toMatchObject([
      { kind: 'delete_workout', workoutId: workout.id },
    ]);
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
