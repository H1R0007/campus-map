import { CAMPUS_BUILDING_ID } from '@campus-map/core';
import type { MapNode, Transition } from '@campus-map/core';

/**
 * Где не хватает фото и ориентиров (запись 87) — для вкладки «Проверка →
 * Фото». Это подсказка, что снять, а не обязательная проверка: навигатор
 * работает и без фото, поэтому в «Готовность карты» она не входит.
 */

export interface CoverageGroup {
  /** Точки, у которых нет нужного, по порядку данных. */
  missing: string[];
  /** Сколько всего точек такого рода. */
  total: number;
}

export interface PhotoCoverage {
  /** Наружные точки входов: шаг «Дойдите до входа» покажет фото двери снаружи. */
  entrances: CoverageGroup;
  /** Развилки без ориентира: там чаще всего сворачивают не туда. */
  forks: CoverageGroup;
  /** Места с названием без фото: фото двери помогает найти нужную. */
  places: CoverageGroup;
}

const samePlan = (a: MapNode, b: MapNode) => a.building === b.building && a.floor === b.floor;

/**
 * Сколько проходов расходится из точки: соседи на том же плане, от которых
 * путь идёт дальше, — точка коридора или переход. Тупиковая дверь в
 * аудиторию проходом не считается: иначе развилкой была бы каждая точка
 * коридора напротив двери.
 */
export function passagesFrom(node: MapNode, nodes: ReadonlyMap<string, MapNode>): number {
  let count = 0;
  for (const id of node.neighbors) {
    const next = nodes.get(id);
    if (!next || !samePlan(next, node)) continue;
    const onward = next.neighbors.filter((other) => {
      const otherNode = nodes.get(other);
      return otherNode !== undefined && samePlan(otherNode, next);
    }).length;
    if (onward >= 2 || next.isPortal) count += 1;
  }
  return count;
}

/** Развилка — три прохода и больше. */
export const FORK_PASSAGES = 3;

export function photoCoverage(
  nodes: ReadonlyMap<string, MapNode>,
  transitions: readonly Transition[],
  aliases: ReadonlyMap<string, readonly string[]>
): PhotoCoverage {
  const hasPhoto = (node: MapNode) => (node.photos?.length ?? 0) > 0;

  // Вход снаружи — точка территории у перехода «вход»: к ней ведёт шаг «Дойдите до входа».
  const outside = new Set<string>();
  for (const transition of transitions) {
    if (transition.type !== 'entrance') continue;
    for (const id of [transition.fromNode, transition.toNode]) {
      if (nodes.get(id)?.building === CAMPUS_BUILDING_ID) outside.add(id);
    }
  }

  const entrances: CoverageGroup = { missing: [], total: 0 };
  const forks: CoverageGroup = { missing: [], total: 0 };
  const places: CoverageGroup = { missing: [], total: 0 };

  for (const node of nodes.values()) {
    if (outside.has(node.id)) {
      entrances.total += 1;
      if (!hasPhoto(node)) entrances.missing.push(node.id);
      continue;
    }
    if (!node.isPortal && passagesFrom(node, nodes) >= FORK_PASSAGES) {
      forks.total += 1;
      if (!node.landmark) forks.missing.push(node.id);
    }
    if (!node.isPortal && (aliases.get(node.id)?.length ?? 0) > 0) {
      places.total += 1;
      if (!hasPhoto(node)) places.missing.push(node.id);
    }
  }

  return { entrances, forks, places };
}
