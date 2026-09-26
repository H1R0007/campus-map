import { describe, expect, it } from 'vitest';
import { AliasManager, DEFAULT_PLACE_KINDS, Graph } from '@campus-map/core';
import type { PlaceKind } from '@campus-map/core';
import { exitTermsOfAllLanguages, messagesFor } from '../src/i18n';
import { LANGUAGES } from '../src/i18n/languages';
import { EXIT_TARGET, categoryTermsOf, exitNodesOf, placeKindName } from '../src/utils/placeKinds';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Слова видов мест для поиска: «туалет», «поесть», «toilet» (запись 20).
 * Откуда они берутся, решает каталог видов в данных (запись 44): новый вид,
 * заведённый в редакторе, ищется так же, как встроенный.
 */
describe('слова видов мест для поиска', () => {
  it('у вида — его название на обоих языках и слова из каталога', () => {
    const terms = categoryTermsOf(DEFAULT_PLACE_KINDS);

    expect(terms.toilet).toEqual(expect.arrayContaining(['Туалет', 'Toilet', 'уборная', 'wc']));
    expect(terms.food).toEqual(expect.arrayContaining(['Столовая', 'столовка', 'canteen']));
    // Коридор и помещение — не места быстрого поиска.
    expect(Object.keys(terms).sort()).toEqual(['cloakroom', 'food', 'toilet']);
  });

  it('свой вид из каталога ищется наравне со встроенными', () => {
    const kinds: PlaceKind[] = [
      ...DEFAULT_PLACE_KINDS,
      { id: 'medpoint', name: 'Медпункт', nameEn: 'First aid', place: true, searchTerms: ['врач', ' '] },
    ];

    expect(categoryTermsOf(kinds).medpoint).toEqual(['Медпункт', 'First aid', 'врач']);

    const aliases = new AliasManager();
    aliases.load([{ id: 'a1_med', names: ['Медпункт корпуса А'], category: 'medpoint' }], {
      categoryTerms: categoryTermsOf(kinds),
    });
    expect(aliases.suggest('врач').map((item) => item.id)).toContain('a1_med');
  });

  it('название вида — на языке интерфейса, без перевода — по-русски', () => {
    const kind: PlaceKind = { id: 'medpoint', name: 'Медпункт', place: true };
    expect(placeKindName(kind, 'en')).toBe('Медпункт');
    expect(placeKindName({ ...kind, nameEn: 'First aid' }, 'en')).toBe('First aid');
    expect(placeKindName({ ...kind, nameEn: 'First aid' }, 'ru')).toBe('Медпункт');
  });
});

describe('выход — двери корпусов, а не отмеченные места', () => {
  it('выходы — внутренние концы входов в корпус', () => {
    expect(exitNodesOf(fixtureGraph())).toEqual(['a1_entrance']);
  });

  it('без входов выходов нет', () => {
    const graph = new Graph([{ id: 'a', building: 'building_a', floor: 1, x: 0, y: 0, isPortal: false, neighbors: [] }], []);
    expect(exitNodesOf(graph)).toEqual([]);
  });

  it('слова выхода есть на каждом языке, поиск получает все сразу', () => {
    for (const language of LANGUAGES) {
      expect(messagesFor(language).search.exitTerms.length, language).toBeGreaterThan(0);
    }
    expect(exitTermsOfAllLanguages()).toEqual(expect.arrayContaining(['выход', 'exit']));
    expect(EXIT_TARGET).toMatch(/^@/);
  });
});
