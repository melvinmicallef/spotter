import { describe, expect, it } from 'vitest';

import {
  completeWeekDay,
  isoWeekKey,
  nextAvailableDay,
  parseWeekProgress,
} from './schedule.js';

describe('weekly workout progress', () => {
  it('uses ISO week years at calendar boundaries', () => {
    expect(isoWeekKey(new Date(2021, 0, 1))).toBe('2020-W53');
    expect(isoWeekKey(new Date(2021, 0, 4))).toBe('2021-W01');
  });

  it('marks each template day done once and selects the next unused day', () => {
    const progress = completeWeekDay({ completedDays: [1] }, 5);
    expect(completeWeekDay(progress, 5)).toBe(progress);
    expect(progress.completedDays).toEqual([1, 5]);
    expect(nextAvailableDay(3, progress.completedDays)).toBe(3);
    expect(nextAvailableDay(1, progress.completedDays)).toBe(2);
  });

  it('ignores malformed and legacy swap metadata', () => {
    expect(
      parseWeekProgress('{"completedDays":[1,7,7,0,99,"Monday"]}'),
    ).toEqual({ completedDays: [1, 7] });
    expect(parseWeekProgress('{"1":5,"5":1}')).toEqual({ completedDays: [] });
    expect(parseWeekProgress('not-json')).toEqual({ completedDays: [] });
  });
});
