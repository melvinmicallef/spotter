import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Workout } from '@spotter/shared';

import { HistoryView } from './HistoryView.js';

describe('workout history details', () => {
  it('renders snapshot names, measurements, and every level of notes', () => {
    const now = new Date().toISOString();
    const workout: Workout = {
      id: crypto.randomUUID(),
      templateId: null,
      templateDay: null,
      name: 'Pull session',
      status: 'completed',
      startedAt: now,
      completedAt: now,
      notes: 'Session note',
      updatedAt: now,
      exercises: [
        {
          id: crypto.randomUUID(),
          exerciseId: null,
          exerciseName: 'Deleted deadlift',
          exerciseType: 'strength',
          position: 0,
          notes: 'Exercise note',
          targetSets: null,
          targetReps: null,
          targetDurationSeconds: null,
          targetDistance: null,
          targetDistanceUnit: 'km',
          sets: [
            {
              id: crypto.randomUUID(),
              position: 0,
              reps: 5,
              weight: 100,
              weightUnit: 'kg',
              durationSeconds: null,
              distance: null,
              distanceUnit: 'km',
              notes: 'Set note',
              completed: true,
            },
          ],
        },
      ],
    };

    const html = renderToStaticMarkup(<HistoryView workouts={[workout]} />);
    expect(html).toContain('Deleted deadlift');
    expect(html).toContain('100 kg × 5 reps');
    expect(html).toContain('Session note');
    expect(html).toContain('Exercise note');
    expect(html).toContain('Set note');
  });

  it('renders cardio duration and distance instead of strength fields', () => {
    const now = new Date().toISOString();
    const workout: Workout = {
      id: crypto.randomUUID(),
      templateId: crypto.randomUUID(),
      templateDay: 2,
      name: 'Weekly plan · Tuesday',
      status: 'completed',
      startedAt: now,
      completedAt: now,
      notes: null,
      updatedAt: now,
      exercises: [
        {
          id: crypto.randomUUID(),
          exerciseId: null,
          exerciseName: 'Run',
          exerciseType: 'cardio',
          position: 0,
          notes: null,
          targetSets: null,
          targetReps: null,
          targetDurationSeconds: 1_800,
          targetDistance: 5,
          targetDistanceUnit: 'km',
          sets: [
            {
              id: crypto.randomUUID(),
              position: 0,
              reps: null,
              weight: null,
              weightUnit: 'kg',
              durationSeconds: 1_845,
              distance: 5.2,
              distanceUnit: 'km',
              notes: null,
              completed: true,
            },
          ],
        },
      ],
    };

    const html = renderToStaticMarkup(<HistoryView workouts={[workout]} />);
    expect(html).toContain('30m 45s · 5.2 km');
    expect(html).not.toContain('Bodyweight');
  });
});
