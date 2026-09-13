import type { AliasEntry } from '../types/alias.js';
import type { BuildingMeta, CampusMeta, FloorMeta } from '../types/building.js';
import type { DatasetLoadResult, DatasetSource } from '../types/dataset.js';
import type { MapNode, MapNodeData } from '../types/node.js';
import type { Transition, TransitionData } from '../types/transition.js';
import { isTransitionType, parseTransitionType } from '../types/transition.js';
import {
  CAMPUS_BUILDING_ID,
  CAMPUS_FLOOR,
  CAMPUS_GRAPH_PATH,
  CAMPUS_META_PATH,
  ALIASES_PATH,
  TRANSITIONS_PATH,
  buildingMetaPath,
  floorGraphPath,
} from './paths.js';

/**
 * Единственная реализация загрузки датасета.
 *
 * Раньше один и тот же пайплайн «campus/meta → campus/graph → meta и graph
 * каждого этажа → transitions → aliases» был написан трижды (во viewer, в
 * редакторе и в импорте из ZIP) и эти копии успели разойтись: редактор не
 * нормализовал типы переходов и подставлял невалидный fallback `'unknown'`.
 * Теперь нормализация одна, а различается только источник байтов.
 */

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Достаёт массив объектов из поля записи.
 *
 * Принимает именно родителя и имя поля, а не готовое значение: так
 * невозможно перепутать аргументы и молча получить пустой результат.
 * Отсутствие поля считается нормой (пустой массив), неверный тип —
 * предупреждением.
 */
function asRecordArray(parent: unknown, field: string, path: string, warnings: string[]): Raw[] {
  const value = isRecord(parent) ? parent[field] : undefined;
  if (value === undefined || value === null) return [];

  if (!Array.isArray(value)) {
    warnings.push(`${path}: поле "${field}" должно быть массивом, получено ${typeof value}`);
    return [];
  }

  const result: Raw[] = [];
  for (const item of value) {
    if (isRecord(item)) {
      result.push(item);
    } else {
      warnings.push(`${path}: элемент "${field}" не является объектом и пропущен`);
    }
  }
  return result;
}

function asFiniteNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Приводит сырой узел к `MapNode`.
 *
 * `building` и `floor` берутся из расположения файла, а не из JSON: экспорт
 * их не записывает, и именно путь является источником истины. Если в файле
 * всё же оказались свои значения и они расходятся — это признак ручной
 * правки данных, о чём сообщается предупреждением.
 */
function normalizeNode(
  raw: MapNodeData & Raw,
  building: string,
  floor: number,
  path: string,
  warnings: string[]
): MapNode | null {
  if (typeof raw.id !== 'string' || raw.id.length === 0) {
    warnings.push(`${path}: узел без id пропущен`);
    return null;
  }

  if (raw.building !== undefined && raw.building !== building) {
    warnings.push(
      `${path}: узел "${raw.id}" объявлен в корпусе "${raw.building}", ` +
        `но лежит в файле корпуса "${building}" — использовано значение из пути`
    );
  }
  if (raw.floor !== undefined && raw.floor !== floor) {
    warnings.push(
      `${path}: узел "${raw.id}" объявлен на этаже ${raw.floor}, ` +
        `но лежит в файле этажа ${floor} — использовано значение из пути`
    );
  }

  const x = asFiniteNumber(raw.x, 0);
  const y = asFiniteNumber(raw.y, 0);

  // Сообщение формируется по каждой оси отдельно. Раньше одно общее
  // «заменены на 0» печаталось и тогда, когда координата была числом в
  // строке ("10") и на деле приведена к 10, и тогда, когда битой была только
  // одна ось из двух. Разметчик получал неверное описание того, что сделано
  // с его данными.
  for (const [axis, rawValue, value] of [
    ['x', raw.x, x],
    ['y', raw.y, y],
  ] as const) {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) continue;

    // NaN как значение по умолчанию отличает «строку-число, приведённую к
    // числу» от «мусора, заменённого нулём», не повторяя правил
    // `asFiniteNumber` второй раз.
    const coerced = Number.isFinite(asFiniteNumber(rawValue, Number.NaN));

    warnings.push(
      coerced
        ? `${path}: у узла "${raw.id}" координата ${axis} записана строкой ` +
            `("${String(rawValue)}") — приведена к числу ${value}`
        : `${path}: у узла "${raw.id}" некорректная координата ${axis} ` +
            `(${String(rawValue)}) — заменена на 0`
    );
  }

  const node: MapNode = {
    id: raw.id,
    x,
    y,
    floor,
    building,
    isPortal: raw.isPortal === true,
    neighbors: asStringArray(raw.neighbors),
  };

  const comment = asOptionalString(raw.comment);
  if (comment !== undefined) {
    node.comment = comment;
  }

  return node;
}

function normalizeTransition(
  raw: TransitionData & Raw,
  path: string,
  warnings: string[]
): Transition | null {
  const fromNode = isRecord(raw.from) ? asOptionalString(raw.from.node) : undefined;
  const toNode = isRecord(raw.to) ? asOptionalString(raw.to.node) : undefined;

  if (!fromNode || !toNode) {
    warnings.push(`${path}: переход без from.node/to.node пропущен (${JSON.stringify(raw)})`);
    return null;
  }

  const rawType = asOptionalString(raw.transition_type);
  const type = parseTransitionType(rawType ?? 'entrance');

  if (rawType !== undefined && !isTransitionType(rawType.toLowerCase().trim())) {
    warnings.push(
      `${path}: неизвестный тип перехода "${rawType}" для ${fromNode} → ${toNode}, ` +
        `заменён на "${type}"`
    );
  }

  return { fromNode, toNode, type };
}

function normalizeAlias(raw: AliasEntry & Raw, path: string, warnings: string[]): AliasEntry | null {
  if (typeof raw.id !== 'string' || raw.id.length === 0) {
    warnings.push(`${path}: запись алиасов без id пропущена`);
    return null;
  }

  const names = [
    ...asStringArray(raw.names),
    ...(asOptionalString(raw.name) !== undefined ? [raw.name as string] : []),
  ];

  // Дедупликация с сохранением порядка: первое имя считается основным и
  // используется в пошаговых инструкциях маршрута.
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }

  return { id: raw.id, names: unique };
}

function normalizeFloors(
  rawMeta: unknown,
  path: string,
  warnings: string[]
): FloorMeta[] {
  const floors: FloorMeta[] = [];

  for (const item of asRecordArray(rawMeta, 'floors', path, warnings)) {
    const floor = asFiniteNumber(item.floor, Number.NaN);
    if (!Number.isFinite(floor)) {
      warnings.push(`${path}: этаж без корректного номера пропущен`);
      continue;
    }

    floors.push({
      floor,
      mapPath: asOptionalString(item.mapPath) ?? 'map.png',
      graphPath: asOptionalString(item.graphPath) ?? 'graph.json',
    });
  }

  return floors;
}

/**
 * Загружает и нормализует весь датасет из произвольного источника.
 *
 * Отсутствие корпуса или этажа не прерывает загрузку: частичные данные
 * лучше полного отказа, а редактор всё равно должен уметь открыть битый
 * датасет, чтобы починить его. Все находки собираются в `warnings`.
 *
 * @throws только если недоступен `campus/meta.json` — без него структуру
 *         кампуса восстановить невозможно.
 */
export async function loadDataset(source: DatasetSource): Promise<DatasetLoadResult> {
  const warnings: string[] = [];

  const rawCampusMeta = await source.readJson(CAMPUS_META_PATH);
  if (!isRecord(rawCampusMeta)) {
    throw new Error(`Не удалось прочитать ${CAMPUS_META_PATH}`);
  }

  const campusMeta: CampusMeta = {
    buildings: asRecordArray(rawCampusMeta, 'buildings', CAMPUS_META_PATH, warnings).map(
      (b) => {
        // `asOptionalString`, а не `String(...)`: объект в поле id иначе
        // превращался в корпус "[object Object]" и порождал запрос
        // `buildings/[object Object]/meta.json` с невнятным предупреждением
        // вместо честного «корпус без id».
        const name = asOptionalString(b.name);
        return {
          id: asOptionalString(b.id) ?? '',
          ...(name !== undefined ? { name } : {}),
        };
      }
    ).filter((b) => {
      if (b.id.length > 0) return true;
      warnings.push(`${CAMPUS_META_PATH}: корпус без id пропущен`);
      return false;
    }),
    mapSize: isRecord(rawCampusMeta.mapSize)
      ? {
          width: asFiniteNumber(rawCampusMeta.mapSize.width, 1200),
          height: asFiniteNumber(rawCampusMeta.mapSize.height, 800),
        }
      : { width: 1200, height: 800 },
  };
  if (!isRecord(rawCampusMeta.mapSize)) {
    warnings.push(`${CAMPUS_META_PATH}: нет mapSize, использован размер по умолчанию 1200×800`);
  }

  // Все остальные чтения зависят только от списка корпусов, но не от
  // содержимого друг друга. Раньше они шли цепочкой `await` во вложенных
  // циклах: на целевом объёме (5+ корпусов, до 11 этажей) это ~64
  // последовательных запроса, то есть секунды задержки до первой отрисовки
  // на мобильной сети. Теперь — две параллельные волны.
  //
  // Разбор результатов при этом идёт строго в порядке объявления. Иначе
  // `warnings` перемешивались бы между запусками, а «последнее значение» у
  // дублирующегося id узла зависело бы от того, какой ответ пришёл раньше.

  // Волна 1: всё, что определяется списком корпусов.
  const [rawCampusGraph, rawMetas, rawTransitions, rawAliases] = await Promise.all([
    source.readJson(CAMPUS_GRAPH_PATH),
    Promise.all(campusMeta.buildings.map((entry) => source.readJson(buildingMetaPath(entry.id)))),
    source.readJson(TRANSITIONS_PATH),
    source.readJson(ALIASES_PATH),
  ]);

  // Метаданные корпусов разбираются сразу: список этажей нужен второй волне.
  // Предупреждения копятся по корпусам и выпускаются ниже вместе с
  // предупреждениями их этажей — в том же порядке, что и при чтении цепочкой.
  const buildings = campusMeta.buildings.map((entry, index) => {
    const metaPath = buildingMetaPath(entry.id);
    const rawMeta = rawMetas[index];
    const metaWarnings: string[] = [];

    if (!isRecord(rawMeta)) {
      metaWarnings.push(`${metaPath}: метаданные корпуса недоступны, корпус пропущен`);
      return { meta: null, metaWarnings };
    }

    const meta: BuildingMeta = {
      id: asOptionalString(rawMeta.id) ?? entry.id,
      name: asOptionalString(rawMeta.name) ?? entry.name ?? entry.id,
      floors: normalizeFloors(rawMeta, metaPath, metaWarnings),
    };

    if (meta.id !== entry.id) {
      metaWarnings.push(
        `${metaPath}: id корпуса "${meta.id}" не совпадает с заявленным в ${CAMPUS_META_PATH} ("${entry.id}")`
      );
    }
    if (meta.floors.length === 0) {
      metaWarnings.push(`${metaPath}: у корпуса "${meta.id}" нет ни одного этажа`);
    }

    return { meta, metaWarnings };
  });

  // Волна 2: графы этажей всех корпусов разом.
  const rawFloorGraphs = await Promise.all(
    buildings.map(({ meta }) =>
      meta === null
        ? Promise.resolve([])
        : Promise.all(
            meta.floors.map((floor) => source.readJson(floorGraphPath(meta.id, floor.floor)))
          )
    )
  );

  const nodes: MapNode[] = [];
  const nodeIndexById = new Map<string, number>();
  const seenNodeIds = new Map<string, string>();

  const addNodes = (raw: unknown, building: string, floor: number, path: string): void => {
    for (const item of asRecordArray(raw, 'nodes', path, warnings)) {
      const node = normalizeNode(item as MapNodeData & Raw, building, floor, path, warnings);
      if (!node) continue;

      const previous = seenNodeIds.get(node.id);
      seenNodeIds.set(node.id, path);

      const existingIndex = nodeIndexById.get(node.id);
      if (previous !== undefined && existingIndex !== undefined) {
        warnings.push(
          `Дублирующийся id узла "${node.id}": встречается в ${previous} и в ${path} — ` +
            `использовано последнее значение`
        );
        // Замена на месте по индексу. Раньше здесь был `findIndex` + `splice`
        // на каждый дубль — квадратичная работа ровно на битом датасете, ради
        // открытия которого загрузчик и сделан терпимым к ошибкам.
        nodes[existingIndex] = node;
        continue;
      }

      nodeIndexById.set(node.id, nodes.length);
      nodes.push(node);
    }
  };

  // 1. Территория кампуса
  if (rawCampusGraph === null) {
    warnings.push(`${CAMPUS_GRAPH_PATH}: файл отсутствует, узлы кампуса не загружены`);
  } else {
    addNodes(rawCampusGraph, CAMPUS_BUILDING_ID, CAMPUS_FLOOR, CAMPUS_GRAPH_PATH);
  }

  // 2. Корпуса и их этажи
  const buildingMetas: BuildingMeta[] = [];

  buildings.forEach(({ meta, metaWarnings }, buildingIndex) => {
    warnings.push(...metaWarnings);
    if (meta === null) return;

    buildingMetas.push(meta);

    meta.floors.forEach((floor, floorIndex) => {
      const graphPath = floorGraphPath(meta.id, floor.floor);
      const rawFloorGraph = rawFloorGraphs[buildingIndex][floorIndex];

      if (rawFloorGraph === null) {
        warnings.push(`${graphPath}: файл этажа отсутствует, этаж пропущен`);
        return;
      }

      addNodes(rawFloorGraph, meta.id, floor.floor, graphPath);
    });
  });

  // 3. Переходы между этажами и корпусами
  const transitions: Transition[] = [];
  if (rawTransitions === null) {
    warnings.push(`${TRANSITIONS_PATH}: файл отсутствует — межэтажные маршруты недоступны`);
  } else {
    for (const item of asRecordArray(rawTransitions, 'transitions', TRANSITIONS_PATH, warnings)) {
      const transition = normalizeTransition(item as TransitionData & Raw, TRANSITIONS_PATH, warnings);
      if (transition) transitions.push(transition);
    }
  }

  // 4. Алиасы для поиска
  const aliases: AliasEntry[] = [];
  if (rawAliases === null) {
    warnings.push(`${ALIASES_PATH}: файл отсутствует — поиск по названиям недоступен`);
  } else {
    for (const item of asRecordArray(rawAliases, 'aliases', ALIASES_PATH, warnings)) {
      const alias = normalizeAlias(item as AliasEntry & Raw, ALIASES_PATH, warnings);
      if (alias) aliases.push(alias);
    }
  }

  return {
    dataset: { campusMeta, buildingMetas, nodes, transitions, aliases },
    warnings,
  };
}

/**
 * Индексирует метаданные корпусов по id.
 */
export function indexBuildingMetas(metas: BuildingMeta[]): Map<string, BuildingMeta> {
  return new Map(metas.map((m) => [m.id, m]));
}

/**
 * Индексирует узлы по id.
 */
export function indexNodes(nodes: MapNode[]): Map<string, MapNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

/**
 * Индексирует алиасы по id узла.
 */
export function indexAliases(aliases: AliasEntry[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const entry of aliases) {
    map.set(entry.id, [...(entry.names ?? [])]);
  }
  return map;
}
