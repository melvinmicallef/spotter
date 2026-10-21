import { describe, expect, it } from 'vitest';

import {
  exerciseMuscleLinks,
  exerciseMuscleSummary,
  validateExerciseImage,
} from './CatalogueView.js';

describe('exercise muscle roles', () => {
  it('preserves primary and secondary roles when preparing an update', () => {
    expect(
      exerciseMuscleLinks({ chest: 'primary', triceps: 'secondary' }),
    ).toEqual([
      { muscleId: 'chest', role: 'primary' },
      { muscleId: 'triceps', role: 'secondary' },
    ]);
  });

  it('summarizes primary muscles before secondary muscles', () => {
    expect(
      exerciseMuscleSummary({
        muscles: [
          { id: 'triceps', name: 'Triceps', role: 'secondary' },
          { id: 'chest', name: 'Chest', role: 'primary' },
        ],
      }),
    ).toBe('Chest · Triceps');
    expect(exerciseMuscleSummary({ muscles: [] })).toBe('No target muscles');
  });

  it('accepts supported exercise images up to five megabytes', () => {
    expect(
      validateExerciseImage({ type: 'image/gif', size: 5 * 1024 * 1024 }),
    ).toBeNull();
    expect(
      validateExerciseImage({ type: 'image/png', size: 1_024 }),
    ).toBeNull();
    expect(
      validateExerciseImage({ type: 'image/jpeg', size: 1_024 }),
    ).toBeNull();
    expect(validateExerciseImage({ type: 'image/webp', size: 1_024 })).toMatch(
      /GIF, PNG, or JPEG/,
    );
    expect(
      validateExerciseImage({
        type: 'image/png',
        size: 5 * 1024 * 1024 + 1,
      }),
    ).toMatch(/5 MB or smaller/);
  });
});
