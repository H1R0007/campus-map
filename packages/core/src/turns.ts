import { distance } from './geometry.js';
import type { Graph } from './graph/Graph.js';
import type { MapNode } from './types/node.js';

/**
 * Куда повернуть у точки маршрута: «налево», «направо», «прямо» (запись 85).
 *
 * Разметчик подписывает ориентир — «Кофейный автомат», — а направление
 * навигатор считает сам по линии маршрута: через ту же развилку один маршрут
 * сворачивает налево, другой идёт прямо, и подписать каждый проход заранее
 * нельзя.
 *
 * Считается по плану этажа, на котором стоит точка. Привязка плана к
 * территории — подобие: масштаб, поворот и сдвиг, без зеркала (запись 9), — а
 * подобие углы и стороны сохраняет. Поэтому повёрнутый корпус ответа не
 * меняет, и мировые координаты для угла не нужны; нужны они только чтобы
 * отмерить метры.
 */
export type TurnDirection = 'straight' | 'left' | 'right' | 'bearLeft' | 'bearRight' | 'back';

/** Все направления — для проверки данных и выбора в редакторе. */
export const TURN_DIRECTIONS: readonly TurnDirection[] = ['left', 'right', 'straight', 'bearLeft', 'bearRight', 'back'];

export function isTurnDirection(value: unknown): value is TurnDirection {
  return typeof value === 'string' && (TURN_DIRECTIONS as readonly string[]).includes(value);
}

/** До скольких градусов отклонения путь считается прямым. */
export const STRAIGHT_MAX_DEG = 30;

/** С какого отклонения это уже разворот, а не поворот. */
export const BACK_MIN_DEG = 150;

/**
 * Другой выход ближе этого к прямому — развилка вилкой, и «прямо» не скажет,
 * по какой ветке идти: тогда «держитесь левее» или «правее».
 */
export const FORK_DEG = 45;

/**
 * На сколько метров до и после точки смотреть, откуда пришли и куда идём.
 *
 * Не на соседние точки: разметчик ставит точку у развилки на глаз, и точка
 * коридора в полуметре от неё повёрнута на любой угол. Направление по
 * нескольким метрам пути такую небрежность сглаживает. В пиксельном режиме
 * метров нет, и направление берётся по соседним точкам маршрута.
 */
export const TURN_LOOK_METERS = 3;

export interface Turn {
  direction: TurnDirection;

  /** Угол поворота, градусы: положительный — направо, отрицательный — налево. */
  angle: number;
}

interface Point {
  x: number;
  y: number;
}

/**
 * Угол от направления `incoming` к `outgoing`, градусы в (−180, 180].
 *
 * Ось y на плане направлена вниз, поэтому поворот по часовой стрелке на экране
 * — положительное векторное произведение — это поворот направо для идущего.
 */
export function turnAngle(incoming: Point, outgoing: Point): number {
  const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
  const dot = incoming.x * outgoing.x + incoming.y * outgoing.y;
  return (Math.atan2(cross, dot) * 180) / Math.PI;
}

/** Направление по углу без учёта соседних выходов. */
export function classifyTurn(angle: number): TurnDirection {
  const size = Math.abs(angle);
  if (size <= STRAIGHT_MAX_DEG) return 'straight';
  if (size >= BACK_MIN_DEG) return 'back';
  return angle > 0 ? 'right' : 'left';
}

/**
 * Поворот маршрута в точке `path[index]`.
 *
 * Вилка: если путь идёт почти прямо, а рядом есть другой почти прямой выход,
 * «прямо» ошибочно — направление уточняется сравнением с ним: «держитесь
 * левее» или «правее».
 *
 * @returns `null`, если в точке нечего сказать: это начало или конец пути,
 *          либо путь приходит в неё или уходит из неё на другой этаж.
 */
export function turnAt(graph: Graph, path: readonly string[], index: number): Turn | null {
  if (index <= 0 || index >= path.length - 1) return null;

  const at = graph.getNode(path[index]);
  if (!at) return null;

  const before = lookAlong(graph, path, index, -1, at);
  const after = lookAlong(graph, path, index, 1, at);
  if (before === null || after === null) return null;

  const incoming = { x: at.x - before.x, y: at.y - before.y };
  const outgoing = { x: after.x - at.x, y: after.y - at.y };
  const angle = turnAngle(incoming, outgoing);
  let direction = classifyTurn(angle);

  if (direction === 'straight') {
    const next = graph.getNode(path[index + 1]);
    const fork = next ? closestOtherExit(graph, at, incoming, [path[index - 1], path[index + 1]]) : null;
    if (next && fork !== null) {
      const chosen = turnAngle(incoming, { x: next.x - at.x, y: next.y - at.y });
      direction = chosen < fork ? 'bearLeft' : 'bearRight';
    }
  }

  return { direction, angle };
}

/** Тот же план: тот же корпус и этаж. */
function samePlan(a: MapNode, b: MapNode): boolean {
  return a.building === b.building && a.floor === b.floor;
}

/**
 * Точка на пути в `TURN_LOOK_METERS` метрах от `at` назад (`step` −1) или
 * вперёд (+1), в пикселях плана. Путь дальше по своему плану не уходит: за
 * лестницей направление уже ничего не значит. Если путь кончился раньше —
 * последняя его точка на этом плане.
 *
 * @returns `null`, если соседняя точка пути — на другом плане или совпадает с `at`.
 */
function lookAlong(graph: Graph, path: readonly string[], index: number, step: 1 | -1, at: MapNode): Point | null {
  const first = graph.getNode(path[index + step]);
  if (!first || !samePlan(first, at) || distance(first, at) === 0) return null;

  const atWorld = graph.getWorld(at.id);
  if (!atWorld) return { x: first.x, y: first.y };

  let walked = 0;
  let previous = at;
  for (let i = index + step; i >= 0 && i < path.length; i += step) {
    const node = graph.getNode(path[i]);
    if (!node || !samePlan(node, at)) break;

    const fromWorld = graph.getWorld(previous.id);
    const toWorld = graph.getWorld(node.id);
    if (!fromWorld || !toWorld) break;

    const meters = distance(fromWorld, toWorld);
    if (walked + meters >= TURN_LOOK_METERS && meters > 0) {
      const share = (TURN_LOOK_METERS - walked) / meters;
      return { x: previous.x + (node.x - previous.x) * share, y: previous.y + (node.y - previous.y) * share };
    }

    walked += meters;
    previous = node;
  }

  return { x: previous.x, y: previous.y };
}

/**
 * Угол ближайшего к прямому другого выхода из точки — если он тоже почти
 * прямой (`FORK_DEG`); иначе `null`.
 *
 * Выход — соседняя точка того же плана; переходы на другие этажи не в счёт.
 */
function closestOtherExit(graph: Graph, at: MapNode, incoming: Point, exclude: readonly string[]): number | null {
  let closest: number | null = null;

  for (const id of graph.getNeighbors(at.id)) {
    if (exclude.includes(id)) continue;
    const exit = graph.getNode(id);
    if (!exit || !samePlan(exit, at) || distance(exit, at) === 0) continue;

    const angle = turnAngle(incoming, { x: exit.x - at.x, y: exit.y - at.y });
    if (Math.abs(angle) > FORK_DEG) continue;
    if (closest === null || Math.abs(angle) < Math.abs(closest)) closest = angle;
  }

  return closest;
}

/**
 * Что сказать у ориентира в точке `path[index]`: исправление разметчика для
 * этого прохода, если оно есть, иначе посчитанный поворот (запись 87).
 */
export function landmarkTurnAt(graph: Graph, path: readonly string[], index: number): TurnDirection | null {
  const node = graph.getNode(path[index]);
  const corrected = node?.landmark?.turns?.find((turn) => turn.from === path[index - 1] && turn.to === path[index + 1]);
  return corrected?.turn ?? turnAt(graph, path, index)?.direction ?? null;
}

/** Один проход через ориентир: откуда, куда и что скажет навигатор. */
export interface LandmarkPassage {
  from: string;
  to: string;
  /** Что посчитал бы навигатор сам; `null` — сказать нечего (точки совпадают). */
  auto: TurnDirection | null;
  /** Исправление разметчика или `null`. */
  corrected: TurnDirection | null;
}

/**
 * Все проходы через точку по её связям на плане — для проверки ориентира в
 * редакторе: «от входа к лестнице — налево». Направление считается по
 * соседним точкам, как маршрут, который приходит и уходит прямо через них.
 */
export function landmarkPassages(graph: Graph, nodeId: string): LandmarkPassage[] {
  const at = graph.getNode(nodeId);
  if (!at) return [];
  const exits = graph
    .getNeighbors(nodeId)
    .map((id) => graph.getNode(id))
    .filter((node): node is MapNode => node !== undefined && samePlan(node, at));

  const passages: LandmarkPassage[] = [];
  for (const from of exits) {
    for (const to of exits) {
      if (from.id === to.id) continue;
      const corrected = at.landmark?.turns?.find((turn) => turn.from === from.id && turn.to === to.id)?.turn ?? null;
      passages.push({ from: from.id, to: to.id, auto: turnAt(graph, [from.id, nodeId, to.id], 1)?.direction ?? null, corrected });
    }
  }
  return passages;
}
