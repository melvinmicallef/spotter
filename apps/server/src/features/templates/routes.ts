import { Router } from 'express';

import { uuidSchema, workoutTemplateInputSchema } from '@spotter/shared';

import type { SpotterStore } from '../../persistence/store.js';

export function createTemplatesRouter(store: SpotterStore): Router {
  const router = Router();

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

  return router;
}
