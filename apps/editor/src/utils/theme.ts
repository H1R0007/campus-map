import type { ThemeChoice } from './layoutPrefs';

/**
 * Тема редактора (запись 56): тёмная графитовая или светлая, по выбору или
 * как в системе.
 *
 * Цвета — переменные `index.css`; тема — атрибут `data-theme` у `<html>`,
 * под которым переменные получают другие значения. Слои карты читают цвета
 * значением (`themeColor.ts`) и перерисовываются при смене темы.
 */
export type ResolvedTheme = 'dark' | 'light';

const SYSTEM_DARK = '(prefers-color-scheme: dark)';

function systemTheme(): ResolvedTheme {
  try {
    return globalThis.matchMedia?.(SYSTEM_DARK).matches === false ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  return choice === 'system' ? systemTheme() : choice;
}

export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

/**
 * Следит за темой системы, пока выбрано «как в системе».
 *
 * @returns отписка
 */
export function watchSystemTheme(onChange: (theme: ResolvedTheme) => void): () => void {
  let query: MediaQueryList | undefined;
  try {
    query = globalThis.matchMedia?.(SYSTEM_DARK);
  } catch {
    return () => {};
  }
  if (!query) return () => {};
  const listener = () => onChange(systemTheme());
  query.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
}
