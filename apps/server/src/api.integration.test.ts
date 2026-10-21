import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Workout } from '@spotter/shared';

import { createApp } from './app.js';
import type { AppConfig } from './config.js';
import { openDatabase } from './database.js';
import { MediaStorage } from './media.js';
import { SpotterStore } from './store.js';

const config: AppConfig = {
  NODE_ENV: 'test',
  PORT: 3000,
  DATABASE_PATH: ':memory:',
  MEDIA_PATH: './data/test-media',
  APP_VERSION: '0.1.0',
  GIT_COMMIT: 'test',
};

describe('catalogue, templates, and synchronization API', () => {
  let store: SpotterStore;
  let app: ReturnType<typeof createApp>;
  let mediaPath: string;

  beforeEach(() => {
    const database = openDatabase(':memory:');
    store = new SpotterStore(database);
    mediaPath = mkdtempSync(join(tmpdir(), 'spotter-media-test-'));
    app = createApp(config, {
      isDatabaseReady: () => database.open,
      store,
      mediaStorage: new MediaStorage(mediaPath),
    });
  });

  afterEach(() => {
    store.close();
    rmSync(mediaPath, { recursive: true, force: true });
  });

  it('manages catalogue records and protects dependencies', async () => {
    const muscleId = randomUUID();
    const exerciseId = randomUUID();
    const templateId = randomUUID();

    await request(app)
      .post('/api/muscles')
      .send({ id: muscleId, name: 'Chest' })
      .expect(201);
    await request(app)
      .post('/api/exercises')
      .send({
        id: exerciseId,
        name: 'Bench press',
        instructions: 'Control the descent',
        muscles: [{ muscleId, role: 'primary' }],
      })
      .expect(201);

    const dependency = await request(app)
      .delete(`/api/muscles/${muscleId}`)
      .expect(409);
    expect(dependency.body.error.code).toBe('DEPENDENCY_EXISTS');

    const template = await request(app)
      .post('/api/templates')
      .send({
        id: templateId,
        name: 'Push day',
        notes: null,
        exercises: [{ exerciseId, notes: null, targetSets: 3, targetReps: 8 }],
      })
      .expect(201);
    expect(template.body.exercises[0].exerciseName).toBe('Bench press');

    const duplicate = await request(app)
      .post(`/api/templates/${templateId}/duplicate`)
      .expect(201);
    expect(duplicate.body.name).toBe('Push day copy');

    const reference = await request(app).get('/api/reference').expect(200);
    expect(reference.body.changed).toBe(true);
    expect(reference.body.templates).toHaveLength(2);
    await request(app)
      .get(`/api/reference?cursor=${reference.body.revision}`)
      .expect(200)
      .expect((response) => expect(response.body.changed).toBe(false));
  });

  it('applies a workout exactly once and preserves its exercise snapshot', async () => {
    const exerciseId = randomUUID();
    await request(app)
      .post('/api/exercises')
      .send({
        id: exerciseId,
        name: 'Air squat',
        instructions: null,
        muscles: [],
      })
      .expect(201);

    const now = new Date().toISOString();
    const workout: Workout = {
      id: randomUUID(),
      templateId: null,
      templateDay: null,
      name: 'Leg session',
      status: 'completed',
      startedAt: now,
      completedAt: now,
      notes: null,
      updatedAt: now,
      exercises: [
        {
          id: randomUUID(),
          exerciseId,
          exerciseName: 'Air squat',
          exerciseType: 'strength',
          position: 0,
          notes: null,
          targetSets: null,
          targetReps: null,
          targetDurationSeconds: null,
          targetDistance: null,
          targetDistanceUnit: 'km',
          sets: [
            {
              id: randomUUID(),
              position: 0,
              reps: 12,
              weight: 0,
              weightUnit: 'kg',
              durationSeconds: null,
              distance: null,
              distanceUnit: 'km',
              notes: null,
              completed: true,
            },
          ],
        },
      ],
    };
    const operationId = randomUUID();
    const body = {
      operations: [
        { operationId, kind: 'upsert_workout', createdAt: now, workout },
      ],
    };

    const applied = await request(app).post('/api/sync').send(body).expect(200);
    expect(applied.body.results[0].status).toBe('applied');
    const replayed = await request(app)
      .post('/api/sync')
      .send(body)
      .expect(200);
    expect(replayed.body.results[0].status).toBe('duplicate');

    await request(app).delete(`/api/exercises/${exerciseId}`).expect(204);
    const history = await request(app).get('/api/workouts').expect(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].exercises[0].exerciseName).toBe('Air squat');
    expect(history.body[0].exercises[0].exerciseId).toBeNull();
    expect(history.body[0].exercises[0].sets).toHaveLength(1);
  });

  it('stores weekly template ordering and typed cardio workout snapshots', async () => {
    const strengthId = randomUUID();
    const cardioId = randomUUID();
    await request(app)
      .post('/api/exercises')
      .send({
        id: strengthId,
        name: 'Front squat',
        exerciseType: 'strength',
        instructions: null,
        muscles: [],
      })
      .expect(201);
    await request(app)
      .post('/api/exercises')
      .send({
        id: cardioId,
        name: 'Outdoor run',
        exerciseType: 'cardio',
        instructions: null,
        muscles: [],
      })
      .expect(201);

    const templateId = randomUUID();
    const template = await request(app)
      .post('/api/templates')
      .send({
        id: templateId,
        name: 'Weekly plan',
        notes: null,
        exercises: [
          {
            exerciseId: strengthId,
            dayOfWeek: 1,
            notes: null,
            targetSets: 3,
            targetReps: 8,
          },
          {
            exerciseId: cardioId,
            dayOfWeek: 1,
            notes: 'Easy pace',
            targetDurationSeconds: 1_800,
            targetDistance: 5,
            targetDistanceUnit: 'km',
          },
          {
            exerciseId: cardioId,
            dayOfWeek: 5,
            notes: null,
            targetDurationSeconds: 2_400,
            targetDistance: null,
            targetDistanceUnit: 'mi',
          },
        ],
      })
      .expect(201);
    expect(template.body.exercises).toEqual([
      expect.objectContaining({
        exerciseType: 'strength',
        dayOfWeek: 1,
        position: 0,
      }),
      expect.objectContaining({
        exerciseType: 'cardio',
        dayOfWeek: 1,
        position: 1,
      }),
      expect.objectContaining({
        exerciseType: 'cardio',
        dayOfWeek: 5,
        position: 0,
      }),
    ]);

    const invalidTargets = await request(app)
      .patch(`/api/templates/${templateId}`)
      .send({
        name: 'Weekly plan',
        notes: null,
        exercises: [
          {
            exerciseId: cardioId,
            dayOfWeek: 1,
            notes: null,
            targetSets: 3,
            targetReps: 10,
          },
        ],
      })
      .expect(400);
    expect(invalidTargets.body.error.code).toBe('INVALID_TEMPLATE_TARGETS');

    const typeConflict = await request(app)
      .patch(`/api/exercises/${strengthId}`)
      .send({
        name: 'Front squat',
        exerciseType: 'cardio',
        instructions: null,
        muscles: [],
      })
      .expect(409);
    expect(typeConflict.body.error.code).toBe('EXERCISE_TYPE_CONFLICT');

    const now = new Date().toISOString();
    const workoutId = randomUUID();
    await request(app)
      .post('/api/sync')
      .send({
        operations: [
          {
            operationId: randomUUID(),
            kind: 'upsert_workout',
            createdAt: now,
            workout: {
              id: workoutId,
              templateId,
              templateDay: 1,
              name: 'Monday run',
              status: 'completed',
              startedAt: now,
              completedAt: now,
              notes: 'Felt steady',
              updatedAt: now,
              exercises: [
                {
                  id: randomUUID(),
                  exerciseId: cardioId,
                  exerciseName: 'Outdoor run',
                  exerciseType: 'cardio',
                  position: 0,
                  notes: 'Negative split',
                  targetSets: null,
                  targetReps: null,
                  targetDurationSeconds: 1_800,
                  targetDistance: 5,
                  targetDistanceUnit: 'km',
                  sets: [
                    {
                      id: randomUUID(),
                      position: 0,
                      reps: null,
                      weight: null,
                      weightUnit: 'kg',
                      durationSeconds: 1_720,
                      distance: 5,
                      distanceUnit: 'km',
                      notes: 'Strong finish',
                      completed: true,
                    },
                  ],
                },
              ],
            },
          },
        ],
      })
      .expect(200)
      .expect((response) =>
        expect(response.body.results[0].status).toBe('applied'),
      );

    const history = await request(app)
      .get(`/api/workouts/${workoutId}`)
      .expect(200);
    expect(history.body).toMatchObject({
      templateId,
      templateDay: 1,
      exercises: [
        {
          exerciseType: 'cardio',
          targetDurationSeconds: 1_800,
          targetDistance: 5,
          sets: [
            {
              reps: null,
              weight: null,
              durationSeconds: 1_720,
              distance: 5,
              distanceUnit: 'km',
            },
          ],
        },
      ],
    });
  });

  it('keeps exactly one active weekly template', async () => {
    const first = await request(app)
      .post('/api/templates')
      .send({ name: 'First plan', notes: null, exercises: [] })
      .expect(201);
    expect(first.body.isActive).toBe(true);

    const second = await request(app)
      .post('/api/templates')
      .send({ name: 'Second plan', notes: null, exercises: [] })
      .expect(201);
    expect(second.body.isActive).toBe(false);

    const activated = await request(app)
      .patch(`/api/templates/${second.body.id}`)
      .send({
        name: 'Second plan',
        isActive: true,
        notes: null,
        exercises: [],
      })
      .expect(200);
    expect(activated.body.isActive).toBe(true);

    const templates = await request(app).get('/api/templates').expect(200);
    expect(
      templates.body.filter((template: { isActive: boolean }) =>
        Boolean(template.isActive),
      ),
    ).toHaveLength(1);
    expect(
      templates.body.find((template: { isActive: boolean }) =>
        Boolean(template.isActive),
      ).id,
    ).toBe(second.body.id);

    const duplicate = await request(app)
      .post(`/api/templates/${second.body.id}/duplicate`)
      .expect(201);
    expect(duplicate.body.isActive).toBe(false);

    await request(app).delete(`/api/templates/${second.body.id}`).expect(204);
    const afterDelete = await request(app).get('/api/templates').expect(200);
    expect(
      afterDelete.body.filter((template: { isActive: boolean }) =>
        Boolean(template.isActive),
      ),
    ).toHaveLength(1);
  });

  it('returns stable validation errors', async () => {
    const response = await request(app)
      .post('/api/muscles')
      .send({ name: '' })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an invalid workout per operation without retrying the batch', async () => {
    const now = new Date().toISOString();
    const operationId = randomUUID();
    const response = await request(app)
      .post('/api/sync')
      .send({
        operations: [
          {
            operationId,
            kind: 'upsert_workout',
            createdAt: now,
            workout: { id: randomUUID(), name: '' },
          },
        ],
      })
      .expect(200);

    expect(response.body.results).toEqual([
      expect.objectContaining({
        operationId,
        status: 'rejected',
        error: expect.objectContaining({ code: 'INVALID_SYNC_OPERATION' }),
      }),
    ]);
  });

  it.each([
    ['image/gif', 'demo.gif', Buffer.from('GIF89a payload')],
    [
      'image/png',
      'demo.png',
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ],
    ['image/jpeg', 'demo.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
  ])(
    'stores a validated %s under a stable exercise URL and deletes it with the exercise',
    async (mimeType, filename, image) => {
      const upload = await request(app)
        .post('/api/media/image')
        .set('Content-Type', mimeType)
        .set('X-File-Name', filename)
        .send(image)
        .expect(201);
      expect(upload.body).toMatchObject({
        kind: 'image',
        mimeType,
        byteSize: image.byteLength,
        originalName: filename,
      });

      const exerciseId = randomUUID();
      const exercise = await request(app)
        .post('/api/exercises')
        .send({
          id: exerciseId,
          name: `Exercise ${mimeType}`,
          instructions: 'Keep moving',
          muscles: [],
          mediaId: upload.body.id,
        })
        .expect(201);
      expect(exercise.body.media.url).toBe(`/api/media/${upload.body.id}`);

      await request(app)
        .get(`/api/media/${upload.body.id}`)
        .expect('Content-Type', new RegExp(mimeType.replace('/', '\\/')))
        .expect(200);
      await request(app).delete(`/api/exercises/${exerciseId}`).expect(204);
      await request(app).get(`/api/media/${upload.body.id}`).expect(404);
    },
  );

  it('rejects an image whose bytes do not match its declared type', async () => {
    const response = await request(app)
      .post('/api/media/image')
      .set('Content-Type', 'image/png')
      .set('X-File-Name', 'renamed.png')
      .send(Buffer.from('GIF89a payload'))
      .expect(415);
    expect(response.body.error.code).toBe('INVALID_MEDIA_TYPE');
  });
});
