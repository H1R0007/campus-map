import { useSettingsStore } from '../stores/settingsStore';
import { en } from './en';
import type { Language } from './languages';
import { ru } from './ru';
import type { Messages } from './ru';

export type { Messages };

const MESSAGES: Readonly<Record<Language, Messages>> = Object.freeze({ ru, en });

/**
 * Словарь языка.
 *
 * Для чистых функций — инструкций маршрута, подписей мест: язык им передаётся
 * параметром, иначе их нельзя проверить тестом на обоих языках.
 */
export function messagesFor(language: Language): Messages {
  return MESSAGES[language];
}

/** Текущий язык интерфейса — для подписей из данных, которым нужен код языка. */
export function useLanguage(): Language {
  return useSettingsStore((s) => s.language);
}

/** Словарь текущего языка интерфейса. */
export function useMessages(): Messages {
  return MESSAGES[useLanguage()];
}

/**
 * Номер этажа для подписи; подземный — с типографским минусом: «−1».
 *
 * Дефис из «-1» узкий и на мелком шрифте кнопки этажа теряется, а номер без
 * знака отправил бы человека в подвал вместо первого этажа.
 */
export function formatFloor(floor: number): string {
  return floor < 0 ? `−${-floor}` : String(floor);
}

/**
 * Фраза с заглавной буквы.
 *
 * Причины неудачи маршрута в словаре — продолжение предложения («Маршрут не
 * найден: при выбранных ограничениях…»), а в карточке маршрута они стоят
 * отдельной строкой. Второй набор строк ради регистра одной буквы разошёлся бы
 * с первым.
 */
export function capitalize(text: string, language: Language): string {
  return text.charAt(0).toLocaleUpperCase(language) + text.slice(1);
}
