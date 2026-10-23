import { Router } from 'express';

import { completedWorkoutEditSchema, uuidSchema } from '@spotter/shared';

import type { SpotterStore } from '../../persistence/store.js';

export function createWorkoutsRouter(store: SpotterStore): Router {
  const router = Router();

  router.get('/workouts', (_request, response) =>
    response.json(store.listWorkouts()),
  );
  router.get('/workouts/:id', (request, response) => {
    response.json(store.getWorkout(uuidSchema.parse(request.params.id)));
  });
  router.patch('/workouts/:id', (request, response) => {
    response.json(
      store.updateCompletedWorkout(
        uuidSchema.parse(request.params.id),
        completedWorkoutEditSchema.parse(request.body),
      ),
    );
  });
  router.delete('/workouts/:id', (request, response) => {
    store.deleteWorkout(uuidSchema.parse(request.params.id));
    response.status(204).end();
  });

  return router;
}
