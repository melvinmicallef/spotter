import { Router } from 'express';

import { appSettingsInputSchema, appSettingsSchema } from '@spotter/shared';

import type { MediaStorage } from '../media/storage.js';
import type { SpotterStore } from '../../persistence/store.js';

export function createSettingsRouter(
  store: SpotterStore,
  mediaStorage?: MediaStorage,
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
      mediaStorage?.remove(removed.id, removed.mimeType);
    }
    response.json(appSettingsSchema.parse(settings));
  });

  return router;
}
