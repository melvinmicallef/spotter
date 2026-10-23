import { describe, expect, it } from 'vitest';

import { workoutTemplateInputSchema } from '@spotter/shared';

import { swapTemplateDays } from './template-days.js';

describe('weekly template day swaps', () => {
  it('exchanges all exercise settings and day names between weekdays', () => {
    const draft = workoutTemplateInputSchema.parse({
      name: 'Weekly plan',
      notes: null,
      dayNames: [
        { dayOfWeek: 1, name: 'Chest & Back' },
        { dayOfWeek: 3, name: 'Legs' },
      ],
      exercises: [
        {
          id: crypto.randomUUID(),
          exerciseId: crypto.randomUUID(),
          dayOfWeek: 1,
          targetSets: 3,
          targetReps: 8,
        },
        {
          id: crypto.randomUUID(),
          exerciseId: crypto.randomUUID(),
          dayOfWeek: 1,
          cardioMode: 'interval',
          intervalWorkSeconds: 45,
          targetDistance: null,
        },
        {
          id: crypto.randomUUID(),
          exerciseId: crypto.randomUUID(),
          dayOfWeek: 3,
          targetSets: 4,
          targetReps: 10,
        },
        {
          id: crypto.randomUUID(),
          exerciseId: crypto.randomUUID(),
          dayOfWeek: 5,
          targetSets: 2,
          targetReps: 12,
        },
      ],
    });

    const swapped = swapTemplateDays(draft, 1, 3);

    expect(swapped.exercises.map(({ dayOfWeek }) => dayOfWeek)).toEqual([
      3, 3, 1, 5,
    ]);
    expect(swapped.exercises[0]).toMatchObject({
      id: draft.exercises[0]?.id,
      targetSets: 3,
      targetReps: 8,
    });
    expect(swapped.exercises[1]).toMatchObject({
      id: draft.exercises[1]?.id,
      cardioMode: 'interval',
      intervalWorkSeconds: 45,
    });
    expect(swapped.exercises[2]).toMatchObject({
      id: draft.exercises[2]?.id,
      targetSets: 4,
      targetReps: 10,
    });
    expect(swapped.dayNames).toEqual([
      { dayOfWeek: 3, name: 'Chest & Back' },
      { dayOfWeek: 1, name: 'Legs' },
    ]);
    expect(draft.exercises.map(({ dayOfWeek }) => dayOfWeek)).toEqual([
      1, 1, 3, 5,
    ]);
  });

  it('moves a workout and its name to a rest day', () => {
    const draft = workoutTemplateInputSchema.parse({
      name: 'Weekly plan',
      notes: null,
      dayNames: [{ dayOfWeek: 2, name: 'Intervals' }],
      exercises: [
        {
          exerciseId: crypto.randomUUID(),
          dayOfWeek: 2,
          cardioMode: 'duration',
          targetDurationSeconds: 1800,
        },
      ],
    });

    const swapped = swapTemplateDays(draft, 2, 6);

    expect(swapped.exercises[0]?.dayOfWeek).toBe(6);
    expect(swapped.dayNames).toEqual([{ dayOfWeek: 6, name: 'Intervals' }]);
  });

  it('leaves the draft unchanged when both selected weekdays are the same', () => {
    const draft = workoutTemplateInputSchema.parse({
      name: 'Weekly plan',
      notes: null,
      exercises: [],
    });

    expect(swapTemplateDays(draft, 1, 1)).toBe(draft);
  });
});
