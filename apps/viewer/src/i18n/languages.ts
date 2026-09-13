/**
 * Языки интерфейса навигатора.
 *
 * Список один на всё приложение: из него выводятся тип языка, проверка кода из
 * адреса и хранилища и набор словарей. Добавить язык — значит дописать код сюда
 * и словарь в `i18n/`: словарь без всех ключей не скомпилируется.
 */
export const LANGUAGES = ['ru', 'en'] as const;

export type Language = (typeof LANGUAGES)[number];

/**
 * Язык данных: на нём записаны `name` и `names` в датасете. Для него перевод
 * не ищется, а любой другой язык без перевода показывает имена на нём.
 */
export const DATA_LANGUAGE: Language = 'ru';

/**
 * Самоназвания языков для переключателя.
 *
 * Каждое — на своём языке, а не на языке текущего интерфейса: человек, не
 * читающий по-русски, должен узнать «English», а не «Английский».
 */
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = Object.freeze({
  ru: 'Русский',
  en: 'English',
});

export function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}
