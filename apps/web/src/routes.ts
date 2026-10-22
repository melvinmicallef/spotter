export type View =
  | 'workout'
  | 'history'
  | 'muscles'
  | 'exercises'
  | 'templates'
  | 'settings'
  | 'stretching';

export type ExerciseRoute =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'details'; exerciseId: string }
  | { kind: 'edit'; exerciseId: string };

export type TemplateRoute =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'details'; templateId: string }
  | { kind: 'edit'; templateId: string };

export type HistoryRoute =
  { kind: 'list' } | { kind: 'details'; workoutId: string };

const VIEW_PATHS: Record<View, string> = {
  workout: '/workout',
  history: '/history',
  muscles: '/muscles',
  exercises: '/exercises',
  templates: '/templates',
  settings: '/settings',
  stretching: '/stretching',
};

export function pathForView(view: View): string {
  return VIEW_PATHS[view];
}

export function viewFromPath(pathname: string): View {
  const normalized = normalizePath(pathname);
  if (normalized.startsWith('/exercises/')) return 'exercises';
  if (normalized.startsWith('/templates/')) return 'templates';
  if (normalized.startsWith('/history/')) return 'history';
  const match = Object.entries(VIEW_PATHS).find(
    ([, path]) => path === normalized,
  );
  return (match?.[0] as View | undefined) ?? 'workout';
}

export function pathForHistory(route: HistoryRoute): string {
  return route.kind === 'list' ? '/history' : `/history/${route.workoutId}`;
}

export function historyRouteFromPath(pathname: string): HistoryRoute {
  const segments = normalizePath(pathname).split('/').filter(Boolean);
  if (segments[0] !== 'history' || segments.length !== 2)
    return { kind: 'list' };
  return isUuid(segments[1])
    ? { kind: 'details', workoutId: segments[1]! }
    : { kind: 'list' };
}

export function pathForExercise(route: ExerciseRoute): string {
  switch (route.kind) {
    case 'list':
      return '/exercises';
    case 'create':
      return '/exercises/new';
    case 'details':
      return `/exercises/${route.exerciseId}`;
    case 'edit':
      return `/exercises/${route.exerciseId}/edit`;
  }
}

export function exerciseRouteFromPath(pathname: string): ExerciseRoute {
  const segments = normalizePath(pathname).split('/').filter(Boolean);
  if (segments[0] !== 'exercises') return { kind: 'list' };
  if (segments.length === 1) return { kind: 'list' };
  if (segments.length === 2 && segments[1] === 'new') return { kind: 'create' };
  if (segments.length === 2 && isUuid(segments[1])) {
    return { kind: 'details', exerciseId: segments[1] };
  }
  if (segments.length === 3 && isUuid(segments[1]) && segments[2] === 'edit') {
    return { kind: 'edit', exerciseId: segments[1] };
  }
  return { kind: 'list' };
}

export function pathForTemplate(route: TemplateRoute): string {
  switch (route.kind) {
    case 'list':
      return '/templates';
    case 'create':
      return '/templates/new';
    case 'details':
      return `/templates/${route.templateId}`;
    case 'edit':
      return `/templates/${route.templateId}/edit`;
  }
}

export function templateRouteFromPath(pathname: string): TemplateRoute {
  const segments = normalizePath(pathname).split('/').filter(Boolean);
  if (segments[0] !== 'templates') return { kind: 'list' };
  if (segments.length === 1) return { kind: 'list' };
  if (segments.length === 2 && segments[1] === 'new') return { kind: 'create' };
  if (segments.length === 2 && isUuid(segments[1])) {
    return { kind: 'details', templateId: segments[1] };
  }
  if (segments.length === 3 && isUuid(segments[1]) && segments[2] === 'edit') {
    return { kind: 'edit', templateId: segments[1] };
  }
  return { kind: 'list' };
}

function normalizePath(pathname: string): string {
  return pathname === '/' ? pathname : pathname.replace(/\/+$/, '');
}

function isUuid(value: string | undefined): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ),
  );
}
