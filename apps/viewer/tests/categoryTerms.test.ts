import { describe, expect, it } from 'vitest';
import { PLACE_CATEGORIES } from '@campus-map/core';
import { categoryTermsOfAllLanguages, messagesFor } from '../src/i18n';
import { LANGUAGES } from '../src/i18n/languages';

/**
 * Слова категорий мест для поиска: «туалет», «поесть», «toilet» (запись 20).
 */
describe('слова категорий для поиска', () => {
  it('у каждой категории есть слова на каждом языке', () => {
    for (const language of LANGUAGES) {
      for (const category of PLACE_CATEGORIES) {
        expect(messagesFor(language).search.categoryTerms[category].length, `${language}: ${category}`).toBeGreaterThan(0);
      }
    }
  });

  it('поиск получает слова всех языков сразу', () => {
    const terms = categoryTermsOfAllLanguages();

    expect(terms.toilet).toEqual(expect.arrayContaining(['туалет', 'toilet']));
    expect(terms.food).toEqual(expect.arrayContaining(['столовка', 'canteen']));
    expect(Object.keys(terms).sort()).toEqual([...PLACE_CATEGORIES].sort());
  });
});
