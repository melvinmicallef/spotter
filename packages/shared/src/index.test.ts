import { describe, expect, it } from 'vitest';

import { healthResponseSchema, versionResponseSchema } from './index.js';

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
});
