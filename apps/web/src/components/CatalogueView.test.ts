import { describe, expect, it } from 'vitest';

import { exerciseMuscleLinks } from './CatalogueView.js';

describe('exercise muscle roles', () => {
  it('preserves primary and secondary roles when preparing an update', () => {
    expect(
      exerciseMuscleLinks({ chest: 'primary', triceps: 'secondary' }),
    ).toEqual([
      { muscleId: 'chest', role: 'primary' },
      { muscleId: 'triceps', role: 'secondary' },
    ]);
  });
});
