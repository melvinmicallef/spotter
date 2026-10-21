import {
  apiErrorSchema,
  exerciseSchema,
  muscleSchema,
  referenceDataSchema,
  syncResponseSchema,
  workoutSchema,
  workoutTemplateSchema,
} from '@spotter/shared';
import type {
  Exercise,
  ExerciseInput,
  Muscle,
  MuscleInput,
  ReferenceData,
  SyncBatch,
  SyncResponse,
  Workout,
  WorkoutTemplate,
  WorkoutTemplateInput,
} from '@spotter/shared';

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = apiErrorSchema.safeParse(
      await response.json().catch(() => ({})),
    );
    throw new ApiClientError(
      body.success ? body.data.error.code : 'REQUEST_FAILED',
      body.success
        ? body.data.error.message
        : `Request failed (${response.status})`,
    );
  }
  return response.status === 204 ? undefined : response.json();
}

export const api = {
  async reference(cursor?: number): Promise<ReferenceData> {
    return referenceDataSchema.parse(
      await request(`/reference${cursor == null ? '' : `?cursor=${cursor}`}`),
    );
  },
  async workouts(): Promise<Workout[]> {
    return workoutSchema.array().parse(await request('/workouts'));
  },
  async sync(batch: SyncBatch): Promise<SyncResponse> {
    return syncResponseSchema.parse(
      await request('/sync', { method: 'POST', body: JSON.stringify(batch) }),
    );
  },
  async createMuscle(input: MuscleInput): Promise<Muscle> {
    return muscleSchema.parse(
      await request('/muscles', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  },
  async updateMuscle(id: string, input: MuscleInput): Promise<Muscle> {
    return muscleSchema.parse(
      await request(`/muscles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    );
  },
  async deleteMuscle(id: string): Promise<void> {
    await request(`/muscles/${id}`, { method: 'DELETE' });
  },
  async createExercise(input: ExerciseInput): Promise<Exercise> {
    return exerciseSchema.parse(
      await request('/exercises', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  },
  async updateExercise(id: string, input: ExerciseInput): Promise<Exercise> {
    return exerciseSchema.parse(
      await request(`/exercises/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    );
  },
  async deleteExercise(id: string): Promise<void> {
    await request(`/exercises/${id}`, { method: 'DELETE' });
  },
  async createTemplate(input: WorkoutTemplateInput): Promise<WorkoutTemplate> {
    return workoutTemplateSchema.parse(
      await request('/templates', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  },
  async updateTemplate(
    id: string,
    input: WorkoutTemplateInput,
  ): Promise<WorkoutTemplate> {
    return workoutTemplateSchema.parse(
      await request(`/templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    );
  },
  async duplicateTemplate(id: string): Promise<WorkoutTemplate> {
    return workoutTemplateSchema.parse(
      await request(`/templates/${id}/duplicate`, { method: 'POST' }),
    );
  },
  async deleteTemplate(id: string): Promise<void> {
    await request(`/templates/${id}`, { method: 'DELETE' });
  },
};
