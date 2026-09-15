import { create } from 'zustand';
import { DATA_LANGUAGE, isLanguage } from '../i18n/languages';
import type { Language } from '../i18n/languages';
import { THEME_STORAGE_KEY, isThemePreference } from '../theme/theme';
import type { ThemePreference } from '../theme/theme';

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

/** Тема, выбранная при прошлом визите; без выбора и вне браузера — «как в системе». */
function initialTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function storeTheme(theme: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // См. `readStoredLanguage`: выбор действует до закрытия вкладки.
  }
}

interface SettingsState {
  language: Language;
  setLanguage: (language: Language) => void;

  /** Тема оформления: как в системе, светлая или тёмная (запись 34). */
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  language: initialLanguage(),

  setLanguage: (language) => {
    storeLanguage(language);
    set({ language });
  },

  theme: initialTheme(),

  setTheme: (theme) => {
    storeTheme(theme);
    set({ theme });
  },
}));
