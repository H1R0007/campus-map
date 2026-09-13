import { describe, expect, it } from 'vitest';
import { AliasManager } from '@campus-map/core';
import { ambiguousMatches } from '../src/utils/ambiguity';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Неоднозначное название в поле маршрута.
 */

const graph = fixtureGraph();
const aliases = new AliasManager();
aliases.load([
  { id: 'a1_hall', names: ['Столовая', 'Столовая корпуса А'] },
  { id: 'a2_room201', names: ['Столовая'] },
  { id: 'a1_stairs', names: ['Лестница'] },
  { id: 'deleted_node', names: ['Лестница'] },
]);

describe('ambiguousMatches', () => {
  it('точно набранное неоднозначное название даёт все места в порядке данных', () => {
    expect(ambiguousMatches('столовая', graph, aliases)).toEqual(['a1_hall', 'a2_room201']);
  });

  it('однозначное, частичное и неизвестное название вариантов не даёт', () => {
    expect(ambiguousMatches('Столовая корпуса А', graph, aliases)).toEqual([]);
    expect(ambiguousMatches('Стол', graph, aliases)).toEqual([]);
    expect(ambiguousMatches('Бассейн', graph, aliases)).toEqual([]);
    expect(ambiguousMatches('   ', graph, aliases)).toEqual([]);
  });

  it('алиас удалённого узла вариантом не считается', () => {
    // Второе «Лестница» указывает на узел, которого нет в графе: выбирать
    // не из чего, и сообщение о неоднозначности было бы ложным.
    expect(ambiguousMatches('Лестница', graph, aliases)).toEqual([]);
  });
});
