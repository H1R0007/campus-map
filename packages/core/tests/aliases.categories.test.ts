import { describe, expect, it } from 'vitest';
import {
  ALIASES_PATH,
  AliasManager,
  CAMPUS_GRAPH_PATH,
  CAMPUS_META_PATH,
  PLACE_CATEGORIES,
  isPlaceCategory,
  loadDataset,
} from '../src/index.js';
import { memorySource } from './helpers/memorySource.js';

/**
 * Категории мест — по ним быстрые кнопки навигатора ищут ближайший туалет,
 * столовую, гардероб или выход (запись 19).
 */

/** Территория из трёх узлов в ряд и заданные записи алиасов. */
function filesWith(aliases: unknown[]) {
  return {
    [CAMPUS_META_PATH]: { buildings: [], mapSize: { width: 100, height: 100 } },
    [CAMPUS_GRAPH_PATH]: {
      nodes: [
        { id: 'wc', x: 10, y: 10, neighbors: ['hall'] },
        { id: 'hall', x: 20, y: 10, neighbors: ['wc', 'cafe'] },
        { id: 'cafe', x: 30, y: 10, neighbors: ['hall'] },
      ],
    },
    [ALIASES_PATH]: { aliases },
  };
}

const categoryWarnings = (warnings: readonly string[]) => warnings.filter((w) => w.includes('категория места'));

describe('категория места в загрузчике', () => {
  it('читает известную категорию', async () => {
    const { dataset, warnings } = await loadDataset(
      memorySource(
        filesWith([
          { id: 'wc', names: ['Туалет'], category: 'toilet' },
          { id: 'cafe', names: ['Буфет'], category: 'food' },
          { id: 'hall', names: ['Холл'] },
        ])
      )
    );

    expect(categoryWarnings(warnings)).toEqual([]);
    expect(dataset.aliases.map((entry) => [entry.id, entry.category])).toEqual([
      ['wc', 'toilet'],
      ['cafe', 'food'],
      ['hall', undefined],
    ]);
  });

  it('неизвестную категорию отбрасывает с предупреждением, а запись оставляет', async () => {
    const { dataset, warnings } = await loadDataset(
      memorySource(
        filesWith([
          { id: 'wc', names: ['Туалет'], category: 'Toilet' },
          { id: 'cafe', names: ['Буфет'], category: 42 },
        ])
      )
    );

    expect(dataset.aliases.map((entry) => entry.category)).toEqual([undefined, undefined]);
    expect(dataset.aliases.map((entry) => entry.names)).toEqual([['Туалет'], ['Буфет']]);
    expect(categoryWarnings(warnings)).toHaveLength(2);
    expect(categoryWarnings(warnings)[0]).toContain('wc');
  });
});

describe('AliasManager: категории', () => {
  function manager(): AliasManager {
    const aliases = new AliasManager();
    aliases.load([
      { id: 'a1_toilet', names: ['Туалет, 1 этаж'], category: 'toilet' },
      { id: 'b1_canteen', names: ['Буфет'], category: 'food' },
      { id: 'a2_toilet', names: ['Туалет, 2 этаж'], category: 'toilet' },
      { id: 'unnamed_toilet', names: [], category: 'toilet' },
      { id: 'a3_room305', names: ['А-305'] },
    ]);
    return aliases;
  }

  it('отдаёт категорию места', () => {
    const aliases = manager();

    expect(aliases.getCategory('b1_canteen')).toBe('food');
    expect(aliases.getCategory('a3_room305')).toBeNull();
    expect(aliases.getCategory('no_such_node')).toBeNull();
  });

  it('места категории — в порядке данных и только с названием', () => {
    const aliases = manager();

    expect(aliases.getIdsByCategory('toilet')).toEqual(['a1_toilet', 'a2_toilet']);
    expect(aliases.getCategory('unnamed_toilet')).toBeNull();
    expect(aliases.getIdsByCategory('cloakroom')).toEqual([]);
  });

  it('повторная загрузка не оставляет категорий прежнего набора', () => {
    const aliases = manager();
    aliases.load([{ id: 'a1_toilet', names: ['Туалет'] }]);

    expect(aliases.getIdsByCategory('toilet')).toEqual([]);
    expect(aliases.getCategory('a1_toilet')).toBeNull();
  });

  it('список категорий согласован с проверкой значения', () => {
    expect(PLACE_CATEGORIES.every((category) => isPlaceCategory(category))).toBe(true);
    expect(isPlaceCategory('Toilet')).toBe(false);
    expect(isPlaceCategory('')).toBe(false);
  });
});
