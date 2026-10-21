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
          position: 0,
          notes: 'Exercise note',
          targetSets: null,
          targetReps: null,
          sets: [
            {
              id: crypto.randomUUID(),
              position: 0,
              reps: 5,
              weight: 100,
              weightUnit: 'kg',
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
});
