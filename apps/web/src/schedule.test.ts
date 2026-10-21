import { describe, expect, it } from 'vitest';

import {
  isoWeekKey,
  parseWeekSchedule,
  scheduledTemplateDay,
  swapWeekDays,
} from './schedule.js';

describe('weekly schedule overrides', () => {
  it('uses ISO week years at calendar boundaries', () => {
    expect(isoWeekKey(new Date(2021, 0, 1))).toBe('2020-W53');
    expect(isoWeekKey(new Date(2021, 0, 4))).toBe('2021-W01');
  });

  it('swaps assigned template days pairwise and can restore them', () => {
    const swapped = swapWeekDays({}, 1, 5);
    expect(scheduledTemplateDay(1, swapped)).toBe(5);
    expect(scheduledTemplateDay(5, swapped)).toBe(1);
    expect(swapWeekDays(swapped, 1, 5)).toEqual({});
  });

  it('ignores malformed persisted values', () => {
    expect(parseWeekSchedule('{"1":5,"2":99,"oops":3}')).toEqual({ 1: 5 });
    expect(parseWeekSchedule('not-json')).toEqual({});
  });
});
