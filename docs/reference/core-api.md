---
order: 10
description: "Публичный API пакета @campus-map/core: что экспортируется, сигнатуры, примеры вызовов."
---

# API ядра

Справочник по публичному API `@campus-map/core`. Источник — `packages/core/src/index.ts`: если функция не экспортируется оттуда, она внутренняя, и приложения её не используют.

Пакет подключается собранным: приложения импортируют `dist`, поэтому после правки ядра нужна пересборка (см. [Ядро подключается собранным](../architecture/dependencies.md#ядро-подключается-собранным)).

## Загрузка датасета

```ts
loadDataset(source: DatasetSource): Promise<{ dataset: Dataset; warnings: string[] }>
createHttpDatasetSource(options?: HttpDatasetSourceOptions): DatasetSource
```

`DatasetSource` — единственная точка ввода-вывода:

```ts
interface DatasetSource {
  readJson(path: string): Promise<unknown | null>;
}
```

Пример: загрузка с сервера и построение графа.

```ts
import { createHttpDatasetSource, loadDataset, Graph } from '@campus-map/core';

const { dataset, warnings } = await loadDataset(createHttpDatasetSource());
const graph = Graph.fromDataset(dataset);

for (const warning of warnings) console.warn(warning);
```

Загрузка не прерывается на некорректных данных: битые записи отбрасываются, их описание попадает в `warnings`. Ошибкой завершается только отсутствие или невалидность `campus/meta.json`.

Вспомогательные индексы для тех, кто работает с датасетом напрямую:

| Функция | Результат |
| --- | --- |
| `indexNodes(nodes)` | `Map<id, MapNode>` |
| `indexBuildingMetas(metas)` | `Map<id, BuildingMeta>` |
| `indexAliases(aliases)` | `Map<id, names[]>` |

## Раскладка файлов

| Экспорт | Значение или результат |
| --- | --- |
| `DATA_ROOT` | `data` |
| `CAMPUS_BUILDING_ID` | `CAMPUS` |
| `CAMPUS_FLOOR` | `0` |
| `PHOTOS_DIR` | `photos` |
| `CAMPUS_META_PATH`, `CAMPUS_GRAPH_PATH`, `TRANSITIONS_PATH`, `ALIASES_PATH`, `PLACE_KINDS_PATH` | пути файлов датасета |
| `buildingMetaPath(id)` | `buildings/<id>/meta.json` |
| `floorGraphPath(id, floor)` | `buildings/<id>/floors/<n>/graph.json` |
| `floorMapPath(id, floor, format)` | `buildings/<id>/floors/<n>/map.<format>` |
| `campusMapPath(format)` | `campus/map.<format>` |
| `photoPath(file, size)` | `photos/<имя>` или уменьшенная копия |
| `datasetUrl`, `campusMapUrl`, `floorMapUrl`, `photoUrl` | те же пути адресом для браузера |
| `PHOTO_FILE` | шаблон имени фото |

Приложения не склеивают пути строками: базовый путь развёртывания может быть подкаталогом, а опечатка в шаблоне даёт 404 без сообщения.

## Граф

```ts
new Graph(nodes?, transitions?, projection?): Graph
Graph.fromDataset(dataset: Dataset): Graph
```

| Метод или свойство | Результат |
| --- | --- |
| `getNode(id)` | `MapNode \| undefined` |
| `hasNode(id)` | `boolean` |
| `getAllNodes()` | `MapNode[]` |
| `getNodesForFloor(building, floor)` | `readonly MapNode[]` — внутренний массив индекса |
| `getCampusNodes()` | узлы территории |
| `getNeighbors(nodeId)` | `readonly string[]` — рёбра этажа плюс переходы |
| `getTransitionType(a, b)` | `TransitionType \| null`; порядок аргументов не важен |
| `getWorld(nodeId)` | `WorldPoint \| undefined` — только в метрическом режиме |
| `nodeCount`, `transitionCount` | число узлов и переходов |
| `isMetric` | привязка полная, у каждого узла есть мировые координаты |

```ts
import { findConnectedComponents, Graph } from '@campus-map/core';

const graph = Graph.fromDataset(dataset);
const { connected, isolatedNodeIds } = findConnectedComponents(graph);

if (!connected) console.warn('изолированы:', isolatedNodeIds);
```

## Поиск маршрута

```ts
findPath(graph, startId, endId, options?): PathResult
findNearest(graph, startId, targetIds, options?): PathResult
findAlternativePaths(graph, startId, endId, options?, maxPaths?): MultiPathResult
```

```ts
import { findAlternativePaths, findNearest, findPath } from '@campus-map/core';

const route = findPath(graph, 'campus_gate', 'a3_room305', { allowStairs: false });
if (!route.found) console.warn(route.reason, route.error);

const toilets = aliasManager.getIdsByCategory('toilet');
const toToilet = findNearest(graph, 'a1_room101', toilets);

const { primary, alternatives } = findAlternativePaths(graph, 'campus_gate', 'a3_room305', {}, 3);
```

Поля результатов — `PathResult`, `PathSegment`, `PathFailureReason`, `MultiPathResult`, значения по умолчанию — `DEFAULT_PATHFINDING_OPTIONS`. Смысл полей и модель стоимости — на странице [Поиск маршрута](../architecture/pathfinding.md).

Модель стоимости (`stepCost`, `heuristic`, `WALKING_PROFILE`) наружу не экспортируется: снаружи видно только следствие — выбранный путь и время в пути.

## Поиск по названиям

```ts
new AliasManager(): AliasManager
aliasManager.load(entries: AliasEntry[], options?: AliasLoadOptions): void
```

| Метод | Результат |
| --- | --- |
| `resolve(alias)` | id узла либо `null`, если имя неоднозначно или не найдено |
| `resolveAll(alias)` | все id с таким именем |
| `ambiguousAliases()` | имена, ведущие к нескольким узлам |
| `getAliasesForId(id)` | названия узла |
| `getCategory(id)` | вид места узла либо `null` |
| `getIdsByCategory(category)` | id всех мест этого вида |
| `getPrimaryAliasForId(id, language?)` | основное название, с учётом языка |
| `suggest(query, limit = 5)` | `SearchSuggestion[]` — подсказки с оценкой |

```ts
import { AliasManager } from '@campus-map/core';

const aliases = new AliasManager();
aliases.load(dataset.aliases);

const id = aliases.resolve('А-305');
const suggestions = aliases.suggest('бибилотека', 5);
```

Правила поиска (регистр, раскладка, опечатки, категории) — на странице [Алиасы и поиск](../data/alias.md).

## Привязка к метрике

```ts
createCampusProjection(campusMeta, buildingMetas): CampusProjection
resolvePlanPlacement(building, floor): ResolvedPlanPlacement | null
```

```ts
interface CampusProjection {
  readonly mode: 'metric' | 'pixel';
  readonly unplacedFloors: readonly UnplacedFloor[]; // пуст ровно в метрическом режиме
  toWorld(node): WorldPoint | null;                  // null — в пиксельном режиме
}
```

`UnplacedFloor` перечисляет, чего не хватает этажу (`missing: string[]`) — эти строки попадают в предупреждения загрузчика. Формула высоты и поля привязки — на странице [Привязка к метрике](../data/placement.md).

## Область видимости

```ts
isNodeInScope(node, scope): boolean
scopeOfFloor(buildingId, floor): ViewScope
scopeOfNode(node): ViewScope
```

Описано на странице [Устройство ядра](../architecture/core.md#область-видимости).

## Повороты

| Экспорт | Назначение |
| --- | --- |
| `classifyTurn(angle)` | направление по углу: `straight`, `left`, `right`, `bearLeft`, `bearRight`, `back` |
| `turnAngle(incoming, outgoing)` | угол между участками маршрута |
| `turnAt(graph, path, index)` | поворот в точке пути либо `null`, если говорить нечего |
| `landmarkTurnAt(graph, path, index)` | направление с учётом исправления `turns` у ориентира |
| `landmarkPassages(graph, nodeId)` | пары «откуда → куда», для которых задано исправление |
| `STRAIGHT_MAX_DEG`, `BACK_MIN_DEG`, `FORK_DEG`, `TURN_LOOK_METERS` | пороги классификации |
| `isTurnDirection(value)` | проверка значения из данных |

## Панорамы

| Экспорт | Назначение |
| --- | --- |
| `parsePanoramas(raw, hasNode)` | разбор `panoramas.json` с проверкой ссылок на узлы |
| `panoramaLinks`, `bearingOf`, `yawOnPanorama` | стрелки между снимками и направление взгляда |
| `routePanoramaViews`, `planRotationLookup` | виды панорам вдоль маршрута с учётом поворота плана |
| `PANORAMAS_PATH`, `normalizeDegrees` | путь файла и нормализация угла |

Формат данных — на странице [Панорамы 360°](../data/panoramas.md).

## Виды мест

| Экспорт | Назначение |
| --- | --- |
| `DEFAULT_PLACE_KINDS` | затравка каталога, если в данных своего нет |
| `placeKindsOf(entries)`, `searchablePlaceKinds(kinds)` | выборки по каталогу |
| `isIconImage(value)`, `svgIconDataUrl(svg)`, `MAX_ICON_IMAGE_LENGTH` | работа со значком в виде `data:`-адреса |

## Типы

Все доменные типы экспортируются из `types/`: `MapNode`, `MapNodeData`, `Landmark`, `PointPhoto`, `Transition`, `TransitionType`, `CampusMeta`, `BuildingMeta`, `FloorMeta`, `Placement`, `Dataset`, `DatasetLoadResult`, `AliasEntry`, `PlaceKind`, `PlaceCategory`, `SearchSuggestion`, `PathfindingOptions`, `PathResult`, `PathSegment`, `PathFailureReason`, `MultiPathResult`.

`MapNodeData` — форма строки JSON, `MapNode` — то, что отдаёт загрузчик: `building` и `floor` в нём заполнены из пути файла. Приложение работает со вторым типом.
