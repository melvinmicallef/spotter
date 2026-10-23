import { describe, expect, it } from 'vitest';

import { validateImage } from './storage.js';

describe('exercise image validation', () => {
  it('accepts GIF, PNG, and JPEG signatures', () => {
    expect(() =>
      validateImage(Buffer.from('GIF89a payload'), 'image/gif'),
    ).not.toThrow();
    expect(() =>
      validateImage(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        'image/png',
      ),
    ).not.toThrow();
    expect(() =>
      validateImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'),
    ).not.toThrow();
  });

  it('rejects content that does not match its declared image type', () => {
    try {
      validateImage(Buffer.from('not a png'), 'image/png');
      throw new Error('Expected validation to fail');
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_MEDIA_TYPE' });
    }
  });
});
