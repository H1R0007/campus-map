import { useMediaQuery } from './useMediaQuery';

/** Тёмная тема телефона или компьютера. */
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export type ColorScheme = 'light' | 'dark';

/**
 * Тема системы — навигатор следует ей и своего переключателя не имеет
 * (запись 21).
 *
 * Стилям хук не нужен: CSS меняет токены сам. Он нужен тому, что берёт цвет
 * значением один раз, — слоям карты на canvas: при смене темы они читают
 * токены заново.
 */
export function useColorScheme(): ColorScheme {
  return useMediaQuery(DARK_SCHEME_QUERY) ? 'dark' : 'light';
}
