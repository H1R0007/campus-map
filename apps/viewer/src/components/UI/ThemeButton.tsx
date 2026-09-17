import React from 'react';
import { useMessages } from '../../i18n';
import { useSettingsStore } from '../../stores/settingsStore';
import type { ThemePreference } from '../../theme/theme';
import { Icon } from './Icon';
import type { IconName } from './Icon';

const NEXT: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' };

const ICONS: Record<ThemePreference, IconName> = { system: 'themeSystem', light: 'themeLight', dark: 'themeDark' };

/**
 * Оформление — круглой кнопкой рядом с поиском в раскрытой панели (записи 34
 * и 37).
 *
 * Раньше переключатель из трёх кнопок занимал в панели целую строку, а тему
 * меняют редко. Значок показывает выбранное — монитор «как в системе», солнце,
 * луна, — нажатие переключает по кругу, а подпись и подсказка называют и
 * выбранное, и следующее.
 */
export const ThemeButton: React.FC = () => {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const messages = useMessages();
  const label = messages.themeButton(messages.theme[theme], messages.theme[NEXT[theme]]);

  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT[theme])}
      aria-label={label}
      title={label}
      className="w-12 h-12 flex-shrink-0 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center hover:bg-gray-200 transition-colors"
    >
      <Icon name={ICONS[theme]} />
    </button>
  );
};
