import { describe, expect, it } from 'vitest';

import {
  exerciseInputSchema,
  exerciseSchema,
  healthResponseSchema,
  versionResponseSchema,
  websiteImportPreviewInputSchema,
} from './index.js';

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

  it('validates exercise media, sources, and public import URL schemes', () => {
    const now = '2026-10-20T10:00:00.000Z';
    const id = '52ebad50-675f-46cf-bb76-64a89693dc80';
    expect(
      exerciseSchema.parse({
        id,
        name: 'Curl',
        instructions: null,
        muscles: [],
        media: {
          id,
          kind: 'gif',
          url: `/api/media/${id}`,
          mimeType: 'image/gif',
          byteSize: 1024,
          originalName: 'curl.gif',
          createdAt: now,
        },
        source: {
          url: 'https://example.com/curl',
          title: 'Curl',
          mediaUrl: 'https://example.com/curl.gif',
          importedAt: now,
        },
        createdAt: now,
        updatedAt: now,
      }),
    ).toBeTruthy();
    expect(
      exerciseInputSchema.parse({
        name: 'Curl',
        instructions: null,
        muscles: [],
      }),
    ).toMatchObject({ mediaId: null, source: null });
    expect(() =>
      websiteImportPreviewInputSchema.parse({ url: 'file:///etc/passwd' }),
    ).toThrow();
  });
});
