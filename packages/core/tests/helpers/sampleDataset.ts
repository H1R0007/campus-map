import {
  ALIASES_PATH,
  CAMPUS_GRAPH_PATH,
  CAMPUS_META_PATH,
  TRANSITIONS_PATH,
  buildingMetaPath,
  floorGraphPath,
  loadDataset,
} from '../../src/index.js';
import type { Dataset, DatasetLoadResult } from '../../src/index.js';
import { memorySource } from './memorySource.js';
import type { DatasetFiles } from './memorySource.js';

/**
 * Небольшой синтетический кампус для тестов ядра.
 *
 * Продуктовый `data/` здесь намеренно не используется: его правит команда
 * разметки, и тесты кода не должны ломаться от правки данных. Раньше тесты
 * утверждали «3 корпуса, 6 переходов, 21 алиас» прямо по `data/`. Реальные
 * данные проверяет только `dataset.real.test.ts` — инвариантами, без чисел.
 *
 * Датасет задан файлами в памяти и грузится через `loadDataset`, поэтому
 * загрузчик участвует в каждом тесте, как и в продукте.
 *
 * Раскладка (`──` — ребро этажа, `══` — переход):
 *
 *   Территория (4 узла):
 *     campus_gate ── campus_square ─┬─ campus_entrance_a ══ a1_entrance
 *                                   └─ campus_entrance_b ══ b1_entrance
 *
 *   Корпус А
 *     этаж 1 (6):  a1_entrance ── a1_lobby ─┬─ a1_corridor ─┬─ a1_room101
 *                                           │               └─ a1_room102
 *                                           └─ a1_stairs
 *     этаж 2 (3):  a2_stairs ── a2_corridor ── a2_room201
 *     этаж 3 (4):  a3_stairs ── a3_corridor ─┬─ a3_room301
 *                                            └─ a3_conference
 *     лестница:    a1_stairs ══ a2_stairs ══ a3_stairs
 *
 *   Корпус Б
 *     этаж 1 (3):  b1_entrance ── b1_hall ── b1_library
 *
 * Итого 20 узлов, 4 перехода, 7 записей алиасов с 20 формами имён. Топология —
 * дерево: объездов нет, у каждой пары точек ровно один путь, а на этаж 3
 * корпуса А можно попасть только по лестнице.
 */

/** Узел в том виде, в каком он лежит в `graph.json`. */
function node(id: string, x: number, y: number, neighbors: string[], isPortal = false) {
  return { id, x, y, neighbors, isPortal };
}

const SAMPLE_FILES: DatasetFiles = {
  [CAMPUS_META_PATH]: {
    buildings: [
      { id: 'building_a', name: 'Корпус А' },
      { id: 'building_b', name: 'Корпус Б' },
    ],
    mapSize: { width: 1000, height: 800 },
  },
  [CAMPUS_GRAPH_PATH]: {
    nodes: [
      node('campus_gate', 500, 750, ['campus_square']),
      node('campus_square', 500, 500, ['campus_gate', 'campus_entrance_a', 'campus_entrance_b']),
      node('campus_entrance_a', 200, 300, ['campus_square'], true),
      node('campus_entrance_b', 800, 300, ['campus_square'], true),
    ],
  },

  [buildingMetaPath('building_a')]: {
    id: 'building_a',
    name: 'Корпус А',
    floors: [{ floor: 1 }, { floor: 2 }, { floor: 3 }],
  },
  [floorGraphPath('building_a', 1)]: {
    nodes: [
      node('a1_entrance', 200, 400, ['a1_lobby'], true),
      node('a1_lobby', 200, 300, ['a1_entrance', 'a1_corridor', 'a1_stairs']),
      node('a1_corridor', 200, 200, ['a1_lobby', 'a1_room101', 'a1_room102']),
      node('a1_room101', 100, 200, ['a1_corridor']),
      node('a1_room102', 300, 200, ['a1_corridor']),
      node('a1_stairs', 300, 300, ['a1_lobby'], true),
    ],
  },
  [floorGraphPath('building_a', 2)]: {
    nodes: [
      node('a2_stairs', 300, 300, ['a2_corridor'], true),
      node('a2_corridor', 200, 200, ['a2_stairs', 'a2_room201']),
      node('a2_room201', 100, 200, ['a2_corridor']),
    ],
  },
  [floorGraphPath('building_a', 3)]: {
    nodes: [
      node('a3_stairs', 300, 300, ['a3_corridor'], true),
      node('a3_corridor', 200, 200, ['a3_stairs', 'a3_room301', 'a3_conference']),
      node('a3_room301', 100, 200, ['a3_corridor']),
      node('a3_conference', 300, 200, ['a3_corridor']),
    ],
  },

  [buildingMetaPath('building_b')]: {
    id: 'building_b',
    name: 'Корпус Б',
    floors: [{ floor: 1 }],
  },
  [floorGraphPath('building_b', 1)]: {
    nodes: [
      node('b1_entrance', 500, 400, ['b1_hall'], true),
      node('b1_hall', 500, 300, ['b1_entrance', 'b1_library']),
      node('b1_library', 400, 300, ['b1_hall']),
    ],
  },

  [TRANSITIONS_PATH]: {
    transitions: [
      { from: { node: 'campus_entrance_a' }, to: { node: 'a1_entrance' }, transition_type: 'entrance' },
      { from: { node: 'campus_entrance_b' }, to: { node: 'b1_entrance' }, transition_type: 'entrance' },
      { from: { node: 'a1_stairs' }, to: { node: 'a2_stairs' }, transition_type: 'stairs' },
      { from: { node: 'a2_stairs' }, to: { node: 'a3_stairs' }, transition_type: 'stairs' },
    ],
  },

  [ALIASES_PATH]: {
    aliases: [
      { id: 'campus_gate', names: ['Главный вход', 'Ворота', 'Проходная', 'Вход в кампус'] },
      { id: 'a1_room101', names: ['А-101', 'Аудитория 101', '101'] },
      { id: 'a1_room102', names: ['А-102', 'Аудитория 102', '102'] },
      { id: 'a2_room201', names: ['А-201', 'Аудитория 201', '201'] },
      { id: 'a3_room301', names: ['А-301', 'Аудитория 301', '301'] },
      { id: 'a3_conference', names: ['Конференц-зал', 'Зал заседаний'] },
      { id: 'b1_library', names: ['Библиотека', 'Читальный зал'] },
    ],
  },
};

let cached: Promise<DatasetLoadResult> | null = null;

/**
 * Загружает синтетический кампус.
 *
 * Результат общий на весь прогон: датасет в тестах не меняется, а `Graph` и
 * `AliasManager` строятся тестами из него заново.
 */
export function loadSampleDataset(): Promise<DatasetLoadResult> {
  cached ??= loadDataset(memorySource(SAMPLE_FILES));
  return cached;
}

/** Синтетический кампус без обёртки результата загрузки. */
export async function sampleDataset(): Promise<Dataset> {
  const { dataset } = await loadSampleDataset();
  return dataset;
}
