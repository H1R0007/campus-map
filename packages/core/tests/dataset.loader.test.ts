import { describe, expect, it } from 'vitest';
import {
  ALIASES_PATH,
  CAMPUS_GRAPH_PATH,
  CAMPUS_META_PATH,
  TRANSITIONS_PATH,
  buildingMetaPath,
  floorGraphPath,
  loadDataset,
} from '../src/index.js';
import type { DatasetSource } from '../src/index.js';

/**
 * Поведение загрузчика на битых и нестандартных данных.
 *
 * Загрузчик намеренно терпим к ошибкам: редактор обязан открыть сломанный
 * датасет, чтобы его починить. Поэтому важно не только «не упасть», но и
 * честно описать в предупреждениях, что именно сделано с данными.
 *
 * Все наборы здесь — в памяти и синтетические: тесты проверяют код
 * загрузчика, а не содержимое продуктового `data/`.
 */

type Files = Record<string, unknown>;

interface RecordingSource extends DatasetSource {
  requested: string[];
}

/**
 * Источник данных в памяти.
 *
 * @param delayOf задержка ответа по пути — чтобы проверить, что результат
 *        не зависит от порядка прихода ответов при параллельной загрузке
 */
function memorySource(files: Files, delayOf?: (path: string) => number): RecordingSource {
  const requested: string[] = [];

  return {
    requested,
    async readJson(path) {
      requested.push(path);
      const delay = delayOf?.(path) ?? 0;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      return Object.prototype.hasOwnProperty.call(files, path) ? files[path] : null;
    },
  };
}

/** Кампус с двумя корпусами по два этажа — минимум, где порядок имеет значение. */
function twoBuildingFiles(): Files {
  return {
    [CAMPUS_META_PATH]: {
      buildings: [{ id: 'bA', name: 'Корпус А' }, { id: 'bB', name: 'Корпус Б' }],
      mapSize: { width: 100, height: 100 },
    },
    [CAMPUS_GRAPH_PATH]: { nodes: [{ id: 'gate', x: 1, y: 1, neighbors: [] }] },

    [buildingMetaPath('bA')]: { id: 'bA', name: 'Корпус А', floors: [{ floor: 1 }, { floor: 2 }] },
    [floorGraphPath('bA', 1)]: { nodes: [{ id: 'a1', x: 1, y: 1, neighbors: [] }] },
    [floorGraphPath('bA', 2)]: { nodes: [{ id: 'a2', x: 1, y: 1, neighbors: [] }] },

    // У второго корпуса id в файле не совпадает с заявленным, а второго
    // этажа нет вовсе — два разных предупреждения в разных местах.
    [buildingMetaPath('bB')]: { id: 'bB-typo', name: 'Корпус Б', floors: [{ floor: 1 }, { floor: 2 }] },
    [floorGraphPath('bB-typo', 1)]: { nodes: [{ id: 'b1', x: 1, y: 1, neighbors: [] }] },

    [TRANSITIONS_PATH]: { transitions: [] },
    [ALIASES_PATH]: { aliases: [] },
  };
}

describe('loadDataset: параллельная загрузка', () => {
  it('результат не зависит от порядка прихода ответов', async () => {
    const files = twoBuildingFiles();

    // Первый прогон: ответы в порядке запросов. Второй: чем «раньше» файл в
    // алфавите, тем дольше он идёт — порядок прихода почти обратный.
    const inOrder = await loadDataset(memorySource(files));
    const reversed = await loadDataset(
      memorySource(files, (path) => 30 - Math.min(29, path.length))
    );

    expect(reversed.dataset.nodes.map((n) => n.id)).toEqual(inOrder.dataset.nodes.map((n) => n.id));
    expect(reversed.warnings).toEqual(inOrder.warnings);
  });

  it('узлы идут в порядке объявления: кампус, затем корпуса и их этажи', async () => {
    const { dataset } = await loadDataset(memorySource(twoBuildingFiles()));

    expect(dataset.nodes.map((n) => n.id)).toEqual(['gate', 'a1', 'a2', 'b1']);
  });

  it('предупреждения корпуса идут вместе с предупреждениями его этажей', async () => {
    const { warnings } = await loadDataset(memorySource(twoBuildingFiles()));

    const idMismatch = warnings.findIndex((w) => w.includes('не совпадает с заявленным'));
    const missingFloor = warnings.findIndex((w) => w.includes('файл этажа отсутствует'));

    expect(idMismatch).toBeGreaterThanOrEqual(0);
    expect(missingFloor).toBeGreaterThan(idMismatch);
  });

  it('этажи корпуса без метаданных не запрашиваются', async () => {
    const files = twoBuildingFiles();
    delete files[buildingMetaPath('bA')];

    const source = memorySource(files);
    const { warnings } = await loadDataset(source);

    expect(warnings.some((w) => w.includes('метаданные корпуса недоступны'))).toBe(true);
    expect(source.requested).not.toContain(floorGraphPath('bA', 1));
  });
});

describe('loadDataset: координаты узла', () => {
  function withNode(node: Record<string, unknown>): Files {
    return {
      [CAMPUS_META_PATH]: { buildings: [], mapSize: { width: 1, height: 1 } },
      [CAMPUS_GRAPH_PATH]: { nodes: [{ neighbors: [], ...node }] },
    };
  }

  it('число в строке приводится к числу, и предупреждение говорит именно это', async () => {
    const { dataset, warnings } = await loadDataset(
      memorySource(withNode({ id: 'n', x: '10', y: 5 }))
    );

    expect(dataset.nodes[0].x).toBe(10);

    const coordinateWarnings = warnings.filter((w) => w.includes('координата'));
    expect(coordinateWarnings).toHaveLength(1);
    expect(coordinateWarnings[0]).toContain('записана строкой');
    expect(coordinateWarnings[0]).toContain('приведена к числу 10');
    // Раньше здесь печаталось «заменены на 0», хотя значение стало 10.
    expect(coordinateWarnings[0]).not.toContain('заменена на 0');
  });

  it('мусор заменяется нулём с предупреждением по конкретной оси', async () => {
    const { dataset, warnings } = await loadDataset(
      memorySource(withNode({ id: 'n', x: 3, y: 'abc' }))
    );

    expect(dataset.nodes[0].x).toBe(3);
    expect(dataset.nodes[0].y).toBe(0);

    const coordinateWarnings = warnings.filter((w) => w.includes('координата'));
    expect(coordinateWarnings).toHaveLength(1);
    expect(coordinateWarnings[0]).toContain('координата y');
    expect(coordinateWarnings[0]).toContain('заменена на 0');
  });

  it('корректные координаты предупреждений не дают', async () => {
    const { warnings } = await loadDataset(memorySource(withNode({ id: 'n', x: 0, y: 7.5 })));

    expect(warnings.filter((w) => w.includes('координата'))).toEqual([]);
  });
});

describe('loadDataset: идентификаторы', () => {
  it('объект вместо id корпуса отбрасывается, а не превращается в "[object Object]"', async () => {
    const source = memorySource({
      [CAMPUS_META_PATH]: {
        buildings: [{ id: { nested: true }, name: 'Сломанный' }],
        mapSize: { width: 1, height: 1 },
      },
      [CAMPUS_GRAPH_PATH]: { nodes: [] },
    });

    const { dataset, warnings } = await loadDataset(source);

    expect(dataset.campusMeta.buildings).toEqual([]);
    expect(warnings.some((w) => w.includes('корпус без id пропущен'))).toBe(true);
    expect(source.requested.some((path) => path.includes('[object Object]'))).toBe(false);
  });

  it('дублирующийся id: побеждает последнее значение, узел не задваивается', async () => {
    const { dataset, warnings } = await loadDataset(
      memorySource({
        [CAMPUS_META_PATH]: {
          buildings: [{ id: 'bA', name: 'Корпус А' }],
          mapSize: { width: 1, height: 1 },
        },
        [CAMPUS_GRAPH_PATH]: { nodes: [] },
        [buildingMetaPath('bA')]: { id: 'bA', name: 'Корпус А', floors: [{ floor: 1 }, { floor: 2 }] },
        [floorGraphPath('bA', 1)]: { nodes: [{ id: 'dup', x: 1, y: 1, neighbors: [] }] },
        [floorGraphPath('bA', 2)]: { nodes: [{ id: 'dup', x: 2, y: 2, neighbors: [] }] },
      })
    );

    const duplicates = dataset.nodes.filter((n) => n.id === 'dup');

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].floor).toBe(2);
    expect(warnings.filter((w) => w.includes('Дублирующийся id узла'))).toHaveLength(1);
  });
});

describe('loadDataset: метаданные этажа', () => {
  /** Корпус с единственным этажом, описанным переданной записью. */
  function withFloor(floor: Record<string, unknown>): Files {
    return {
      [CAMPUS_META_PATH]: {
        buildings: [{ id: 'bA', name: 'Корпус А' }],
        mapSize: { width: 1, height: 1 },
      },
      [CAMPUS_GRAPH_PATH]: { nodes: [] },
      [buildingMetaPath('bA')]: { id: 'bA', name: 'Корпус А', floors: [floor] },
      [floorGraphPath('bA', 1)]: { nodes: [] },
    };
  }

  it('размер плана этажа читается', async () => {
    const { dataset, warnings } = await loadDataset(
      memorySource(withFloor({ floor: 1, mapSize: { width: 1476, height: 780 } }))
    );

    expect(dataset.buildingMetas[0].floors[0].mapSize).toEqual({ width: 1476, height: 780 });
    expect(warnings.filter((w) => w.includes('mapSize'))).toEqual([]);
  });

  it('некорректный размер отбрасывается с предупреждением, этаж остаётся', async () => {
    const { dataset, warnings } = await loadDataset(
      memorySource(withFloor({ floor: 1, mapSize: { width: '1476', height: 0 } }))
    );

    expect(dataset.buildingMetas[0].floors).toEqual([{ floor: 1 }]);
    expect(warnings.filter((w) => w.includes('mapSize'))).toHaveLength(1);
  });

  it('mapPath и graphPath не читаются: раскладка файлов этажа фиксирована', async () => {
    // Раньше эти поля грузились и выгружались, но адрес всё равно собирался
    // константами — другое имя файла в них давало молчаливый 404.
    const source = memorySource(withFloor({ floor: 1, mapPath: 'plan.jpg', graphPath: 'nodes.json' }));
    const { dataset } = await loadDataset(source);

    expect(dataset.buildingMetas[0].floors).toEqual([{ floor: 1 }]);
    expect(source.requested).toContain(floorGraphPath('bA', 1));
  });
});
