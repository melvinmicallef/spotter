import { describe, expect, it } from 'vitest';

import { activePlanDays } from './active-duration.js';

describe('activePlanDays', () => {
  it('counts local calendar days since activation', () => {
    const activeSince = new Date(2026, 9, 20, 23, 55).toISOString();
    const today = new Date(2026, 9, 22, 0, 5);

    expect(activePlanDays(activeSince, today)).toBe(2);
  });

  it('shows zero on the activation day', () => {
    const activeSince = new Date(2026, 9, 22, 8).toISOString();
    const today = new Date(2026, 9, 22, 18);

    expect(activePlanDays(activeSince, today)).toBe(0);
  });

  it('returns null when the activation date is unavailable', () => {
    expect(activePlanDays(null)).toBeNull();
    expect(activePlanDays('invalid')).toBeNull();
  });
});
