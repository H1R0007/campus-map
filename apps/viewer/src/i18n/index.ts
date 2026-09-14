import { PLACE_CATEGORIES } from '@campus-map/core';
import type { PlaceCategory } from '@campus-map/core';
import { useSettingsStore } from '../stores/settingsStore';
import { en } from './en';
import { LANGUAGES } from './languages';
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

/**
 * Слова категорий мест на всех языках интерфейса — для поиска (`AliasManager`).
 *
 * Все языки сразу: студент набирает «toilet», не переключив интерфейс, — так же,
 * как поиск находит место по имени на любом языке.
 */
export function categoryTermsOfAllLanguages(): Record<PlaceCategory, string[]> {
  const terms = {} as Record<PlaceCategory, string[]>;
  for (const category of PLACE_CATEGORIES) {
    terms[category] = LANGUAGES.flatMap((language) => MESSAGES[language].search.categoryTerms[category]);
  }
  return terms;
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
