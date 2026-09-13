import { describe, expect, it } from 'vitest';
import { AliasManager } from '@campus-map/core';
import type { Language } from '../src/i18n/languages';
import { suggestionOptions } from '../src/utils/suggestions';

/**
 * Подсказки поиска на языке интерфейса.
 *
 * Ядро ищет по именам на всех языках и отдаёт совпавшую форму имени. Показывать
 * её как есть нельзя: русский интерфейс предлагал «Canteen».
 */

const ALIASES = [
  { id: 'a1_canteen', names: ['Столовая'], translations: { en: { names: ['Canteen'] } } },
  { id: 'b1_library', names: ['Библиотека', 'Читальный зал'], translations: { en: { names: ['Library'] } } },
  { id: 'a1_room101', names: ['А-101', '101'] },
];

function optionsFor(query: string, language: Language, limit = 5) {
  const aliasManager = new AliasManager();
  aliasManager.load(ALIASES);
  return suggestionOptions(aliasManager.suggest(query, Number.POSITIVE_INFINITY), aliasManager, language, limit);
}

describe('подсказки поиска', () => {
  it('показывают имя на языке интерфейса, а совпавший перевод — второй строкой', () => {
    expect(optionsFor('canteen', 'ru')).toEqual([{ id: 'a1_canteen', name: 'Столовая', matched: 'Canteen' }]);
  });

  it('не повторяют имя второй строкой, если совпало имя на языке интерфейса', () => {
    expect(optionsFor('canteen', 'en')).toEqual([{ id: 'a1_canteen', name: 'Canteen', matched: null }]);
  });

  it('объясняют совпадение по другому названию того же места', () => {
    expect(optionsFor('читальный', 'ru')).toEqual([
      { id: 'b1_library', name: 'Библиотека', matched: 'Читальный зал' },
    ]);
  });

  it('схлопывают формы имени одного места в одну подсказку', () => {
    // «101» совпадает и с «101», и с «А-101»; номер виден в основном имени.
    expect(optionsFor('101', 'ru')).toEqual([{ id: 'a1_room101', name: 'А-101', matched: null }]);
  });

  it('место без перевода показывают исходным именем', () => {
    expect(optionsFor('101', 'en')).toEqual([{ id: 'a1_room101', name: 'А-101', matched: null }]);
  });

  it('ограничивают число мест, а не форм имени', () => {
    const options = optionsFor('а', 'ru', 2);

    expect(options).toHaveLength(2);
    expect(new Set(options.map((option) => option.id)).size).toBe(2);
  });
});
