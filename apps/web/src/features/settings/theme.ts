export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'spotter-theme';

export function initialTheme(): Theme {
  const applied = document.documentElement.dataset.theme;
  if (applied === 'dark' || applied === 'light') return applied;
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#0b1713' : '#f4f8f6');
}
