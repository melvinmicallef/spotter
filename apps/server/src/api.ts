import { randomUUID } from 'node:crypto';

import { Router, raw } from 'express';
import { z } from 'zod';

import {
  appSettingsInputSchema,
  appSettingsSchema,
  exerciseInputSchema,
  exerciseMediaSchema,
  syncOperationSchema,
  uuidSchema,
  workoutTemplateInputSchema,
} from '@spotter/shared';

import { AppError } from './errors.js';
import { isSupportedImageMimeType, MAX_IMAGE_BYTES } from './media.js';
import type { MediaStorage } from './media.js';
import type { SpotterStore } from './store.js';

interface ApiRouterOptions {
  mediaStorage?: MediaStorage;
}

export function createApiRouter(
  store: SpotterStore,
  options: ApiRouterOptions = {},
): Router {
  const router = Router();

  router.get('/settings', (_request, response) =>
    response.json(appSettingsSchema.parse(store.getSettings())),
  );
  router.put('/settings', (request, response) => {
    const input = appSettingsInputSchema.parse(request.body);
    const previousPoster = store.getSettings().stretchingPoster;
    const settings = store.updateSettings(input);
    if (
      previousPoster &&
      previousPoster.id !== settings.stretchingPoster?.id &&
      !store.mediaIsReferenced(previousPoster.id)
    ) {
      const removed = store.deleteMedia(previousPoster.id);
      options.mediaStorage?.remove(removed.id, removed.mimeType);
    }
    response.json(appSettingsSchema.parse(settings));
  });

  router.get('/muscles', (_request, response) =>
    response.json(store.listMuscles()),
  );

  router.get('/exercises', (_request, response) =>
    response.json(store.listExercises()),
  );
  router.post('/exercises', (request, response) => {
    response
      .status(201)
      .json(store.createExercise(exerciseInputSchema.parse(request.body)));
  });
  router.patch('/exercises/:id', (request, response) => {
    response.json(
      store.updateExercise(
        uuidSchema.parse(request.params.id),
        exerciseInputSchema.parse(request.body),
      ),
    );
  });
  router.delete('/exercises/:id', (request, response) => {
    const media = store.deleteExercise(uuidSchema.parse(request.params.id));
    if (media && !store.mediaIsReferenced(media.id)) {
      store.deleteMedia(media.id);
      options.mediaStorage?.remove(media.id, media.mimeType);
    }
    response.status(204).end();
  });

  router.post(
    '/media/image',
    raw({
      type: ['image/gif', 'image/png', 'image/jpeg'],
      limit: MAX_IMAGE_BYTES,
    }),
    (request, response) => {
      if (!options.mediaStorage)
        throw new AppError(
          503,
          'MEDIA_UNAVAILABLE',
          'Media storage is unavailable',
        );
      const mimeType = request.header('content-type')?.split(';')[0]?.trim();
      if (!Buffer.isBuffer(request.body) || !isSupportedImageMimeType(mimeType))
        throw new AppError(
          415,
          'INVALID_MEDIA_TYPE',
          'Upload a GIF, PNG, or JPEG using its matching image content type',
        );
      const id = randomUUID();
      options.mediaStorage.store(id, request.body, mimeType);
      try {
        const media = store.createMedia({
          id,
          mimeType,
          byteSize: request.body.byteLength,
          originalName: options.mediaStorage.safeOriginalName(
            request.header('x-file-name'),
            mimeType,
          ),
        });
        response.status(201).json(exerciseMediaSchema.parse(media));
      } catch (error) {
        options.mediaStorage.remove(id, mimeType);
        throw error;
      }
    },
  );
  router.get('/media/:id', (request, response) => {
    if (!options.mediaStorage)
      throw new AppError(
        503,
        'MEDIA_UNAVAILABLE',
        'Media storage is unavailable',
      );
    const id = uuidSchema.parse(request.params.id);
    const media = store.getMedia(id);
    response
      .set({
        'Content-Type': media.mimeType,
        'Content-Length': String(media.byteSize),
        'Cache-Control': 'public, max-age=31536000, immutable',
      })
      .send(options.mediaStorage.read(id, media.mimeType));
  });
  router.delete('/media/:id', (request, response) => {
    if (!options.mediaStorage)
      throw new AppError(
        503,
        'MEDIA_UNAVAILABLE',
        'Media storage is unavailable',
      );
    const id = uuidSchema.parse(request.params.id);
    const media = store.deleteMedia(id);
    options.mediaStorage.remove(id, media.mimeType);
    response.status(204).end();
  });

  router.get('/templates', (_request, response) =>
    response.json(store.listTemplates()),
  );
  router.post('/templates', (request, response) => {
    response
      .status(201)
      .json(
        store.createTemplate(workoutTemplateInputSchema.parse(request.body)),
      );
  });
  router.patch('/templates/:id', (request, response) => {
    response.json(
      store.updateTemplate(
        uuidSchema.parse(request.params.id),
        workoutTemplateInputSchema.parse(request.body),
      ),
    );
  });
  router.post('/templates/:id/duplicate', (request, response) => {
    response
      .status(201)
      .json(store.duplicateTemplate(uuidSchema.parse(request.params.id)));
  });
  router.delete('/templates/:id', (request, response) => {
    store.deleteTemplate(uuidSchema.parse(request.params.id));
    response.status(204).end();
  });

  router.get('/reference', (request, response) => {
    const cursor = z.coerce
      .number()
      .int()
      .nonnegative()
      .optional()
      .parse(request.query.cursor);
    response.json(store.getReferenceData(cursor));
  });

  router.get('/workouts', (_request, response) =>
    response.json(store.listWorkouts()),
  );
  router.get('/workouts/:id', (request, response) => {
    response.json(store.getWorkout(uuidSchema.parse(request.params.id)));
  });
  router.delete('/workouts/:id', (request, response) => {
    store.deleteWorkout(uuidSchema.parse(request.params.id));
    response.status(204).end();
  });
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
