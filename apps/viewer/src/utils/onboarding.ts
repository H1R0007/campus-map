import { readLinkParams } from './deepLink';

/**
 * Знакомство при первом запуске: когда его показывать (запись 25).
 */

/** Отметка «знакомство пройдено или пропущено» — на этом устройстве. */
export const ONBOARDING_KEY = 'campus-map:onboarding-done';

export interface OnboardingEnvironment {
  /** Строка запроса адреса. */
  search: string;
  /** Отметка из хранилища; `null` — знакомства ещё не было. */
  stored: string | null;
  /** Хранилище браузера доступно — отметку можно и прочитать, и записать. */
  storageAvailable: boolean;
}

/**
 * Показывать ли знакомство.
 *
 * - Один раз на устройство: пройденное или пропущенное больше не появляется.
 * - Не по ссылке с точками маршрута (`readLinkParams`): у входа с QR-кодом
 *   человек торопится, и три экрана встали бы между ним и маршрутом. Отметка
 *   при этом не ставится — знакомство покажется при обычном открытии. Язык в
 *   ссылке знакомству не мешает.
 * - Не без хранилища: отметку негде запомнить, и знакомство показывалось бы
 *   при каждом открытии.
 */
export function shouldShowOnboarding(env: OnboardingEnvironment): boolean {
  if (!env.storageAvailable || env.stored !== null) return false;

  const link = readLinkParams(env.search);
  return link.from === null && link.to === null && link.at === null;
}

/** Окружение из браузера; вне браузера — в тестах на Node — знакомства нет. */
export function readOnboardingEnvironment(): OnboardingEnvironment {
  if (typeof window === 'undefined') return { search: '', stored: null, storageAvailable: false };

  try {
    return {
      search: window.location.search,
      stored: window.localStorage.getItem(ONBOARDING_KEY),
      storageAvailable: true,
    };
  } catch {
    // Приватный режим, запрет на сайт, песочница.
    return { search: window.location.search, stored: null, storageAvailable: false };
  }
}

/** Знакомство пройдено или пропущено. */
export function markOnboardingDone(): void {
  try {
    window.localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {
    // См. `readOnboardingEnvironment`: без хранилища знакомство и не показывается.
  }
}
