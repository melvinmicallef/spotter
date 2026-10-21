import {
  apiErrorSchema,
  exerciseSchema,
  exerciseMediaSchema,
  muscleSchema,
  referenceDataSchema,
  syncResponseSchema,
  workoutSchema,
  workoutTemplateSchema,
  websiteImportPreviewSchema,
} from '@spotter/shared';
import type {
  Exercise,
  ExerciseInput,
  ExerciseMedia,
  Muscle,
  MuscleInput,
  ReferenceData,
  SyncBatch,
  SyncResponse,
  Workout,
  WorkoutTemplate,
  WorkoutTemplateInput,
  WebsiteImportPreview,
} from '@spotter/shared';

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(typeof init?.body === 'string'
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init?.headers,
    },
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
      response.status,
      body.success ? body.data.error.details : undefined,
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
  async uploadGif(file: File): Promise<ExerciseMedia> {
    return exerciseMediaSchema.parse(
      await request('/media/gif', {
        method: 'POST',
        headers: {
          'Content-Type': 'image/gif',
          'X-File-Name': file.name,
        },
        body: file,
      }),
    );
  },
  async deleteMedia(id: string): Promise<void> {
    await request(`/media/${id}`, { method: 'DELETE' });
  },
  async previewWebsiteImport(url: string): Promise<WebsiteImportPreview> {
    return websiteImportPreviewSchema.parse(
      await request('/imports/website/preview', {
        method: 'POST',
        body: JSON.stringify({ url }),
      }),
    );
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
