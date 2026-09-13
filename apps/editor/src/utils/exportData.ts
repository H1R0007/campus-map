import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { CAMPUS_BUILDING_ID } from '@campus-map/core';
import type {
  AliasEntry,
  BuildingMeta,
  CampusMeta,
  FloorMeta,
  MapNode,
  Transition,
} from '@campus-map/core';

/**
 * Все поля типа как обязательные ключи, значения — как в исходном типе.
 *
 * Экспорт перечисляет поля формата явно, а `satisfies BuildingMeta` не ловит
 * забытое **необязательное** поле. Такое поле читалось бы загрузчиком и молча
 * исчезало при первом сохранении из редактора. С этим типом новое поле
 * формата не скомпилируется, пока экспорт его не запишет. Отсутствующее
 * значение остаётся `undefined`, и `JSON.stringify` в файл его не пишет.
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

export interface ExportOptions {
  nodes: Map<string, MapNode>;
  transitions: Transition[];
  buildingMetas: Map<string, BuildingMeta>;
  aliases?: AliasEntry[];

  /**
   * Метаданные кампуса, из которых датасет был загружен.
   *
   * Нужны, чтобы экспорт не портил то, что редактор не меняет. Без них
   * `mapSize` приходилось выдумывать заново по границам узлов, и круг
   * «загрузил — сохранил» терял исходное значение.
   */
  campusMeta?: CampusMeta | null;
}

/**
 * Приводит узел к экспортируемому виду.
 *
 * `comment` включается только непустым: поле опциональное, и писать
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
 * Размер карты кампуса для экспорта.
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

const ZIP_README = `# Экспорт данных карты кампуса

Экспортировано: {timestamp}

## Структура

\`\`\`
data/
├── campus/
│   ├── meta.json       # Метаданные кампуса
│   ├── graph.json      # Граф территории кампуса
│   └── map.png         # Карта кампуса (изображение, добавляется вручную)
├── buildings/
│   └── {building_id}/
│       ├── meta.json   # Метаданные корпуса и список этажей
│       └── floors/
│           └── {floor}/
│               ├── graph.json  # Граф этажа
│               └── map.png     # План этажа (изображение, добавляется вручную)
├── transitions.json    # Переходы между этажами и корпусами
└── aliases.json        # Человекочитаемые названия помещений
\`\`\`

## Как применить

Изображения планов (map.png) в архив не попадают — редактор их не меняет.
Их нужно положить в каталоги этажей вручную.

Содержимое каталога \`data/\` кладётся в корень монорепо, рядом с
\`apps/\` и \`packages/\`. Оба приложения подхватывают его автоматически:
плагин \`tooling/vite-plugin-campus-data.mjs\` раздаёт один и тот же каталог
и в режиме разработки, и в прод-сборке. Копировать данные внутрь
\`apps/viewer\` или \`apps/editor\` не нужно.

## Формат graph.json

\`building\` и \`floor\` у узлов не записываются: они определяются путём
файла (\`buildings/<id>/floors/<n>/graph.json\`), а для территории кампуса —
расположением в \`campus/graph.json\`.

Поле \`comment\` — рабочая заметка разметчика. На маршрутизацию не влияет и
студентам не показывается; удобно помечать спорные места при переносе
официальных данных.

## Типы переходов

- \`entrance\` — вход/выход из корпуса
- \`stairs\` — лестница
- \`lift\` — лифт
- \`bridge\` — переход между корпусами
`;

/**
 * Собирает датасет в ZIP-архив и отдаёт его на скачивание.
 *
 * Раскладка файлов повторяет `dataset/paths.ts` ядра: экспортированный
 * архив должен загружаться тем же `loadDataset`, которым его читали.
 */
export async function exportToZip(options: ExportOptions): Promise<void> {
  const { nodes, transitions, buildingMetas, aliases = [], campusMeta = null } = options;

  const zip = new JSZip();
  const dataFolder = zip.folder('data');
  if (!dataFolder) {
    throw new Error('Не удалось создать каталог data в архиве');
  }

  const campusNodes = Array.from(nodes.values()).filter(
    (n) => n.building === CAMPUS_BUILDING_ID
  );

  // === Территория кампуса ===
  const campusFolder = dataFolder.folder('campus');
  if (!campusFolder) {
    throw new Error('Не удалось создать каталог campus в архиве');
  }

  campusFolder.file(
    'meta.json',
    JSON.stringify(
      {
        buildings: Array.from(buildingMetas.values()).map((b) => ({ id: b.id, name: b.name })),
        mapSize: resolveCampusMapSize(campusNodes, campusMeta),
        metersPerPixel: campusMeta?.metersPerPixel,
      } satisfies EveryField<CampusMeta>,
      null,
      2
    )
  );

  campusFolder.file(
    'graph.json',
    JSON.stringify({ nodes: campusNodes.map(toExportedNode) }, null, 2)
  );

  // === Корпуса и этажи ===
  const buildingsFolder = dataFolder.folder('buildings');
  if (!buildingsFolder) {
    throw new Error('Не удалось создать каталог buildings в архиве');
  }

  for (const [buildingId, meta] of buildingMetas) {
    const buildingFolder = buildingsFolder.folder(buildingId);
    if (!buildingFolder) continue;

    buildingFolder.file(
      'meta.json',
      JSON.stringify(
        {
          id: meta.id,
          name: meta.name,
          entranceFloor: meta.entranceFloor,
          placement: meta.placement,
          translations: meta.translations,
          floors: meta.floors.map(
            (f) =>
              ({
                floor: f.floor,
                mapSize: f.mapSize,
                placement: f.placement,
                elevationMeters: f.elevationMeters,
              }) satisfies EveryField<FloorMeta>
          ),
        } satisfies EveryField<BuildingMeta>,
        null,
        2
      )
    );

    const floorsFolder = buildingFolder.folder('floors');
    if (!floorsFolder) continue;

    for (const floor of meta.floors) {
      const floorFolder = floorsFolder.folder(String(floor.floor));
      if (!floorFolder) continue;

      const floorNodes = Array.from(nodes.values()).filter(
        (n) => n.building === buildingId && n.floor === floor.floor
      );

      floorFolder.file(
        'graph.json',
        JSON.stringify({ nodes: floorNodes.map(toExportedNode) }, null, 2)
      );
    }
  }

  // === Переходы ===
  dataFolder.file(
    'transitions.json',
    JSON.stringify(
      {
        transitions: transitions.map((t) => ({
          from: { node: t.fromNode },
          to: { node: t.toNode },
          transition_type: t.type,
        })),
      },
      null,
      2
    )
  );

  // === Алиасы ===
  // Запись без основных имён не пишется: перевод без имени на языке данных
  // нечем показать в интерфейсе, для языка которого перевода нет.
  dataFolder.file(
    'aliases.json',
    JSON.stringify(
      {
        aliases: aliases
          .filter((a) => (a.names?.length ?? 0) > 0)
          .map(
            (a) =>
              ({
                id: a.id,
                // Устаревшая одиночная форма не пишется: загрузчик приводит её к `names`.
                name: undefined,
                names: a.names,
                translations: a.translations,
              }) satisfies EveryField<AliasEntry>
          ),
      },
      null,
      2
    )
  );

  zip.file('README.md', ZIP_README.replace('{timestamp}', new Date().toISOString()));

  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `campus-map-data-${new Date().toISOString().slice(0, 10)}.zip`);
}
