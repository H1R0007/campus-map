import type { Language } from './languages';

/** Формы слова по категориям множественного числа; `other` обязательна. */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

const rulesByLanguage = new Map<Language, Intl.PluralRules>();

/**
 * Форма слова для числа по правилам языка: «1 этаж, 2 этажа, 5 этажей».
 *
 * `Intl.PluralRules` встроен в браузер и работает офлайн. Своя таблица правил
 * была бы вторым, почти наверняка неполным их описанием: у русского «21 этаж»,
 * но «11 этажей».
 */
export function pluralize(language: Language, count: number, forms: PluralForms): string {
  let rules = rulesByLanguage.get(language);
  if (rules === undefined) {
    rules = new Intl.PluralRules(language);
    rulesByLanguage.set(language, rules);
  }

  return forms[rules.select(count)] ?? forms.other;
}
