import React from 'react';
import { useMessages } from '../../i18n';
import { LANGUAGES, LANGUAGE_NAMES } from '../../i18n/languages';
import { useSettingsStore } from '../../stores/settingsStore';

/**
 * Переключатель языка интерфейса.
 *
 * Кнопки подписаны кодом языка, а для экранного диктора — самоназванием на
 * этом же языке (`lang` у кнопки): человек, не читающий по-русски, должен
 * узнать «English», а не «Английский».
 *
 * Кнопки выглядят компактно, но нажимаются на 44 px: невидимое продолжение
 * (`::after`) выходит вверх, вниз и наружу от пары, не заходя на соседнюю
 * кнопку. Сами кнопки в 44 px раздули бы шапку.
 */
export const LanguageSwitch: React.FC = () => {
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const messages = useMessages();

  return (
    <div role="group" aria-label={messages.languageSwitch} className="flex flex-shrink-0 rounded-xl bg-gray-100 p-0.5">
      {LANGUAGES.map((code) => {
        const isActive = code === language;

        return (
          <button
            key={code}
            type="button"
            lang={code}
            aria-label={LANGUAGE_NAMES[code]}
            aria-pressed={isActive}
            onClick={() => setLanguage(code)}
            className={`relative px-2.5 py-1.5 rounded-lg text-xs font-semibold uppercase transition-colors after:absolute after:-inset-y-2.5 after:content-[''] first:after:-left-2.5 first:after:right-0 last:after:left-0 last:after:-right-2.5 ${
              isActive ? 'bg-surface text-gray-800 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
};
