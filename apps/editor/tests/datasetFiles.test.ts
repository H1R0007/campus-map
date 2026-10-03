import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { PLACE_KINDS_PATH, loadDataset } from '@campus-map/core';
import type { Dataset, DatasetSource } from '@campus-map/core';
import { datasetFiles } from '../src/utils/datasetFiles';
import { BUILT_IN_PLACE_KINDS } from '../src/utils/placeKinds';
import { datasetFromState } from '../src/stores/editor/graphState';
import { useEditorStore } from '../src/stores/editorStore';
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

  it('ориентир и фото точки сохраняются и читаются обратно — в порядке полей формата', async () => {
    const landmark = {
      name: 'Кофейный автомат',
      at: 'у кофейного автомата',
      translations: { en: { name: 'Coffee machine', at: 'at the coffee machine' } },
    };
    const photos = [
      { file: '3f2a9c1b7d4e8a01.webp', width: 1600, height: 1200 },
      { file: 'aaaaaaaaaaaaaaaa.png', width: 640, height: 480 },
    ];
    useEditorStore.setState((s) => {
      const node = s.nodes.get('a1_hall')!;
      node.landmark = landmark;
      node.photos = photos;
    });

    const files = datasetFiles(datasetFromState(store()));
    const { dataset, warnings } = await loadDataset(sourceOf(files));
    const saved = dataset.nodes.find((node) => node.id === 'a1_hall');

    expect(warnings).toEqual([]);
    expect(saved?.landmark).toEqual(landmark);
    expect(saved?.photos).toEqual(photos);
    const written = JSON.parse(files.get('buildings/building_a/floors/1/graph.json')!).nodes.find(
      (node: { id: string }) => node.id === 'a1_hall'
    );
    expect(Object.keys(written).slice(-2)).toEqual(['landmark', 'photos']);
    expect(Object.keys(written.landmark)).toEqual(['name', 'at', 'translations']);
  });

  it('рамки размытия фото сохраняются округлёнными наружу и не выходят за фото (запись 88)', async () => {
    useEditorStore.setState((s) => {
      s.nodes.get('a1_hall')!.photos = [
        {
          file: '3f2a9c1b7d4e8a01.webp',
          width: 1600,
          height: 1200,
          blur: [
            { x: 0.12341, y: 0.2, width: 0.1, height: 0.333333 },
            { x: 0.9, y: 0.95, width: 0.1000001, height: 0.0500002 },
          ],
        },
        { file: 'aaaaaaaaaaaaaaaa.png', width: 640, height: 480, blur: [] },
      ];
    });

    const files = datasetFiles(datasetFromState(store()));
    const { dataset, warnings } = await loadDataset(sourceOf(files));
    const [blurred, plain] = dataset.nodes.find((node) => node.id === 'a1_hall')!.photos!;

    expect(warnings).toEqual([]);
    expect(blurred.blur).toEqual([
      { x: 0.1234, y: 0.2, width: 0.1001, height: 0.3334 },
      { x: 0.9, y: 0.95, width: 0.1, height: 0.05 },
    ]);
    // Пустой список не пишется.
    expect(plain).not.toHaveProperty('blur');
  });

  it('копия точки не уносит её ориентир и фото: на новом месте они неверны', () => {
    useEditorStore.setState((s) => {
      const node = s.nodes.get('a1_hall')!;
      node.landmark = { name: 'Кофейный автомат' };
      node.photos = [{ file: '3f2a9c1b7d4e8a01.webp', width: 1600, height: 1200 }];
      s.selectedNodeIds = new Set(['a1_hall']);
    });

    store().duplicateSelected();
    const [copyId] = store().selectedNodeIds;
    const copy = store().nodes.get(copyId);

    expect(copyId).not.toBe('a1_hall');
    expect(copy?.landmark).toBeUndefined();
    expect(copy?.photos).toBeUndefined();
  });

  it('подпись этажа сохраняется и читается обратно', async () => {
    useEditorStore.setState((s) => {
      s.buildingMetas.get('building_a')!.floors[1].label = '2А';
    });

    const { dataset } = await loadDataset(sourceOf(datasetFiles(datasetFromState(store()))));
    expect(dataset.buildingMetas[0].floors.map((floor) => floor.label)).toEqual([undefined, '2А']);
  });

  it('запись об исходнике плана сохраняется и читается обратно — у этажа и территории', async () => {
    const floorSource = {
      file: '3f2a9c1b04de7a1c.pdf',
      name: 'Корпус А.pdf',
      page: 2,
      pageSize: { width: 842, height: 595 },
      rotation: 90,
      crop: { x: 10, y: 20, width: 500, height: 400 },
      metersPerUnit: 0.0705556,
    };
    const campusSource = { file: 'a1b2c3d4e5f60718.jpg', pageSize: { width: 4000, height: 3000 } };
    useEditorStore.setState((s) => {
      s.buildingMetas.get('building_a')!.floors[0].source = floorSource;
      s.campusMeta!.source = campusSource;
    });

    const files = datasetFiles(datasetFromState(store()));
    const { dataset, warnings } = await loadDataset(sourceOf(files));

    expect(warnings).toEqual([]);
    expect(dataset.buildingMetas[0].floors[0].source).toEqual(floorSource);
    expect(dataset.campusMeta.source).toEqual(campusSource);
    // Поля — в порядке формата, чтобы правка давала понятную разницу в git.
    const meta = JSON.parse(files.get('buildings/building_a/meta.json')!);
    expect(Object.keys(meta.floors[0].source)).toEqual(['file', 'name', 'page', 'pageSize', 'rotation', 'crop', 'metersPerUnit']);
  });

  it('переводы и категории, которые редактор не правит, не теряются', async () => {
    const { dataset } = await loadDataset(sourceOf(datasetFiles(datasetFromState(store()))));

    expect(dataset.aliases.find((alias) => alias.id === 'a1_room101')?.translations).toEqual({
      en: { names: ['A-101'] },
    });
    expect(dataset.aliases.find((alias) => alias.id === 'campus_gate')?.category).toBe('cloakroom');
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
        {
          id: 'medpoint',
          name: 'Медпункт',
          nameEn: 'First aid',
          icon: 'note',
          searchTerms: ['врач'],
          place: true,
          quick: true,
          namePattern: 'Медпункт',
          connect: true,
        },
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
      nameEn: 'First aid',
      icon: 'note',
      searchTerms: ['врач'],
      place: true,
      quick: true,
      namePattern: 'Медпункт',
      connect: true,
    });
    // Встроенные виды тоже уходят в файл: дальше видно, что лежит в данных.
    expect(dataset.placeKinds.map((kind) => kind.id)).toContain('toilet');
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
