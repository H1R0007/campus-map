import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { PLACE_KINDS_PATH, loadDataset } from '@campus-map/core';
import type { Dataset, DatasetSource } from '@campus-map/core';
import { datasetFiles } from '../src/utils/datasetFiles';
import { BUILT_IN_PLACE_KINDS } from '../src/utils/placeKinds';
import { datasetFromState } from '../src/stores/editor/graphState';
import { fixtureDataset, loadFixture, openFloor, store } from './helpers/fixture';

/**
 * Файлы, которые редактор сохраняет.
 *
 * Главное свойство: сохранённое читается тем же загрузчиком ядра, которым
 * редактор открывал данные, и содержит ровно то, что было в редакторе.
 * Поле, которое читается, но не пишется, молча исчезло бы при первом
 * сохранении — и разметка потерялась бы незаметно.
 */

/** Источник датасета поверх собранных файлов — как ZIP или HTTP. */
function sourceOf(files: Map<string, string>): DatasetSource {
  return {
    async readJson(filePath: string): Promise<unknown | null> {
      const text = files.get(filePath);
      return text === undefined ? null : JSON.parse(text);
    },
  };
}

function sortedNodes(dataset: Dataset) {
  return [...dataset.nodes].sort((a, b) => a.id.localeCompare(b.id));
}

describe('круг «сохранить → открыть»', () => {
  beforeEach(() => loadFixture());

  it('возвращает те же узлы, переходы, названия и метаданные', async () => {
    const before = datasetFromState(store());
    const { dataset, warnings } = await loadDataset(sourceOf(datasetFiles(before)));

    expect(warnings).toEqual([]);
    expect(sortedNodes(dataset)).toEqual(sortedNodes(before));
    expect(dataset.transitions).toEqual(before.transitions);
    expect(dataset.aliases).toEqual(before.aliases);
    expect(dataset.buildingMetas).toEqual(before.buildingMetas);
    expect(dataset.campusMeta).toEqual(before.campusMeta);
  });

  it('сохраняет правки: новый узел, название и заметку', async () => {
    openFloor(1);
    const id = store().addNode(210, 90);
    store().setNodeAliases(id, ['Кладовая']);
    store().setNodeComment(id, 'дверь закрыта после 18:00');
    store().addEdge(id, 'a1_hall');

    const { dataset } = await loadDataset(sourceOf(datasetFiles(datasetFromState(store()))));
    const saved = dataset.nodes.find((node) => node.id === id);

    expect(saved).toBeDefined();
    expect(saved?.building).toBe('building_a');
    expect(saved?.floor).toBe(1);
    expect(saved?.neighbors).toEqual(['a1_hall']);
    expect(saved?.comment).toBe('дверь закрыта после 18:00');
    expect(dataset.aliases.find((alias) => alias.id === id)?.names).toEqual(['Кладовая']);
  });

  it('переводы и категории, которые редактор не правит, не теряются', async () => {
    const { dataset } = await loadDataset(sourceOf(datasetFiles(datasetFromState(store()))));

    expect(dataset.aliases.find((alias) => alias.id === 'a1_room101')?.translations).toEqual({
      en: { names: ['A-101'] },
    });
    expect(dataset.aliases.find((alias) => alias.id === 'campus_gate')?.category).toBe('exit');
    expect(dataset.buildingMetas[0].translations).toEqual({ en: { name: 'Building A' } });
    expect(dataset.buildingMetas[0].placement?.metersPerPixel).toBe(0.1);
  });

  it('нетронутый каталог видов точек файла не создаёт', () => {
    expect(datasetFiles(datasetFromState(store())).has(PLACE_KINDS_PATH)).toBe(false);
  });

  it('заведённый вид точки сохраняется и читается обратно', async () => {
    store().setPlaceKinds(
      [
        ...BUILT_IN_PLACE_KINDS,
        { id: 'medpoint', name: 'Медпункт', icon: 'note', namePattern: 'Медпункт', connect: true, category: 'exit' },
      ],
      'Добавлен вид точки: Медпункт'
    );

    const files = datasetFiles(datasetFromState(store()));
    expect(files.has(PLACE_KINDS_PATH)).toBe(true);

    const { dataset, warnings } = await loadDataset(sourceOf(files));
    expect(warnings).toEqual([]);
    expect(dataset.placeKinds.at(-1)).toEqual({
      id: 'medpoint',
      name: 'Медпункт',
      icon: 'note',
      namePattern: 'Медпункт',
      connect: true,
      category: 'exit',
    });
    // Встроенные виды тоже уходят в файл: дальше видно, что лежит в данных.
    expect(dataset.placeKinds.map((kind) => kind.id)).toContain('stairs');
  });

  it('названия удалённых узлов не сохраняются', async () => {
    store().removeNode('a1_room101');
    const { dataset } = await loadDataset(sourceOf(datasetFiles(datasetFromState(store()))));
    expect(dataset.aliases.map((alias) => alias.id)).not.toContain('a1_room101');
  });

  it('узлы, соседи и переходы фикстуры совпадают с исходным датасетом', async () => {
    const { dataset } = await loadDataset(sourceOf(datasetFiles(fixtureDataset())));
    expect(sortedNodes(dataset)).toEqual(sortedNodes(fixtureDataset()));
  });
});

/**
 * Продуктовый `data/` проверяется только инвариантом, без количеств (запись
 * 10): сохранение нетронутых данных обязано оставить файлы такими же. Иначе
 * первое же сохранение из редактора давало бы шумную правку во всех файлах.
 */
describe('продуктовые данные', () => {
  const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../data');

  it('сохранение без правок не меняет ни одного файла', async () => {
    const diskSource: DatasetSource = {
      async readJson(filePath: string): Promise<unknown | null> {
        try {
          return JSON.parse(readFileSync(path.join(dataDir, filePath), 'utf8'));
        } catch {
          return null;
        }
      },
    };

    const { dataset, warnings } = await loadDataset(diskSource);
    expect(warnings).toEqual([]);

    for (const [relativePath, content] of datasetFiles(dataset)) {
      const onDisk = readFileSync(path.join(dataDir, relativePath), 'utf8');
      expect(content, `${relativePath} изменился бы при сохранении`).toBe(onDisk);
    }
  });
});
