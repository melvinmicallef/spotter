import 'fake-indexeddb/auto';

import { deleteDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Workout } from '@spotter/shared';

import { localRepository } from './db.js';
import { drainOutbox } from './sync.js';

afterEach(async () => {
  vi.unstubAllGlobals();
  await localRepository.resetConnectionForTests();
  await deleteDB('spotter');
});

describe('outbox synchronization', () => {
  it('removes only acknowledged operations', async () => {
    const operation = await localRepository.saveWorkout(exampleWorkout());
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            results: [
              { operationId: operation.operationId, status: 'applied' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    expect(await drainOutbox()).toEqual({
      pending: 0,
      error: null,
      retryAfterMs: null,
    });
    expect(await localRepository.outbox()).toHaveLength(0);
  });

  it('keeps rejected operations with a visible error', async () => {
    const operation = await localRepository.saveWorkout(exampleWorkout());
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            results: [
              {
                operationId: operation.operationId,
                status: 'rejected',
                error: {
                  code: 'INVALID_WORKOUT',
                  message: 'Workout is invalid',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    expect(await drainOutbox()).toEqual({
      pending: 1,
      error: 'Workout is invalid',
      retryAfterMs: null,
    });
    expect((await localRepository.outbox())[0]?.lastError).toBe(
      'Workout is invalid',
    );
  });

  it('classifies network failures for automatic backoff', async () => {
    await localRepository.saveWorkout(exampleWorkout());
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Network unavailable')),
    );

    expect(await drainOutbox()).toEqual({
      pending: 1,
      error: 'Network unavailable',
      retryAfterMs: 1_000,
    });
    expect((await localRepository.outbox())[0]?.attempts).toBe(1);
  });
});

function exampleWorkout(): Workout {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    templateId: null,
    name: 'Workout',
    status: 'completed',
    startedAt: now,
    completedAt: now,
    notes: null,
    updatedAt: now,
    exercises: [],
  };
}
