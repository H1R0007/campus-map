import type { BuildingMeta, CampusMeta, LandmarkPassage, MapNode, TurnDirection } from '@campus-map/core';
import { Graph, createCampusProjection, landmarkPassages } from '@campus-map/core';

/**
 * Проходы через ориентир в карточке точки (запись 87): «от входа к лестнице —
 * налево». Разметчик видит, что скажет навигатор на каждом проходе, и
 * исправляет неверный.
 */

/** Как поворот звучит в шаге — те же слова, что у навигатора. */
export const TURN_ACTIONS: Record<TurnDirection, string> = {
  left: 'поверните налево',
  right: 'поверните направо',
  straight: 'идите прямо',
  bearLeft: 'держитесь левее',
  bearRight: 'держитесь правее',
  back: 'развернитесь',
};

/** Коротко — для списка проходов. */
export const TURN_WORDS: Record<TurnDirection, string> = {
  left: 'налево',
  right: 'направо',
  straight: 'прямо',
  bearLeft: 'левее',
  bearRight: 'правее',
  back: 'разворот',
};

/** Предложение студента: «У кофейного автомата поверните налево». */
export function stepSentence(at: string, turn: TurnDirection): string {
  return `${at.charAt(0).toUpperCase()}${at.slice(1)} ${TURN_ACTIONS[turn]}`;
}

/**
 * Проходы через точку: считаются на малом графе — точка и её соседи с
 * привязкой планов, — а не на всём кампусе: карточка открывается часто, а
 * поворот зависит только от соседей.
 */
export function passagesOf(
  nodeId: string,
  nodes: ReadonlyMap<string, MapNode>,
  campusMeta: CampusMeta | null,
  buildingMetas: ReadonlyMap<string, BuildingMeta>
): LandmarkPassage[] {
  const node = nodes.get(nodeId);
  if (!node) return [];
  const local = [node, ...node.neighbors.map((id) => nodes.get(id)).filter((n): n is MapNode => n !== undefined)];
  const projection = campusMeta === null ? undefined : createCampusProjection(campusMeta, buildingMetas.values());
  return landmarkPassages(new Graph(local, [], projection), nodeId);
}

/** Сколько точек обойти в поисках названия, прежде чем сдаться. */
const LOOK_AHEAD = 60;

/**
 * Как назвать сторону, в которую ведёт связь: названием соседней точки, а у
 * безымянной точки коридора — ближайшим названием в ту сторону: «А-102»,
 * «Столовая»; у точки перехода — его видом: «лестница». Поиск идёт вширь от
 * соседней точки и назад через ориентир не возвращается. Не нашлось — «точка
 * a1_corridor_3».
 *
 * @param via точка ориентира: от неё уходим
 * @param portalName вид перехода у точки перехода или `null`
 */
export function sideLabel(
  from: string,
  via: string,
  nodes: ReadonlyMap<string, MapNode>,
  aliases: ReadonlyMap<string, readonly string[]>,
  portalName: (id: string) => string | null = () => null
): string {
  const seen = new Set([via, from]);
  const queue = [from];
  for (let i = 0; i < queue.length && i < LOOK_AHEAD; i += 1) {
    const current = queue[i];
    const name = aliases.get(current)?.[0];
    if (name) return `«${name}»`;
    const portal = portalName(current);
    if (portal) return portal;
    for (const next of nodes.get(current)?.neighbors ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return `точка ${from}`;
}
