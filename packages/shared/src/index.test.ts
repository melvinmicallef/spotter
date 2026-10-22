import { describe, expect, it } from 'vitest';

import {
  exerciseInputSchema,
  exerciseSchema,
  healthResponseSchema,
  templateExerciseSchema,
  versionResponseSchema,
  workoutExerciseSchema,
} from './index.js';

describe('service contracts', () => {
  it('accepts valid health and version responses', () => {
    expect(
      healthResponseSchema.parse({
        status: 'ok',
        database: 'ready',
        timestamp: '2026-10-20T10:00:00.000Z',
      }),
    ).toBeTruthy();
    expect(
      versionResponseSchema.parse({
        name: 'spotter',
        version: '0.1.0',
        commit: 'development',
      }),
    ).toBeTruthy();
  });

  it('rejects malformed responses', () => {
    expect(() => healthResponseSchema.parse({ status: 'fine' })).toThrow();
  });

  it('validates exercise media and preserved source metadata', () => {
    const now = '2026-10-20T10:00:00.000Z';
    const id = '52ebad50-675f-46cf-bb76-64a89693dc80';
    expect(
      exerciseSchema.parse({
        id,
        name: 'Curl',
        preparation: 'Set the bench angle',
        execution: 'Lower with control',
        muscles: [],
        media: {
          id,
          kind: 'image',
          url: `/api/media/${id}`,
          mimeType: 'image/gif',
          byteSize: 1024,
          originalName: 'curl.gif',
          createdAt: now,
        },
        source: {
          url: 'https://example.com/curl',
          title: 'Curl',
          mediaUrl: 'https://example.com/curl.gif',
          importedAt: now,
        },
        createdAt: now,
        updatedAt: now,
      }),
    ).toBeTruthy();
    expect(
      exerciseInputSchema.parse({
        name: 'Curl',
        preparation: null,
        execution: null,
        muscles: [],
      }),
    ).toMatchObject({ mediaId: null, source: null });
  });

  it('validates ISO weekdays and type-specific template targets', () => {
    const base = {
      id: '52ebad50-675f-46cf-bb76-64a89693dc80',
      exerciseId: '720f12fb-ec82-44c6-8377-d8af853970b5',
      exerciseName: 'Intervals',
      position: 0,
      notes: null,
      targetSets: null,
      targetReps: null,
      targetDurationSeconds: 1_800,
      targetDistance: 5,
    };

    expect(
      templateExerciseSchema.parse({
        ...base,
        exerciseType: 'cardio',
        dayOfWeek: 7,
        targetDistanceUnit: 'km',
      }),
    ).toMatchObject({ exerciseType: 'cardio', dayOfWeek: 7 });
    expect(() =>
      templateExerciseSchema.parse({
        ...base,
        exerciseType: 'cardio',
        dayOfWeek: 0,
      }),
    ).toThrow();
    expect(() =>
      templateExerciseSchema.parse({
        ...base,
        exerciseType: 'strength',
        dayOfWeek: 1,
      }),
    ).toThrow(/cannot contain cardio timing or distance targets/);
    expect(() =>
      templateExerciseSchema.parse({
        ...base,
        exerciseType: 'cardio',
        dayOfWeek: 1,
        targetSets: 3,
      }),
    ).toThrow(/set or rep targets/);

    expect(
      templateExerciseSchema.parse({
        ...base,
        exerciseType: 'cardio',
        dayOfWeek: 1,
        targetDurationSeconds: null,
        targetDistance: null,
        targetDistanceUnit: 'km',
        cardioMode: 'interval',
        intervalPrepSeconds: null,
        intervalWorkSeconds: null,
        intervalRestSeconds: null,
        intervalIterations: null,
      }),
    ).toMatchObject({ cardioMode: 'interval' });
  });

  it('keeps strength and cardio set measurements separate', () => {
    const base = {
      id: '52ebad50-675f-46cf-bb76-64a89693dc80',
      exerciseId: null,
      exerciseName: 'Snapshot',
      position: 0,
      notes: null,
      targetSets: null,
      targetReps: null,
      targetDurationSeconds: null,
      targetDistance: null,
    };
    const set = {
      id: '720f12fb-ec82-44c6-8377-d8af853970b5',
      position: 0,
      reps: null,
      weight: null,
      weightUnit: 'kg',
      durationSeconds: null,
      distance: null,
      distanceUnit: 'km',
      notes: null,
      completed: false,
    };

    expect(
      workoutExerciseSchema.parse({
        ...base,
        exerciseType: 'strength',
        sets: [{ ...set, reps: 8, weight: 60 }],
      }),
    ).toBeTruthy();
    expect(
      workoutExerciseSchema.parse({
        ...base,
        exerciseType: 'cardio',
        sets: [{ ...set, durationSeconds: 900, distance: 3 }],
      }),
    ).toBeTruthy();
    expect(() =>
      workoutExerciseSchema.parse({
        ...base,
        exerciseType: 'cardio',
        cardioMode: 'interval',
        targetDurationSeconds: null,
        targetDistance: null,
        sets: [{ ...set }],
      }),
    ).toThrow(/Interval cardio requires a prep time/);
    expect(
      workoutExerciseSchema.parse({
        ...base,
        exerciseType: 'cardio',
        cardioMode: 'interval',
        targetDurationSeconds: null,
        targetDistance: null,
        intervalPrepSeconds: 0,
        intervalWorkSeconds: 30,
        intervalRestSeconds: 30,
        intervalIterations: 8,
        sets: [{ ...set }],
      }),
    ).toMatchObject({ cardioMode: 'interval', intervalIterations: 8 });
    expect(() =>
      workoutExerciseSchema.parse({
        ...base,
        exerciseType: 'cardio',
        sets: [{ ...set, reps: 8 }],
      }),
    ).toThrow(/cannot contain reps or weight/);
    expect(() =>
      workoutExerciseSchema.parse({
        ...base,
        exerciseType: 'strength',
        sets: [{ ...set, distance: 3 }],
      }),
    ).toThrow(/cannot contain duration or distance/);
  });
});
