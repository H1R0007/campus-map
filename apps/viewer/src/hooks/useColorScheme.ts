import { useSettingsStore } from '../stores/settingsStore';
import { DARK_SCHEME_QUERY, resolveColorScheme } from '../theme/theme';
import type { ColorScheme } from '../theme/theme';
import { useMediaQuery } from './useMediaQuery';

export type { ColorScheme };

/**
 * Тема на экране: выбранная в навигаторе, а «как в системе» — тема системы
 * (запись 34).
 *
 * Стилям хук не нужен: они читают атрибут `data-theme`, который держит
 * `startThemeSync`. Он нужен тому, что берёт цвет значением один раз, — слоям
 * карты на canvas: при смене темы они читают токены заново.
 */
export function useColorScheme(): ColorScheme {
  const preference = useSettingsStore((s) => s.theme);
  const systemDark = useMediaQuery(DARK_SCHEME_QUERY);
  return resolveColorScheme(preference, systemDark);
}
