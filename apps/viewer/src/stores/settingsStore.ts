import { create } from 'zustand';
import { DATA_LANGUAGE, isLanguage } from '../i18n/languages';
import type { Language } from '../i18n/languages';

/**
 * Настройки интерфейса, выбранные пользователем.
 *
 * Отдельный стор, а не поле стора карты или маршрута: язык не относится ни к
 * данным кампуса, ни к маршруту, и его смена не должна будить подписчиков тех
 * сторов.
 */

const STORAGE_KEY = 'campus-map:language';

/** Окружение, из которого выбирается язык при открытии. */
export interface LanguageEnvironment {
  /** Строка запроса адреса: `?lang=en`. */
  search: string;
  /** Язык, сохранённый при прошлом визите. */
  stored: string | null;
  /** Языки браузера в порядке предпочтения: `navigator.languages`. */
  preferred: readonly string[];
}

/**
 * Язык интерфейса при открытии.
 *
 * Порядок: `?lang=` в адресе — ссылка или QR-код на английской табличке;
 * затем выбор, сохранённый при прошлом визите; затем первый поддержанный из
 * языков браузера; иначе язык данных. Функция чистая: окружение приходит
 * аргументом, иначе правило нельзя проверить тестом.
 */
export function detectLanguage(env: LanguageEnvironment): Language {
  const fromLink = new URLSearchParams(env.search).get('lang');
  if (fromLink !== null && isLanguage(fromLink)) return fromLink;

  if (env.stored !== null && isLanguage(env.stored)) return env.stored;

  for (const tag of env.preferred) {
    const primary = tag.toLowerCase().split('-')[0];
    if (isLanguage(primary)) return primary;
  }

  return DATA_LANGUAGE;
}

function readStoredLanguage(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Хранилище недоступно: приватный режим, запрет на сайт, песочница. Язык
    // тогда просто не запоминается между визитами — навигации это не мешает.
    return null;
  }
}

function storeLanguage(language: Language): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // См. `readStoredLanguage`: выбор действует до закрытия вкладки.
  }
}

/**
 * Язык при создании стора. Вне браузера — в тестах на Node — окна нет, и
 * берётся язык данных.
 */
function initialLanguage(): Language {
  if (typeof window === 'undefined') return DATA_LANGUAGE;

  return detectLanguage({
    search: window.location.search,
    stored: readStoredLanguage(),
    preferred: window.navigator.languages ?? [window.navigator.language],
  });
}

interface SettingsState {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  language: initialLanguage(),

  setLanguage: (language) => {
    storeLanguage(language);
    set({ language });
  },
}));
