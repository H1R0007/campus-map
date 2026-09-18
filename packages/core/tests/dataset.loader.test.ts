import { describe, expect, it } from 'vitest';
import {
  ALIASES_PATH,
  PLACE_KINDS_PATH,
  CAMPUS_GRAPH_PATH,
  CAMPUS_META_PATH,
  TRANSITIONS_PATH,
  buildingMetaPath,
  floorGraphPath,
  loadDataset,
} from '../src/index.js';
import { memorySource } from './helpers/memorySource.js';
import type { DatasetFiles } from './helpers/memorySource.js';

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

/** Кампус с двумя корпусами по два этажа — минимум, где порядок имеет значение. */
function twoBuildingFiles(): DatasetFiles {
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
  function withNode(node: Record<string, unknown>): DatasetFiles {
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
  function withFloor(floor: Record<string, unknown>): DatasetFiles {
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

describe('loadDataset: входной этаж корпуса', () => {
  /** Корпус с этажами 0 и 1 и заданным значением `entranceFloor`. */
  function withEntrance(entranceFloor: unknown): DatasetFiles {
    return {
      [CAMPUS_META_PATH]: {
        buildings: [{ id: 'bA', name: 'Корпус А' }],
        mapSize: { width: 1, height: 1 },
      },
      [CAMPUS_GRAPH_PATH]: { nodes: [] },
      [buildingMetaPath('bA')]: {
        id: 'bA',
        name: 'Корпус А',
        entranceFloor,
        floors: [{ floor: 0 }, { floor: 1 }],
      },
      [floorGraphPath('bA', 0)]: { nodes: [] },
      [floorGraphPath('bA', 1)]: { nodes: [] },
    };
  }

  it('номер объявленного этажа читается', async () => {
    const { dataset, warnings } = await loadDataset(memorySource(withEntrance(0)));

    expect(dataset.buildingMetas[0].entranceFloor).toBe(0);
    expect(warnings.filter((w) => w.includes('entranceFloor'))).toEqual([]);
  });

  it('этаж, которого нет в списке, отбрасывается с предупреждением', async () => {
    // Навигатор открыл бы по нему несуществующий план — серый холст.
    const { dataset, warnings } = await loadDataset(memorySource(withEntrance(5)));

    expect(dataset.buildingMetas[0].entranceFloor).toBeUndefined();
    expect(warnings.filter((w) => w.includes('entranceFloor'))).toHaveLength(1);
  });

  it('строка вместо числа отбрасывается с предупреждением', async () => {
    const { dataset, warnings } = await loadDataset(memorySource(withEntrance('1')));

    expect(dataset.buildingMetas[0].entranceFloor).toBeUndefined();
    expect(warnings.filter((w) => w.includes('entranceFloor'))).toHaveLength(1);
  });
});

describe('loadDataset: привязка к метрике кампуса', () => {
  const BUILDING_PLACEMENT = {
    metersPerPixel: 0.05,
    originMeters: { x: 120, y: 40 },
    rotationDeg: 15,
    baseElevationMeters: 0.6,
    floorHeightMeters: 3.6,
  };

  /** Кампус и корпус с двумя этажами; поля привязки дописываются поверх. */
  function placed(parts: {
    campus?: Record<string, unknown>;
    building?: Record<string, unknown>;
    floors?: Record<string, unknown>[];
  }): DatasetFiles {
    return {
      [CAMPUS_META_PATH]: {
        buildings: [{ id: 'bA', name: 'Корпус А' }],
        mapSize: { width: 1, height: 1 },
        ...parts.campus,
      },
      [CAMPUS_GRAPH_PATH]: { nodes: [] },
      [buildingMetaPath('bA')]: {
        id: 'bA',
        name: 'Корпус А',
        floors: parts.floors ?? [{ floor: 1 }, { floor: 2 }],
        ...parts.building,
      },
      [floorGraphPath('bA', 1)]: { nodes: [] },
      [floorGraphPath('bA', 2)]: { nodes: [] },
      [TRANSITIONS_PATH]: { transitions: [] },
      [ALIASES_PATH]: { aliases: [] },
    };
  }

  it('полная привязка читается без предупреждений', async () => {
    const { dataset, warnings } = await loadDataset(
      memorySource(placed({ campus: { metersPerPixel: 0.5 }, building: { placement: BUILDING_PLACEMENT } }))
    );

    expect(warnings).toEqual([]);
    expect(dataset.campusMeta.metersPerPixel).toBe(0.5);
    expect(dataset.buildingMetas[0].placement).toEqual(BUILDING_PLACEMENT);
  });

  it('привязка и отметка этажа читаются', async () => {
    const { dataset } = await loadDataset(
      memorySource(
        placed({
          floors: [{ floor: 1, placement: { rotationDeg: 90 }, elevationMeters: -3.2 }, { floor: 2 }],
        })
      )
    );

    expect(dataset.buildingMetas[0].floors[0]).toEqual({
      floor: 1,
      placement: { rotationDeg: 90 },
      elevationMeters: -3.2,
    });
  });

  it('у этажа поля отметки внутри placement не читаются — для этого есть elevationMeters', async () => {
    const { dataset } = await loadDataset(
      memorySource(placed({ floors: [{ floor: 1, placement: { rotationDeg: 0, floorHeightMeters: 5 } }] }))
    );

    expect(dataset.buildingMetas[0].floors[0].placement).toEqual({ rotationDeg: 0 });
  });

  it('некорректное значение отбрасывается с предупреждением, остальные поля остаются', async () => {
    const { dataset, warnings } = await loadDataset(
      memorySource(
        placed({
          campus: { metersPerPixel: 0.5 },
          building: { placement: { ...BUILDING_PLACEMENT, rotationDeg: '15', metersPerPixel: 0 } },
        })
      )
    );

    expect(dataset.buildingMetas[0].placement).toEqual({
      originMeters: BUILDING_PLACEMENT.originMeters,
      baseElevationMeters: BUILDING_PLACEMENT.baseElevationMeters,
      floorHeightMeters: BUILDING_PLACEMENT.floorHeightMeters,
    });
    expect(warnings.some((w) => w.includes('placement.rotationDeg'))).toBe(true);
    expect(warnings.some((w) => w.includes('placement.metersPerPixel'))).toBe(true);
  });

  it('неполная привязка: предупреждение по каждому непривязанному этажу и об отказе от метрики', async () => {
    const { warnings } = await loadDataset(
      memorySource(
        placed({
          campus: { metersPerPixel: 0.5 },
          building: { placement: { metersPerPixel: 0.05, originMeters: { x: 0, y: 0 }, rotationDeg: 0 } },
          floors: [{ floor: 1, elevationMeters: 0 }, { floor: 2 }],
        })
      )
    );

    const unplaced = warnings.filter((w) => w.includes('не привязан к метрике'));
    expect(unplaced).toHaveLength(1);
    expect(unplaced[0]).toContain('этаж 2');
    expect(unplaced[0]).toContain('elevationMeters');
    expect(warnings.some((w) => w.includes('пиксельном режиме'))).toBe(true);
  });

  it('без привязки вовсе о метрике не предупреждает: датасет честно пиксельный', async () => {
    const { warnings } = await loadDataset(memorySource(placed({})));

    expect(warnings).toEqual([]);
  });
});

describe('loadDataset: переводы названий', () => {
  /** Корпус и одно помещение; `translations` дописываются корпусу и алиасу. */
  function translated(parts: { building?: unknown; alias?: unknown }): DatasetFiles {
    return {
      [CAMPUS_META_PATH]: {
        buildings: [{ id: 'bA', name: 'Корпус А' }],
        mapSize: { width: 1, height: 1 },
      },
      [CAMPUS_GRAPH_PATH]: { nodes: [] },
      [buildingMetaPath('bA')]: {
        id: 'bA',
        name: 'Корпус А',
        floors: [{ floor: 1 }],
        translations: parts.building,
      },
      [floorGraphPath('bA', 1)]: { nodes: [{ id: 'a1_library', x: 1, y: 1, neighbors: [] }] },
      [TRANSITIONS_PATH]: { transitions: [] },
      [ALIASES_PATH]: {
        aliases: [{ id: 'a1_library', names: ['Библиотека'], translations: parts.alias }],
      },
    };
  }

  it('переводы корпуса и помещения читаются без предупреждений', async () => {
    const { dataset, warnings } = await loadDataset(
      memorySource(
        translated({
          building: { en: { name: 'Building A' } },
          alias: { en: { names: ['Library', 'library', 'Reading room'] } },
        })
      )
    );

    expect(warnings).toEqual([]);
    expect(dataset.buildingMetas[0].translations).toEqual({ en: { name: 'Building A' } });
    // Повтор формы имени отбрасывается так же, как в основных именах.
    expect(dataset.aliases[0].translations).toEqual({ en: { names: ['Library', 'Reading room'] } });
  });

  it('без переводов поля нет и в результате', async () => {
    // `undefined` в поле экспорт редактора не пишет, но пустой объект записал бы.
    const { dataset } = await loadDataset(memorySource(translated({})));

    expect('translations' in dataset.buildingMetas[0]).toBe(false);
    expect('translations' in dataset.aliases[0]).toBe(false);
  });

  it('код языка не по правилу отбрасывается с предупреждением, остальные переводы остаются', async () => {
    const { dataset, warnings } = await loadDataset(
      memorySource(
        translated({
          building: { EN: { name: 'Building A' }, 'en-US': { name: 'Building A' }, kk: { name: 'А корпусы' } },
        })
      )
    );

    expect(dataset.buildingMetas[0].translations).toEqual({ kk: { name: 'А корпусы' } });
    expect(warnings.filter((w) => w.includes('код языка'))).toHaveLength(2);
  });

  it('перевод без имени отбрасывается с предупреждением', async () => {
    const { dataset, warnings } = await loadDataset(
      memorySource(translated({ building: { en: { name: '' } }, alias: { en: { names: [] } } }))
    );

    expect(dataset.buildingMetas[0].translations).toBeUndefined();
    expect(dataset.aliases[0].translations).toBeUndefined();
    expect(warnings.filter((w) => w.includes('translations.en'))).toHaveLength(2);
  });

  it('translations не объектом — поле пропущено с предупреждением', async () => {
    const { dataset, warnings } = await loadDataset(
      memorySource(translated({ alias: ['Library'] }))
    );

    expect(dataset.aliases[0].translations).toBeUndefined();
    expect(warnings.filter((w) => w.includes('translations'))).toHaveLength(1);
  });
});

/**
 * Каталог видов точек — заготовки редактора (`place-kinds.json`).
 *
 * Навигатор его не читает, поэтому отсутствие файла нормально и молчаливо;
 * а вот битая запись обязана быть названа: разметчик должен понять, почему
 * его кисть пропала.
 */
describe('loadDataset: виды точек', () => {
  it('без файла список пуст и предупреждения о нём нет', async () => {
    const { dataset, warnings } = await loadDataset(memorySource(twoBuildingFiles()));

    expect(dataset.placeKinds).toEqual([]);
    expect(warnings.filter((w) => w.includes(PLACE_KINDS_PATH))).toEqual([]);
  });

  it('читает виды и приводит их к типам ядра', async () => {
    const files = twoBuildingFiles();
    files[PLACE_KINDS_PATH] = {
      kinds: [
        { id: 'room', name: 'Помещение', namePattern: '{корпус}-{этаж}{номер}', connect: true },
        { id: 'stairs', name: 'Лестница', isPortal: true, transition: 'stairs', stack: true, category: 'exit' },
      ],
    };

    const { dataset, warnings } = await loadDataset(memorySource(files));

    expect(warnings.filter((w) => w.includes(PLACE_KINDS_PATH))).toEqual([]);
    expect(dataset.placeKinds).toEqual([
      { id: 'room', name: 'Помещение', namePattern: '{корпус}-{этаж}{номер}', connect: true },
      { id: 'stairs', name: 'Лестница', isPortal: true, transition: 'stairs', stack: true, category: 'exit' },
    ]);
  });

  it('вид без названия и с неизвестными значениями назван в предупреждениях', async () => {
    const files = twoBuildingFiles();
    files[PLACE_KINDS_PATH] = {
      kinds: [
        { id: 'broken' },
        { id: 'weird', name: 'Странный', transition: 'телепорт', category: 'банкомат' },
      ],
    };

    const { dataset, warnings } = await loadDataset(memorySource(files));

    expect(dataset.placeKinds).toEqual([{ id: 'weird', name: 'Странный' }]);
    expect(warnings.filter((w) => w.includes(PLACE_KINDS_PATH))).toHaveLength(3);
  });
});
