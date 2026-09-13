import type { AliasEntry } from '../types/alias.js';
import type {
  BuildingMeta,
  BuildingPlacement,
  CampusMeta,
  FloorMeta,
  MapSize,
} from '../types/building.js';
import type { DatasetLoadResult, DatasetSource } from '../types/dataset.js';
import type { MapNode, MapNodeData } from '../types/node.js';
import type { Transition, TransitionData } from '../types/transition.js';
import { isTransitionType, parseTransitionType } from '../types/transition.js';
import { createCampusProjection } from '../projection.js';
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
 * Число из JSON — только настоящее число, без приведения строк.
 *
 * `asFiniteNumber` приводит "10" к 10 ради совместимости со старыми
 * координатами узлов. Новые поля формата так никто не записывал, и растягивать
 * на них эту терпимость незачем: строка в числовом поле — ошибка разметки, о
 * которой нужно сказать, а не молча её исправить.
 */
function asStrictNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Положительное конечное число: масштаб, высота этажа. */
function asPositiveNumber(value: unknown): number | undefined {
  const n = asStrictNumber(value);
  return n !== undefined && n > 0 ? n : undefined;
}

/** Точка в метрах: оба поля — конечные числа. */
function asMetersPoint(value: unknown): { x: number; y: number } | undefined {
  if (!isRecord(value)) return undefined;

  const x = asStrictNumber(value.x);
  const y = asStrictNumber(value.y);
  return x !== undefined && y !== undefined ? { x, y } : undefined;
}

/**
 * Необязательное поле записи с разбором.
 *
 * Отсутствие поля — норма. Некорректное значение отбрасывается с
 * предупреждением, где есть и имя поля, и само значение: разметчику нужно
 * видеть, что именно не принято.
 *
 * @param label имя поля в сообщении, если оно вложенное (`placement.rotationDeg`)
 */
function readField<T>(
  record: Raw,
  field: string,
  parse: (value: unknown) => T | undefined,
  where: string,
  warnings: string[],
  label: string = field
): T | undefined {
  const value = record[field];
  if (value === undefined || value === null) return undefined;

  const parsed = parse(value);
  if (parsed === undefined) {
    warnings.push(
      `${where}: некорректное значение ${label}: ${JSON.stringify(value)} — поле пропущено`
    );
  }
  return parsed;
}

/**
 * Необязательный размер плана.
 *
 * Некорректное значение отбрасывается с предупреждением, а не заменяется
 * выдуманным: размер — лишь подсказка до загрузки изображения, и неверная
 * подсказка хуже отсутствующей.
 */
function readMapSize(value: unknown, where: string, warnings: string[]): MapSize | undefined {
  if (value === undefined || value === null) return undefined;

  const width = isRecord(value) ? asStrictNumber(value.width) : undefined;
  const height = isRecord(value) ? asStrictNumber(value.height) : undefined;

  if (width !== undefined && height !== undefined && width > 0 && height > 0) {
    return { width, height };
  }

  warnings.push(`${where}: некорректный mapSize ${JSON.stringify(value)} — поле пропущено`);
  return undefined;
}

/**
 * Необязательный входной этаж корпуса.
 *
 * Обязан совпадать с одним из объявленных этажей: навигатор открывает его по
 * выбору корпуса, и несуществующий номер дал бы серый холст вместо плана.
 */
function readEntranceFloor(
  value: unknown,
  floors: FloorMeta[],
  path: string,
  warnings: string[]
): number | undefined {
  if (value === undefined || value === null) return undefined;

  const floor = asStrictNumber(value);
  if (floor !== undefined && floors.some((meta) => meta.floor === floor)) {
    return floor;
  }

  warnings.push(
    `${path}: entranceFloor ${JSON.stringify(value)} не совпадает ни с одним ` +
      `объявленным этажом — поле пропущено`
  );
  return undefined;
}

/**
 * Необязательная привязка плана к территории — у корпуса или у этажа.
 *
 * Каждое поле проверяется отдельно: частичная привязка на одном уровне
 * законна — недостающее приходит с другого, а полноту итоговой привязки
 * решает `createCampusProjection`. Некорректное значение отбрасывается, а не
 * заменяется: подставленный масштаб или поворот молча дал бы неверные метры.
 *
 * У этажа поля отметки не читаются — её задаёт `FloorMeta.elevationMeters`.
 *
 * @returns привязку либо `undefined`, если поля нет или в нём нет ни одного
 *          корректного значения.
 */
function readPlacement(
  value: unknown,
  level: 'building' | 'floor',
  where: string,
  warnings: string[]
): BuildingPlacement | undefined {
  if (value === undefined || value === null) return undefined;

  if (!isRecord(value)) {
    warnings.push(`${where}: placement должен быть объектом — поле пропущено`);
    return undefined;
  }

  const record: Raw = value;
  const read = <T>(field: string, parse: (raw: unknown) => T | undefined): T | undefined =>
    readField(record, field, parse, where, warnings, `placement.${field}`);

  const placement: BuildingPlacement = {};

  const metersPerPixel = read('metersPerPixel', asPositiveNumber);
  if (metersPerPixel !== undefined) placement.metersPerPixel = metersPerPixel;

  const originMeters = read('originMeters', asMetersPoint);
  if (originMeters !== undefined) placement.originMeters = originMeters;

  const rotationDeg = read('rotationDeg', asStrictNumber);
  if (rotationDeg !== undefined) placement.rotationDeg = rotationDeg;

  if (level === 'building') {
    const baseElevationMeters = read('baseElevationMeters', asStrictNumber);
    if (baseElevationMeters !== undefined) placement.baseElevationMeters = baseElevationMeters;

    const floorHeightMeters = read('floorHeightMeters', asPositiveNumber);
    if (floorHeightMeters !== undefined) placement.floorHeightMeters = floorHeightMeters;
  }

  return Object.keys(placement).length > 0 ? placement : undefined;
}

/**
 * Код языка перевода — основной подтег BCP 47 строчными: `en`, `kk`.
 *
 * Интерфейс сравнивает его со своим языком как строку, поэтому `EN` или
 * `en-US` в данных не совпали бы ни с чем — перевод молча не показывался бы.
 */
const LANGUAGE_CODE = /^[a-z]{2,3}$/;

/**
 * Необязательные переводы записи: код языка → перевод.
 *
 * Каждый перевод проверяется отдельно: некорректный отбрасывается с
 * предупреждением, остальные остаются.
 *
 * @param parse разбор одного перевода; `undefined` — перевод некорректен
 * @returns переводы либо `undefined`, если поля нет или ни один не принят
 */
function readTranslations<T>(
  value: unknown,
  parse: (raw: Raw) => T | undefined,
  where: string,
  warnings: string[]
): Record<string, T> | undefined {
  if (value === undefined || value === null) return undefined;

  if (!isRecord(value)) {
    warnings.push(`${where}: translations должен быть объектом — поле пропущено`);
    return undefined;
  }

  const translations: Record<string, T> = {};

  for (const [lang, raw] of Object.entries(value)) {
    if (!LANGUAGE_CODE.test(lang)) {
      warnings.push(
        `${where}: код языка "${lang}" в translations должен быть основным подтегом ` +
          `строчными буквами (например, "en") — перевод пропущен`
      );
      continue;
    }

    const parsed = isRecord(raw) ? parse(raw) : undefined;
    if (parsed === undefined) {
      warnings.push(
        `${where}: некорректный перевод translations.${lang}: ${JSON.stringify(raw)} — перевод пропущен`
      );
      continue;
    }

    translations[lang] = parsed;
  }

  return Object.keys(translations).length > 0 ? translations : undefined;
}

/**
 * Имена без повторов с сохранением порядка: первое считается основным и
 * показывается в интерфейсе.
 */
function uniqueNames(names: string[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }

  return unique;
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

  const names = uniqueNames([
    ...asStringArray(raw.names),
    ...(asOptionalString(raw.name) !== undefined ? [raw.name as string] : []),
  ]);

  const entry: AliasEntry = { id: raw.id, names };

  const translations = readTranslations(
    raw.translations,
    (translation) => {
      const translatedNames = uniqueNames(asStringArray(translation.names).filter((name) => name.length > 0));
      return translatedNames.length > 0 ? { names: translatedNames } : undefined;
    },
    `${path}: ${raw.id}`,
    warnings
  );
  if (translations !== undefined) entry.translations = translations;

  return entry;
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

    // `mapPath` и `graphPath` из старых файлов не читаются: раскладка этажа
    // фиксирована, и эти поля никогда ни на что не влияли (см. `FloorMeta`).
    const meta: FloorMeta = { floor };
    const where = `${path}: этаж ${floor}`;

    const mapSize = readMapSize(item.mapSize, where, warnings);
    if (mapSize !== undefined) meta.mapSize = mapSize;

    const placement = readPlacement(item.placement, 'floor', where, warnings);
    if (placement !== undefined) meta.placement = placement;

    const elevationMeters = readField(item, 'elevationMeters', asStrictNumber, where, warnings);
    if (elevationMeters !== undefined) meta.elevationMeters = elevationMeters;

    floors.push(meta);
  }

  return floors;
}

/**
 * Предупреждения о неполной привязке к метрике кампуса.
 *
 * Молчать можно в двух случаях: привязки нет вовсе — датасет честно
 * пиксельный — или она полная. Промежуточное состояние почти наверняка
 * означает забытый этаж: датасет целиком уходит в пиксельный режим, и
 * навигатор перестаёт показывать время в пути без видимой причины.
 */
function placementWarnings(campusMeta: CampusMeta, buildingMetas: BuildingMeta[]): string[] {
  const hasAnyPlacement =
    campusMeta.metersPerPixel !== undefined ||
    buildingMetas.some(
      (building) =>
        building.placement !== undefined ||
        building.floors.some(
          (floor) => floor.placement !== undefined || floor.elevationMeters !== undefined
        )
    );
  if (!hasAnyPlacement) return [];

  const { unplacedFloors } = createCampusProjection(campusMeta, buildingMetas);
  if (unplacedFloors.length === 0) return [];

  return [
    ...unplacedFloors.map(({ buildingId, floor, missing }) =>
      buildingId === CAMPUS_BUILDING_ID
        ? `${CAMPUS_META_PATH}: территория не привязана к метрике — нет ${missing.join(', ')}`
        : `${buildingMetaPath(buildingId)}: этаж ${floor} не привязан к метрике — ` +
          `нет ${missing.join(', ')}`
    ),
    'Привязка к метрике кампуса неполная: датасет работает в пиксельном режиме, ' +
      'время в пути не показывается',
  ];
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

  const campusMetersPerPixel = readField(
    rawCampusMeta,
    'metersPerPixel',
    asPositiveNumber,
    CAMPUS_META_PATH,
    warnings
  );
  if (campusMetersPerPixel !== undefined) campusMeta.metersPerPixel = campusMetersPerPixel;

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

    const entranceFloor = readEntranceFloor(
      rawMeta.entranceFloor,
      meta.floors,
      metaPath,
      metaWarnings
    );
    if (entranceFloor !== undefined) meta.entranceFloor = entranceFloor;

    const placement = readPlacement(rawMeta.placement, 'building', metaPath, metaWarnings);
    if (placement !== undefined) meta.placement = placement;

    const translations = readTranslations(
      rawMeta.translations,
      (translation) => {
        const name = asOptionalString(translation.name);
        return name !== undefined ? { name } : undefined;
      },
      metaPath,
      metaWarnings
    );
    if (translations !== undefined) meta.translations = translations;

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

  // Привязка к метрике проверяется по всем метаданным сразу: режим один на
  // весь датасет, и привязанная половина этажей ничего не даёт.
  warnings.push(...placementWarnings(campusMeta, buildingMetas));

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
