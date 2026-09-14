import type { AliasManager, BuildingMeta, Graph, ViewScope } from '@campus-map/core';
import { buildingName, scopeOfNode } from '@campus-map/core';
import { formatFloor, messagesFor } from '../i18n';
import type { Language } from '../i18n/languages';

/**
 * Подписи мест на языке интерфейса: корпус, вид карты, положение помещения.
 *
 * Имя корпуса приходит из данных с переводом (`buildingName` ядра), слово
 * «этаж» и «Кампус» — из словаря. Раньше подпись собиралась в ядре
 * (`buildingDisplayName`) с зашитым «Кампус» — по-английски её показать было
 * нельзя.
 */

/** Имя корпуса; для неизвестного корпуса — его id, чтобы ошибку данных было видно. */
export function buildingLabel(
  buildingMetas: ReadonlyMap<string, BuildingMeta>,
  buildingId: string,
  language: Language
): string {
  const meta = buildingMetas.get(buildingId);
  return meta ? buildingName(meta, language) : buildingId;
}

/** Что показывает карта: «Кампус» или «Корпус А, этаж 2». */
export function scopeLabel(
  scope: ViewScope,
  buildingMetas: ReadonlyMap<string, BuildingMeta>,
  language: Language
): string {
  const messages = messagesFor(language);
  if (scope.mode === 'campus') return messages.map.campus;

  return messages.map.place(
    buildingLabel(buildingMetas, scope.buildingId, language),
    formatFloor(scope.floor)
  );
}

/**
 * Где находится узел: «Корпус А, этаж 3» или «Кампус».
 *
 * Нужно там, где название помещения само по себе точку не различает: пять
 * корпусов дают пять «Столовых». Внутренний id узла (`a1_room101`) различает
 * точки, но студенту ничего не говорит.
 */
export function nodePlaceLabel(
  graph: Graph,
  buildingMetas: ReadonlyMap<string, BuildingMeta>,
  nodeId: string,
  language: Language
): string {
  const node = graph.getNode(nodeId);
  return node ? scopeLabel(scopeOfNode(node), buildingMetas, language) : '';
}

/**
 * Имя места на языке интерфейса — для точек маршрута и карточек.
 *
 * Выводится из узла при отрисовке, а не хранится: прежний текст полей маршрута
 * лежал в сторе и при смене языка оставался на прежнем.
 *
 * @returns `null`, если у узла нет названия
 */
export function nodeName(aliasManager: AliasManager | null, nodeId: string, language: Language): string | null {
  return aliasManager?.getPrimaryAliasForId(nodeId, language) ?? null;
}
