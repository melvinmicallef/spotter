import { describe, expect, it } from 'vitest';

import {
  exerciseMuscleLinks,
  exerciseMuscleSummary,
  validateExerciseImage,
} from './CatalogueView.js';

describe('exercise target muscles', () => {
  it('prepares only primary muscle links', () => {
    expect(exerciseMuscleLinks(['chest', 'shoulders'])).toEqual([
      { muscleId: 'chest', role: 'primary' },
      { muscleId: 'shoulders', role: 'primary' },
    ]);
  });

  it('summarizes primary muscles', () => {
    expect(
      exerciseMuscleSummary({
        muscles: [
          {
            id: 'triceps',
            name: 'Triceps',
            group: 'Upper Arms',
            subgroup: null,
            role: 'primary',
          },
          {
            id: 'chest',
            name: 'Chest',
            group: 'Chest',
            subgroup: null,
            role: 'primary',
          },
        ],
      }),
    ).toBe('Upper Arms › Triceps · Chest › Chest');
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
