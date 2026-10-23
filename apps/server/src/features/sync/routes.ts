import { Router } from 'express';
import { z } from 'zod';

import { syncOperationSchema, uuidSchema } from '@spotter/shared';

import { AppError } from '../../errors.js';
import type { SpotterStore } from '../../persistence/store.js';

export function createSyncRouter(store: SpotterStore): Router {
  const router = Router();

  router.post('/sync', (request, response) => {
    const batch = z
      .object({ operations: z.array(z.unknown()).min(1).max(50) })
      .parse(request.body);
    const results = batch.operations.map((candidate) => {
      const identity = z
        .object({ operationId: uuidSchema })
        .safeParse(candidate);
      if (!identity.success) {
        throw new AppError(
          400,
          'INVALID_SYNC_OPERATION',
          'Every synchronization operation requires a valid operation ID',
          identity.error.flatten(),
        );
      }
      const parsed = syncOperationSchema.safeParse(candidate);
      if (!parsed.success) {
        return {
          operationId: identity.data.operationId,
          status: 'rejected' as const,
          error: {
            code: 'INVALID_SYNC_OPERATION',
            message: 'The workout change is invalid and needs attention',
            details: parsed.error.flatten(),
          },
        };
      }
      const operation = parsed.data;
      try {
        return store.applySyncOperation(operation);
      } catch (error) {
        if (error instanceof AppError) {
          return {
            operationId: operation.operationId,
            status: 'rejected' as const,
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
            },
          };
        }
        throw error;
      }
    });
    response.json({ results });
  });

  return router;
}
