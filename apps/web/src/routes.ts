export type View =
  'workout' | 'history' | 'muscles' | 'exercises' | 'templates';

const VIEW_PATHS: Record<View, string> = {
  workout: '/workout',
  history: '/history',
  muscles: '/muscles',
  exercises: '/exercises',
  templates: '/templates',
};

export function pathForView(view: View): string {
  return VIEW_PATHS[view];
}

export function viewFromPath(pathname: string): View {
  const normalized = pathname === '/' ? pathname : pathname.replace(/\/+$/, '');
  const match = Object.entries(VIEW_PATHS).find(
    ([, path]) => path === normalized,
  );
  return (match?.[0] as View | undefined) ?? 'workout';
}
