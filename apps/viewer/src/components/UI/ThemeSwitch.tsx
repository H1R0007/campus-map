import React from 'react';
import { useMessages } from '../../i18n';
import { useSettingsStore } from '../../stores/settingsStore';
import { THEME_PREFERENCES } from '../../theme/theme';

/**
 * Переключатель темы: как в системе, светлая, тёмная (запись 34).
 *
 * Кнопки во всю ширину и высотой с палец: переключатель стоит в раскрытой
 * панели, а не в шапке, — тему меняют редко, а место в шапке нужнее.
 */
export const ThemeSwitch: React.FC = () => {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const messages = useMessages();

  return (
    <div role="group" aria-label={messages.themeSwitch} className="grid grid-cols-3 gap-0.5 rounded-xl bg-gray-100 p-0.5">
      {THEME_PREFERENCES.map((preference) => {
        const isActive = preference === theme;

        return (
          <button
            key={preference}
            type="button"
            aria-pressed={isActive}
            onClick={() => setTheme(preference)}
            className={`min-h-11 px-2 rounded-lg text-sm font-medium leading-tight transition-colors ${
              isActive ? 'bg-surface text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {messages.theme[preference]}
          </button>
        );
      })}
    </div>
  );
};
