import { Router } from 'express';
import { z } from 'zod';

import {
  exerciseInputSchema,
  muscleInputSchema,
  syncBatchSchema,
  uuidSchema,
  workoutTemplateInputSchema,
} from '@spotter/shared';

import { AppError } from './errors.js';
import type { SpotterStore } from './store.js';

export function createApiRouter(store: SpotterStore): Router {
  const router = Router();

  router.get('/muscles', (_request, response) =>
    response.json(store.listMuscles()),
  );
  router.post('/muscles', (request, response) => {
    response
      .status(201)
      .json(store.createMuscle(muscleInputSchema.parse(request.body)));
  });
  router.patch('/muscles/:id', (request, response) => {
    response.json(
      store.updateMuscle(
        uuidSchema.parse(request.params.id),
        muscleInputSchema.parse(request.body),
      ),
    );
  });
  router.delete('/muscles/:id', (request, response) => {
    store.deleteMuscle(uuidSchema.parse(request.params.id));
    response.status(204).end();
  });

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
    store.deleteExercise(uuidSchema.parse(request.params.id));
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
  router.post('/sync', (request, response) => {
    const batch = syncBatchSchema.parse(request.body);
    const results = batch.operations.map((operation) => {
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
