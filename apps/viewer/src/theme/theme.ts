/**
 * Тема оформления навигатора: как в системе, светлая или тёмная (запись 34).
 *
 * Тема ставится на страницу атрибутом `data-theme` — светлая или тёмная, уже
 * выбранная. Стили знают только его, а не настройку системы: иначе у каждого
 * тёмного правила было бы два входа — медиазапрос и явный выбор.
 */

/** Тёмная тема телефона или компьютера. */
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export type ColorScheme = 'light' | 'dark';

/** Ключ выбора в `localStorage`; его же читает скрипт в `index.html` до первой отрисовки. */
export const THEME_STORAGE_KEY = 'campus-map:theme';

/** Цвет строки браузера: в светлой теме — фирменный, в тёмной — фон навигатора (`--color-canvas`). */
export const THEME_COLORS: Readonly<Record<ColorScheme, string>> = { light: '#0063CC', dark: '#0E1219' };

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/** Тема на экране: выбранная человеком, а «как в системе» — тема системы. */
export function resolveColorScheme(preference: ThemePreference, systemDark: boolean): ColorScheme {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

/** Ставит тему на страницу: атрибут для стилей и цвет строки браузера. */
export function applyColorScheme(scheme: ColorScheme): void {
  document.documentElement.dataset.theme = scheme;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    // Цвет строки теперь зависит не только от системы — медиазапрос у тега не нужен.
    meta.removeAttribute('media');
    meta.setAttribute('content', THEME_COLORS[scheme]);
  }
}
