import {
  ALIASES_PATH,
  CAMPUS_BUILDING_ID,
  PLACE_KINDS_PATH,
  CAMPUS_GRAPH_PATH,
  CAMPUS_META_PATH,
  TRANSITIONS_PATH,
  buildingMetaPath,
  floorGraphPath,
} from '@campus-map/core';
import type {
  AliasEntry,
  BuildingMeta,
  CampusMeta,
  Dataset,
  FloorMeta,
  MapNode,
  PlaceKind,
} from '@campus-map/core';

/**
 * Файлы датасета из состояния редактора.
 *
 * Одна сборка на все способы сохранения: и архив, и запись в `data/` кладут
 * ровно одно и то же. Пути берутся из раскладки ядра (`dataset/paths.ts`) —
 * сохранённое обязано читаться тем же `loadDataset`, которым его открывали.
 */

/**
 * Все поля типа как обязательные ключи, значения — как в исходном типе.
 *
 * Сохранение перечисляет поля формата явно, а `satisfies BuildingMeta` не
 * ловит забытое **необязательное** поле. Такое поле читалось бы загрузчиком и
 * молча исчезало при первом сохранении. С этим типом новое поле формата не
 * скомпилируется, пока сохранение его не запишет. Отсутствующее значение
 * остаётся `undefined`, и `JSON.stringify` в файл его не пишет.
 */
type EveryField<T> = { [K in keyof Required<T>]: T[K] };

/**
 * Узлы в том виде, в каком они записываются в `graph.json`.
 *
 * `building` и `floor` не выгружаются намеренно: источник истины —
 * расположение файла, и загрузчик ядра всегда берёт их из пути. Записанное
 * поверх значение создавало бы второй источник, способный разойтись.
 */
interface ExportedNode {
  id: string;
  x: number;
  y: number;
  neighbors: string[];
  isPortal: boolean;
  /** Рабочая заметка разметчика; присутствует только когда заполнена. */
  comment?: string;
}


/**
 * Приводит узел к виду для файла.
 *
 * `comment` включается только непустым: поле необязательное, и писать
 * `"comment": ""` в каждый узел значит засорять датасет.
 */
function toExportedNode(node: MapNode): ExportedNode {
  const comment = node.comment?.trim();

  return {
    id: node.id,
    x: node.x,
    y: node.y,
    neighbors: node.neighbors,
    isPortal: node.isPortal,
    ...(comment ? { comment } : {}),
  };
}

/**
 * Размер карты кампуса.
 *
 * Значение из загруженных метаданных приоритетнее: редактор его не меняет,
 * значит и перезаписывать не должен. Резервный расчёт по границам узлов
 * используется только тогда, когда метаданных не было — например, датасет
 * собран с нуля. `mapSize` в любом случае лишь резерв: реальный размер
 * навигатор берёт из самого изображения.
 */
function resolveCampusMapSize(
  campusNodes: MapNode[],
  loaded: CampusMeta | null | undefined
): { width: number; height: number } {
  if (loaded?.mapSize && loaded.mapSize.width > 0 && loaded.mapSize.height > 0) {
    return { width: loaded.mapSize.width, height: loaded.mapSize.height };
  }

  if (campusNodes.length === 0) {
    return { width: 1200, height: 800 };
  }

  const maxX = Math.max(...campusNodes.map((n) => n.x));
  const maxY = Math.max(...campusNodes.map((n) => n.y));

  return {
    width: Math.max(1200, Math.ceil(maxX / 100) * 100 + 200),
    height: Math.max(800, Math.ceil(maxY / 100) * 100 + 200),
  };
}

/** JSON в том же виде, в каком его пишет генератор тестовых данных. */
function toJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Собирает файлы датасета: путь внутри `data/` → содержимое.
 *
 * Планы (`map.png`, `map.svg`) сюда не попадают: редактор их пока не меняет,
 * и переписывать их своим содержимым было бы потерей.
 */
export function datasetFiles(dataset: Dataset): Map<string, string> {
  const { nodes: allNodes, transitions, buildingMetas, aliases, campusMeta } = dataset;
  const files = new Map<string, string>();

  const campusNodes = allNodes.filter((node) => node.building === CAMPUS_BUILDING_ID);

  files.set(
    CAMPUS_META_PATH,
    toJson({
      buildings: buildingMetas.map((building) => ({ id: building.id, name: building.name })),
      mapSize: resolveCampusMapSize(campusNodes, campusMeta),
      metersPerPixel: campusMeta?.metersPerPixel,
      planFormat: campusMeta?.planFormat,
    } satisfies EveryField<CampusMeta>)
  );

  files.set(CAMPUS_GRAPH_PATH, toJson({ nodes: campusNodes.map(toExportedNode) }));

  for (const meta of buildingMetas) {
    files.set(
      buildingMetaPath(meta.id),
      toJson({
        id: meta.id,
        name: meta.name,
        // Порядок полей — как у генератора данных: сохранение нетронутого
        // датасета не должно давать правку во всех файлах.
        translations: meta.translations,
        entranceFloor: meta.entranceFloor,
        placement: meta.placement,
        floors: meta.floors.map(
          (floor) =>
            ({
              floor: floor.floor,
              mapSize: floor.mapSize,
              placement: floor.placement,
              elevationMeters: floor.elevationMeters,
              planFormat: floor.planFormat,
            }) satisfies EveryField<FloorMeta>
        ),
      } satisfies EveryField<BuildingMeta>)
    );

    for (const floor of meta.floors) {
      const floorNodes = allNodes.filter((node) => node.building === meta.id && node.floor === floor.floor);
      files.set(floorGraphPath(meta.id, floor.floor), toJson({ nodes: floorNodes.map(toExportedNode) }));
    }
  }

  files.set(
    TRANSITIONS_PATH,
    toJson({
      transitions: transitions.map((transition) => ({
        from: { node: transition.fromNode },
        to: { node: transition.toNode },
        transition_type: transition.type,
      })),
    })
  );

  // Запись без основных имён не пишется: перевод без имени на языке данных
  // нечем показать в интерфейсе, для языка которого перевода нет.
  files.set(
    ALIASES_PATH,
    toJson({
      aliases: aliases
        .filter((alias) => (alias.names?.length ?? 0) > 0)
        .map(
          (alias) =>
            ({
              id: alias.id,
              // Устаревшая одиночная форма не пишется: загрузчик приводит её к `names`.
              name: undefined,
              names: alias.names,
              translations: alias.translations,
              category: alias.category,
            }) satisfies EveryField<AliasEntry>
        ),
    })
  );

  // Каталог видов точек пишется, только когда разметчик его завёл: у
  // нетронутого датасета файла нет, и сохранение не должно его создавать.
  if (dataset.placeKinds.length > 0) {
    files.set(
      PLACE_KINDS_PATH,
      toJson({
        kinds: dataset.placeKinds.map(
          (kind) =>
            ({
              id: kind.id,
              name: kind.name,
              icon: kind.icon,
              color: kind.color,
              namePattern: kind.namePattern,
              isPortal: kind.isPortal,
              transition: kind.transition,
              stack: kind.stack,
              connect: kind.connect,
              chain: kind.chain,
              category: kind.category,
            }) satisfies EveryField<PlaceKind>
        ),
      })
    );
  }

  return files;
}
