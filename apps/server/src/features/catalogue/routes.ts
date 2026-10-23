import { Router } from 'express';

import { exerciseInputSchema, uuidSchema } from '@spotter/shared';

import type { MediaStorage } from '../media/storage.js';
import type { SpotterStore } from '../../persistence/store.js';

export function createCatalogueRouter(
  store: SpotterStore,
  mediaStorage?: MediaStorage,
): Router {
  const router = Router();

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
      mediaStorage?.remove(media.id, media.mimeType);
    }
    response.status(204).end();
  });

  return router;
}
