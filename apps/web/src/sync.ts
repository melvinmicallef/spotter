import { api } from './api.js';
import { localRepository } from './db.js';

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
  return localRepository.references();
}

export interface SyncState {
  pending: number;
  error: string | null;
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

  while (records.length > 0) {
    try {
      const response = await api.sync({
        operations: records.map((record) => ({
          operationId: record.operationId,
          kind: record.kind,
          createdAt: record.createdAt,
          workout: record.workout,
        })),
      });
      for (const result of response.results) {
        if (result.status === 'applied' || result.status === 'duplicate') {
          await localRepository.acknowledge(result.operationId);
        } else {
          const message = result.error?.message ?? 'Synchronization rejected';
          await localRepository.fail(result.operationId, message);
          error = message;
        }
      }
      if (response.results.some((result) => result.status === 'rejected'))
        break;
    } catch (caught) {
      error =
        caught instanceof Error ? caught.message : 'Synchronization failed';
      await localRepository.fail(records[0]!.operationId, error);
      retryAfterMs = Math.min(30_000, 1_000 * 2 ** records[0]!.attempts);
      break;
    }
    records = await localRepository.outbox();
  }

  return {
    pending: (await localRepository.outbox(Number.MAX_SAFE_INTEGER)).length,
    error,
    retryAfterMs,
  };
}
