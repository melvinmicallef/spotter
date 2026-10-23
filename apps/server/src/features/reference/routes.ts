import { Router } from 'express';
import { z } from 'zod';

import type { SpotterStore } from '../../persistence/store.js';

export function createReferenceRouter(store: SpotterStore): Router {
  const router = Router();

  router.get('/reference', (request, response) => {
    const cursor = z.coerce
      .number()
      .int()
      .nonnegative()
      .optional()
      .parse(request.query.cursor);
    response.json(store.getReferenceData(cursor));
  });

  return router;
}
