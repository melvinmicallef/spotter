import { describe, expect, it } from 'vitest';

import { validateGif } from './media.js';

describe('GIF validation', () => {
  it('accepts GIF signatures and rejects renamed non-GIF files', () => {
    expect(() => validateGif(Buffer.from('GIF89a payload'))).not.toThrow();
    try {
      validateGif(Buffer.from('not a gif'));
      throw new Error('Expected validation to fail');
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_MEDIA_TYPE' });
    }
  });
});
