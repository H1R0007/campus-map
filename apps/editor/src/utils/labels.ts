import { CAMPUS_BUILDING_ID, floorLabel } from '@campus-map/core';
import type { BuildingMeta, MapNode, TransitionType } from '@campus-map/core';

/**
 * Подписи редактора для типов переходов.
 *
 * `transitionTypeLabel` ядра называет переход между корпусами «Переход» — так
 * же, как называется инструмент, которым переходы создаются, и разметчик не
 * отличал одно от другого.
 */
export const TRANSITION_LABELS: Record<TransitionType, string> = {
  entrance: 'Вход в корпус',
  stairs: 'Лестница',
  lift: 'Лифт',
  bridge: 'Переход между корпусами',
};


/**
 * Корпус в тексте сообщения: название в кавычках — «Корпус А», без слова
 * «корпус» перед ним: оно почти всегда уже в названии, и выходило «корпус
 * «Корпус А»» (запись 58).
 */
export function buildingRef(meta: Pick<BuildingMeta, 'name'> | undefined, id = ''): string {
  return `«${meta?.name ?? id}»`;
}

/** Этаж в тексте сообщения: «Корпус А, этаж 2» — как в карточке точки и в «Готовности». */
export function floorRef(meta: BuildingMeta | undefined, floor: number, id = ''): string {
  return `${meta?.name ?? id}, этаж ${floorLabel(meta, floor)}`;
}

/** Где лежит узел, словами: «Корпус А, этаж 2» или «Территория». */
export function nodePlaceLabel(node: Pick<MapNode, 'building' | 'floor'>, buildingMetas: ReadonlyMap<string, BuildingMeta>): string {
  if (node.building === CAMPUS_BUILDING_ID) return 'Территория';
  return floorRef(buildingMetas.get(node.building), node.floor, node.building);
}

/** Имя узла для людей: первое название, а без него — id. */
export function nodeTitle(nodeId: string, aliases: ReadonlyMap<string, readonly string[]>): string {
  return aliases.get(nodeId)?.[0] ?? nodeId;
}

/**
 * Слово в форме для числа: `plural(3, ['узел', 'узла', 'узлов'])` — «узла».
 */
export function plural(count: number, [one, few, many]: readonly [string, string, string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** «1 узел», «3 узла», «12 узлов» — для подписей действий и счётчиков. */
export function nodesCount(count: number): string {
  return `${count} ${plural(count, ['точка', 'точки', 'точек'])}`;
}
