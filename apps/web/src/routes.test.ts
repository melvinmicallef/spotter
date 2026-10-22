import { describe, expect, it } from 'vitest';

import { pathForView, viewFromPath } from './routes.js';

describe('top-level routes', () => {
  it.each([
    ['workout', '/workout'],
    ['history', '/history'],
    ['muscles', '/muscles'],
    ['exercises', '/exercises'],
    ['templates', '/templates'],
  ] as const)('maps %s to a stable path', (view, path) => {
    expect(pathForView(view)).toBe(path);
    expect(viewFromPath(path)).toBe(view);
    expect(viewFromPath(`${path}/`)).toBe(view);
  });

  it('uses the workout for the root and unknown paths', () => {
    expect(viewFromPath('/')).toBe('workout');
    expect(viewFromPath('/not-a-page')).toBe('workout');
  });
});
