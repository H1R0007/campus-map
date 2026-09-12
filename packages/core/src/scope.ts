import type { MapNode } from './types/node.js';
import { CAMPUS_BUILDING_ID } from './dataset/paths.js';

/**
 * Область видимости карты: территория кампуса либо конкретный этаж корпуса.
 *
 * Это доменное понятие, а не деталь интерфейса: и навигатор, и редактор
 * показывают за раз только один «срез» графа, и правило принадлежности узла
 * срезу должно быть одним и тем же. Прежде проверка была продублирована во
 * `MarkerLayer` и `PathLayer` навигатора.
 */
export type ViewScope =
  | { mode: 'campus' }
  | { mode: 'floor'; buildingId: string; floor: number };

/**
 * Принадлежит ли узел текущей области видимости.
 *
 * `scope === null` означает «область не определена» — в этом случае не виден
 * ни один узел, что безопасно для промежуточных состояний загрузки.
 */
export function isNodeInScope(node: MapNode, scope: ViewScope | null): boolean {
  if (scope === null) return false;

  return scope.mode === 'campus'
    ? node.building === CAMPUS_BUILDING_ID
    : node.building === scope.buildingId && node.floor === scope.floor;
}

/**
 * Область видимости, в которой узел виден.
 *
 * Используется для построения подсказок в пошаговых инструкциях маршрута:
 * «Открыть этаж 3» должен переключить карту ровно туда, где находится узел.
 */
export function scopeOfNode(node: MapNode): ViewScope {
  return node.building === CAMPUS_BUILDING_ID
    ? { mode: 'campus' }
    : { mode: 'floor', buildingId: node.building, floor: node.floor };
}

/**
 * Отображаемое имя корпуса для подписей.
 */
export function buildingDisplayName(
  buildingId: string,
  names: ReadonlyMap<string, string>
): string {
  if (buildingId === CAMPUS_BUILDING_ID) return 'Кампус';
  return names.get(buildingId) ?? buildingId;
}
