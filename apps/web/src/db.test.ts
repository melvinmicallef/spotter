import 'fake-indexeddb/auto';

import { deleteDB } from 'idb';
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
