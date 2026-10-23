import { ApiClientError, api } from '../../shared/api.js';
import { localRepository } from './db.js';
import type { OutboxFailure } from './db.js';

export async function refreshReferences() {
  const cursor = await localRepository.referenceRevision();
  const result = await api.reference(cursor);
  if (result.changed) {
    await localRepository.replaceReferences(
      result.revision,
      result.muscles,
      result.exercises,
      result.templates,
    );
  }
  const references = await localRepository.references();
  await cacheExerciseMedia(references.exercises);
  return references;
}

async function cacheExerciseMedia(
  exercises: Awaited<
    ReturnType<typeof localRepository.references>
  >['exercises'],
) {
  if (!('caches' in globalThis)) return;
  const cache = await caches.open('spotter-exercise-media-v1');
  await Promise.all(
    exercises.flatMap((exercise) =>
      exercise.media
        ? [
            cache.match(exercise.media.url).then(async (cached) => {
              if (cached) return;
              const response = await fetch(exercise.media!.url);
              if (response.ok) await cache.put(exercise.media!.url, response);
            }),
          ]
        : [],
    ),
  );
}

export interface SyncState {
  pending: number;
  error: string | null;
  failures: OutboxFailure[];
  retryAfterMs: number | null;
}

let activeDrain: Promise<SyncState> | undefined;

export function drainOutbox(): Promise<SyncState> {
  activeDrain ??= drain().finally(() => {
    activeDrain = undefined;
  });
  return activeDrain;
}

async function drain(): Promise<SyncState> {
  let records = await localRepository.outbox();
  let error: string | null = null;
  let retryAfterMs: number | null = null;
  const failures: OutboxFailure[] = [];

  while (records.length > 0) {
    try {
      const response = await api.sync({
        operations: [records[0]!].map((record) =>
          record.kind === 'upsert_workout'
            ? {
                operationId: record.operationId,
                kind: record.kind,
                createdAt: record.createdAt,
                workout: record.workout,
              }
            : {
                operationId: record.operationId,
                kind: record.kind,
                createdAt: record.createdAt,
                workoutId: record.workoutId,
              },
        ),
      });
      for (const result of response.results) {
        if (result.status === 'applied' || result.status === 'duplicate') {
          await localRepository.acknowledge(result.operationId);
        } else {
          const failure: OutboxFailure = {
            classification: 'rejected',
            code: result.error?.code ?? 'SYNC_REJECTED',
            message: result.error?.message ?? 'Synchronization rejected',
            details: result.error?.details,
          };
          await localRepository.fail(result.operationId, failure);
          failures.push(failure);
          error = failure.message;
        }
      }
      if (response.results.some((result) => result.status === 'rejected'))
        break;
    } catch (caught) {
      const transient =
        !(caught instanceof ApiClientError) ||
        caught.status === 408 ||
        caught.status === 429 ||
        caught.status >= 500;
      const failure: OutboxFailure = {
        classification: transient ? 'transient' : 'rejected',
        code: caught instanceof ApiClientError ? caught.code : 'NETWORK_ERROR',
        message:
          caught instanceof Error ? caught.message : 'Synchronization failed',
        details: caught instanceof ApiClientError ? caught.details : undefined,
      };
      error = failure.message;
      failures.push(failure);
      await localRepository.fail(records[0]!.operationId, failure);
      if (transient)
        retryAfterMs = Math.min(30_000, 1_000 * 2 ** records[0]!.attempts);
      break;
    }
    records = await localRepository.outbox();
  }

  return {
    pending: (await localRepository.outbox(Number.MAX_SAFE_INTEGER)).length,
    error,
    failures,
    retryAfterMs,
  };
}
