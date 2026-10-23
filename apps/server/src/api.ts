import { Router } from 'express';

import { createCatalogueRouter } from './features/catalogue/routes.js';
import { createMediaRouter } from './features/media/routes.js';
import type { MediaStorage } from './features/media/storage.js';
import { createReferenceRouter } from './features/reference/routes.js';
import { createSettingsRouter } from './features/settings/routes.js';
import { createSyncRouter } from './features/sync/routes.js';
import { createTemplatesRouter } from './features/templates/routes.js';
import { createWorkoutsRouter } from './features/workouts/routes.js';
import type { SpotterStore } from './persistence/store.js';

interface ApiRouterOptions {
  mediaStorage?: MediaStorage;
}

export function createApiRouter(
  store: SpotterStore,
  options: ApiRouterOptions = {},
): Router {
  const router = Router();
  router.use(createSettingsRouter(store, options.mediaStorage));
  router.use(createCatalogueRouter(store, options.mediaStorage));
  router.use(createMediaRouter(store, options.mediaStorage));
  router.use(createTemplatesRouter(store));
  router.use(createReferenceRouter(store));
  router.use(createWorkoutsRouter(store));
  router.use(createSyncRouter(store));
  return router;
}
