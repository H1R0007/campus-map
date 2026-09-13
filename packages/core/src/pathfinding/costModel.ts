import { distance } from '../geometry.js';
import type { Graph } from '../graph/Graph.js';
import type { WorldPoint } from '../projection.js';
import type { MapNode } from '../types/node.js';
import type { PathfindingOptions } from '../types/pathfinding.js';
import type { TransitionType } from '../types/transition.js';

/**
 * Модель стоимости шага маршрута.
 *
 * Режим выбирается по графу (`Graph.isMetric`) и не смешивается:
 *
 * - **метрический** — стоимость в секундах: ходьба и подъём, посчитанные по
 *   мировым координатам концов шага, плюс фиксированные надбавки. Эвристика —
 *   согласованная нижняя оценка времени до цели;
 * - **пиксельный** — прежняя модель без изменений: длина ребра в пикселях
 *   плана и условные веса переходов, эвристика нулевая. Времени в пути здесь
 *   нет.
 *
 * Модель отделена от обхода, потому что ею пользуются трое: поиск, разбивка
 * найденного пути на шаги и тест согласованности эвристики.
 */

/** Опции поиска после подстановки значений по умолчанию. */
export type NormalizedOptions = Readonly<Required<PathfindingOptions>>;

/**
 * Физика передвижения по кампусу.
 *
 * Значения — оценки для взрослого пешехода в здании, а не измерения. От них
 * зависит показанное время в пути, но не корректность поиска: оптимальность
 * держится на устройстве модели (см. `heuristic`), а не на конкретных числах.
 */
export interface MobilityProfile {
  /** Скорость ходьбы по горизонтали, м/с. */
  walkSpeed: number;

  /** Скорость набора высоты по лестнице вместе с площадками и разворотами, м/с. */
  stairsVerticalSpeed: number;

  /** Скорость кабины лифта, м/с. */
  liftVerticalSpeed: number;

  /** Ожидание лифта с посадкой, с. Один раз на поездку, а не на каждый этаж. */
  liftWaitSeconds: number;

  /** Проход через вход корпуса — двери, тамбур, турникет, с. */
  entranceSeconds: number;
}

export const WALKING_PROFILE: Readonly<MobilityProfile> = Object.freeze({
  walkSpeed: 1.3,
  // Этаж высотой 3,6 м — около 18 с.
  stairsVerticalSpeed: 0.2,
  liftVerticalSpeed: 1.0,
  liftWaitSeconds: 30,
  entranceSeconds: 10,
});

/**
 * Самая быстрая скорость профиля — делитель нижней оценки времени.
 *
 * Оценка «расстояние / скорость» не переоценивает остаток, только если ни
 * один способ передвижения не быстрее этой скорости. Сейчас быстрее всего
 * ходьба, но скоростной лифт высотного корпуса (2–3 м/с) быстрее неё, и
 * деление на скорость ходьбы молча лишило бы поиск оптимальности. Максимум по
 * профилю оставляет оценку верной при любых числах в нём.
 */
const FASTEST_SPEED = Math.max(
  WALKING_PROFILE.walkSpeed,
  WALKING_PROFILE.stairsVerticalSpeed,
  WALKING_PROFILE.liftVerticalSpeed
);

/**
 * Штраф за ребро, соединяющее разные этажи или корпуса без описанного
 * перехода. Маршрут через него технически возможен, но делается заведомо
 * дорогим, чтобы при наличии корректного перехода выбрался именно он.
 */
const CROSS_FLOOR_WITHOUT_TRANSITION_COST = 10_000;

/**
 * Веса переходов пиксельной модели: чем меньше, тем предпочтительнее.
 *
 * Переход всегда «дешевле» длинного пешего отрезка, но дороже короткого:
 * вход стоит 5 условных единиц, лестница — 40. Значения подобраны так, чтобы
 * маршрут не петлял через лишние лестницы, но и не запрещал их.
 */
const PIXEL_TRANSITION_WEIGHTS: Record<TransitionType, number> = {
  entrance: 5,
  lift: 15,
  bridge: 25,
  stairs: 40,
};

/**
 * Во сколько раз лестница дороже для поиска при `preferLift` в метрическом
 * режиме.
 *
 * Именно штраф лестнице, а не скидка лифту: скидка опустила бы стоимость ниже
 * времени, за которое расстояние вообще можно преодолеть, и нижняя оценка
 * остатка стала бы неверной. Подъём на этаж по лестнице (около 18 с) для
 * поиска стоит около 54 с, лифт на этаж — 30 с ожидания и 4 с поездки: лифт
 * выбирается, пока дорога к нему длиннее не больше чем на 20 с ходьбы.
 */
const PREFER_LIFT_STAIRS_FACTOR = 3;

/** Физика одного шага. */
export interface StepPhysics {
  /** Длина шага по плану (горизонтальная проекция), метры. */
  meters: number;

  /** Время шага, секунды. */
  seconds: number;
}

function isAllowed(type: TransitionType | null, opts: NormalizedOptions): boolean {
  switch (type) {
    case null:
      return true;
    case 'stairs':
      return opts.allowStairs;
    case 'lift':
      return opts.allowLift;
    case 'bridge':
      return opts.allowBridge;
    case 'entrance':
      return opts.allowEntrance;
  }
}

function onSameFloor(a: MapNode, b: MapNode): boolean {
  return a.building === b.building && a.floor === b.floor;
}

/**
 * Стоимость шага пиксельной модели — ровно та, что была до введения метрики.
 *
 * Скидка лифту при `preferLift` здесь сохранена: эвристика в этом режиме
 * нулевая, и скидка ничего не ломает.
 */
function pixelStepCost(
  a: MapNode,
  b: MapNode,
  type: TransitionType | null,
  opts: NormalizedOptions
): number {
  switch (type) {
    case 'stairs':
      return opts.preferLift ? PIXEL_TRANSITION_WEIGHTS.stairs * 1.5 : PIXEL_TRANSITION_WEIGHTS.stairs;
    case 'lift':
      return opts.preferLift ? PIXEL_TRANSITION_WEIGHTS.lift * 0.7 : PIXEL_TRANSITION_WEIGHTS.lift;
    case 'bridge':
      return PIXEL_TRANSITION_WEIGHTS.bridge;
    case 'entrance':
      return PIXEL_TRANSITION_WEIGHTS.entrance;
    case null:
      // Обычное ребро внутри этажа — расстояние в пикселях плана; между
      // этажами без перехода — ошибка в данных.
      return onSameFloor(a, b) ? distance(a, b) : CROSS_FLOOR_WITHOUT_TRANSITION_COST;
  }
}

function worldOf(graph: Graph, node: MapNode): WorldPoint {
  const point = graph.getWorld(node.id);

  if (point === undefined) {
    // Метрический граф проецирует либо каждый узел, либо ни одного (см.
    // `Graph`), поэтому это нарушение инварианта графа, а не ошибка данных.
    throw new Error(`Нет мировых координат узла "${node.id}" в метрическом графе`);
  }

  return point;
}

/**
 * Физика шага между двумя точками пространства кампуса.
 *
 * Оба слагаемых времени — путь, делённый на скорость не больше самой быстрой,
 * плюс неотрицательные надбавки. На этом держится согласованность эвристики.
 */
function metricPhysics(
  a: WorldPoint,
  b: WorldPoint,
  type: TransitionType | null,
  boarding: boolean
): StepPhysics {
  const meters = Math.hypot(a.x - b.x, a.y - b.y);
  const rise = Math.abs(a.z - b.z);
  const walking = meters / WALKING_PROFILE.walkSpeed;

  switch (type) {
    case 'lift':
      return {
        meters,
        seconds:
          walking +
          rise / WALKING_PROFILE.liftVerticalSpeed +
          (boarding ? WALKING_PROFILE.liftWaitSeconds : 0),
      };
    case 'entrance':
      return {
        meters,
        seconds:
          walking + rise / WALKING_PROFILE.stairsVerticalSpeed + WALKING_PROFILE.entranceSeconds,
      };
    case 'stairs':
    case 'bridge':
    case null:
      // Перепад без лифта преодолевается ногами — по лестнице, ступеням или
      // пандусу. У ребра внутри этажа перепада нет.
      return { meters, seconds: walking + rise / WALKING_PROFILE.stairsVerticalSpeed };
  }
}

/**
 * Стоимость шага для поиска.
 *
 * @param boarding шаг начинает поездку на лифте: к этому узлу пришли не на
 *        лифте. Ожидание входит только в такой шаг — иначе поездка по цепочке
 *        переходов на пять этажей ждала бы лифт пять раз.
 * @returns `Infinity`, если шаг запрещён опциями.
 */
export function stepCost(
  graph: Graph,
  from: MapNode,
  to: MapNode,
  type: TransitionType | null,
  boarding: boolean,
  opts: NormalizedOptions
): number {
  if (!isAllowed(type, opts)) return Number.POSITIVE_INFINITY;
  if (!graph.isMetric) return pixelStepCost(from, to, type, opts);

  const { seconds } = metricPhysics(worldOf(graph, from), worldOf(graph, to), type, boarding);

  if (type === null && !onSameFloor(from, to)) {
    // Ошибка в данных. Штраф отпугивает поиск, но не опускает стоимость ниже
    // физического времени — иначе нижняя оценка остатка стала бы неверной.
    return Math.max(CROSS_FLOOR_WITHOUT_TRANSITION_COST, seconds);
  }

  return type === 'stairs' && opts.preferLift ? seconds * PREFER_LIFT_STAIRS_FACTOR : seconds;
}

/**
 * Физика шага, не зависящая от предпочтений.
 *
 * @returns `null` в пиксельном режиме: у пикселей разных планов нет ни метров,
 *          ни секунд.
 */
export function stepPhysics(
  graph: Graph,
  from: MapNode,
  to: MapNode,
  type: TransitionType | null,
  boarding: boolean
): StepPhysics | null {
  if (!graph.isMetric) return null;

  return metricPhysics(worldOf(graph, from), worldOf(graph, to), type, boarding);
}

/**
 * Нижняя оценка стоимости пути от узла до цели — эвристика A*.
 *
 * **Пиксельный режим — ноль.** Координаты узла — пиксели плана своего этажа,
 * общей системы у планов нет, и любая пиксельная оценка переоценивает остаток:
 * это уже приводило к неоптимальным маршрутам (запись 6 в `DECISIONS.md`).
 *
 * **Метрический режим** — прямое расстояние в пространстве кампуса, делённое
 * на самую быструю скорость профиля. Оценка согласованна: для любого шага
 * `a → b`
 *
 *     stepCost ≥ (горизонталь + перепад) / FASTEST_SPEED ≥ |ab| / FASTEST_SPEED,
 *
 * потому что каждая часть стоимости — путь, делённый на скорость не больше
 * самой быстрой, надбавки неотрицательны, а штрафы только увеличивают
 * стоимость. Отсюда по неравенству треугольника `h(a) ≤ stepCost + h(b)`.
 * Тест `pathfinding.consistency` проверяет первое неравенство на каждом ребре.
 */
export function heuristic(graph: Graph, from: MapNode, goal: MapNode): number {
  if (!graph.isMetric) return 0;

  const a = worldOf(graph, from);
  const b = worldOf(graph, goal);

  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / FASTEST_SPEED;
}
