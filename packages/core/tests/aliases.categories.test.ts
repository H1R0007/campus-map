import { describe, expect, it } from 'vitest';
import {
  ALIASES_PATH,
  AliasManager,
  CAMPUS_GRAPH_PATH,
  CAMPUS_META_PATH,
  DEFAULT_PLACE_KINDS,
  PLACE_KINDS_PATH,
  loadDataset,
  searchablePlaceKinds,
} from '../src/index.js';
import { memorySource } from './helpers/memorySource.js';

/**
 * Виды мест — по ним быстрые кнопки навигатора ищут ближайший туалет или
 * столовую (запись 19). Какие виды бывают, знает каталог видов в данных
 * (запись 44); без своего каталога действует затравка ядра.
 */

/** Территория из трёх узлов в ряд, заданные записи алиасов и, если нужно, свой каталог видов. */
function filesWith(aliases: unknown[], kinds?: unknown[]) {
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
    ...(kinds ? { [PLACE_KINDS_PATH]: { kinds } } : {}),
  };
}

const categoryWarnings = (warnings: readonly string[]) => warnings.filter((w) => w.includes('вид места') || w.includes('вида места') || w.includes('«выход»'));

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

  it('вид места, которого нет в каталоге, отбрасывает с предупреждением, а запись оставляет', async () => {
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
    expect(categoryWarnings(warnings).some((warning) => warning.includes('wc'))).toBe(true);
    expect(categoryWarnings(warnings).some((warning) => warning.includes('cafe'))).toBe(true);
  });

  it('свой вид из каталога данных — такой же вид места, как встроенный', async () => {
    const { dataset, warnings } = await loadDataset(
      memorySource(
        filesWith(
          [{ id: 'wc', names: ['Медпункт'], category: 'medpoint' }],
          [{ id: 'medpoint', name: 'Медпункт', place: true, quick: true, searchTerms: ['врач'] }]
        )
      )
    );

    expect(categoryWarnings(warnings)).toEqual([]);
    expect(dataset.aliases[0].category).toBe('medpoint');
  });

  it('вид из каталога, который не место быстрого поиска, видом места не бывает', async () => {
    const { dataset, warnings } = await loadDataset(
      memorySource(filesWith([{ id: 'hall', names: ['Холл'], category: 'corridor' }], [{ id: 'corridor', name: 'Коридор' }]))
    );

    expect(dataset.aliases[0].category).toBeUndefined();
    expect(categoryWarnings(warnings)).toHaveLength(1);
  });

  it('прежняя отметка «выход» снимается с понятным объяснением', async () => {
    const { dataset, warnings } = await loadDataset(
      memorySource(filesWith([{ id: 'hall', names: ['Проходная'], category: 'exit' }]))
    );

    expect(dataset.aliases[0].category).toBeUndefined();
    expect(categoryWarnings(warnings)).toHaveLength(1);
    expect(categoryWarnings(warnings)[0]).toContain('по входам');
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

  it('затравка каталога: места быстрого поиска — туалет, столовая, гардероб', () => {
    expect(searchablePlaceKinds([]).map((kind) => kind.id)).toEqual(['toilet', 'food', 'cloakroom']);
    // У каждого места быстрого поиска есть всё, что нужно навигатору.
    for (const kind of searchablePlaceKinds([])) {
      expect(kind.nameEn, kind.id).toBeTruthy();
      expect(kind.iconImage, kind.id).toMatch(/^data:image\/svg\+xml,/);
      expect(kind.searchTerms?.length, kind.id).toBeGreaterThan(0);
    }
    expect(DEFAULT_PLACE_KINDS.map((kind) => kind.id)).toEqual(['corridor', 'room', 'toilet', 'food', 'cloakroom']);
  });

  it('слова вида находят все его места', () => {
    const aliases = new AliasManager();
    aliases.load(
      [
        { id: 'med1', names: ['Медпункт корпуса А'], category: 'medpoint' },
        { id: 'room', names: ['А-305'] },
      ],
      { categoryTerms: { medpoint: ['врач', 'медпункт'] } }
    );

    const found = aliases.suggest('врач');
    expect(found.map((item) => item.id)).toContain('med1');
    expect(found.find((item) => item.id === 'med1')?.viaCategory).toBe('medpoint');
  });
});
