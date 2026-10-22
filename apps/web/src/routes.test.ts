import { describe, expect, it } from 'vitest';

import {
  exerciseRouteFromPath,
  pathForExercise,
  pathForView,
  viewFromPath,
} from './routes.js';

const exerciseId = '6ad8cf18-123c-43ed-a36c-3b87862ef23a';

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

  it('keeps exercise detail routes in the exercise section', () => {
    expect(viewFromPath(`/exercises/${exerciseId}`)).toBe('exercises');
    expect(viewFromPath(`/exercises/${exerciseId}/edit`)).toBe('exercises');
  });
});

describe('exercise routes', () => {
  it.each([
    [{ kind: 'list' }, '/exercises'],
    [{ kind: 'create' }, '/exercises/new'],
    [{ kind: 'details', exerciseId }, `/exercises/${exerciseId}`],
    [{ kind: 'edit', exerciseId }, `/exercises/${exerciseId}/edit`],
  ] as const)('round-trips $kind', (route, path) => {
    expect(pathForExercise(route)).toBe(path);
    expect(exerciseRouteFromPath(path)).toEqual(route);
    expect(exerciseRouteFromPath(`${path}/`)).toEqual(route);
  });

  it('falls back to the list for malformed exercise paths', () => {
    expect(exerciseRouteFromPath('/exercises/not-a-uuid')).toEqual({
      kind: 'list',
    });
    expect(exerciseRouteFromPath(`/exercises/${exerciseId}/unknown`)).toEqual({
      kind: 'list',
    });
  });
});
