import { randomUUID } from 'node:crypto';

import { Router, raw } from 'express';

import { exerciseMediaSchema, uuidSchema } from '@spotter/shared';

import { AppError } from '../../errors.js';
import type { SpotterStore } from '../../persistence/store.js';
import { isSupportedImageMimeType, MAX_IMAGE_BYTES } from './storage.js';
import type { MediaStorage } from './storage.js';

export function createMediaRouter(
  store: SpotterStore,
  mediaStorage?: MediaStorage,
): Router {
  const router = Router();

  router.post(
    '/media/image',
    raw({
      type: ['image/gif', 'image/png', 'image/jpeg'],
      limit: MAX_IMAGE_BYTES,
    }),
    (request, response) => {
      if (!mediaStorage)
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
      mediaStorage.store(id, request.body, mimeType);
      try {
        const media = store.createMedia({
          id,
          mimeType,
          byteSize: request.body.byteLength,
          originalName: mediaStorage.safeOriginalName(
            request.header('x-file-name'),
            mimeType,
          ),
        });
        response.status(201).json(exerciseMediaSchema.parse(media));
      } catch (error) {
        mediaStorage.remove(id, mimeType);
        throw error;
      }
    },
  );
  router.get('/media/:id', (request, response) => {
    if (!mediaStorage)
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
      .send(mediaStorage.read(id, media.mimeType));
  });
  router.delete('/media/:id', (request, response) => {
    if (!mediaStorage)
      throw new AppError(
        503,
        'MEDIA_UNAVAILABLE',
        'Media storage is unavailable',
      );
    const id = uuidSchema.parse(request.params.id);
    const media = store.deleteMedia(id);
    mediaStorage.remove(id, media.mimeType);
    response.status(204).end();
  });

  return router;
}
