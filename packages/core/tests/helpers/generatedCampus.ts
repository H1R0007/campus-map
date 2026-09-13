import { Graph } from '../../src/graph/Graph.js';
import { createCampusProjection } from '../../src/projection.js';
import type {
  BuildingMeta,
  CampusMeta,
  FloorMeta,
  MapNode,
  Transition,
  TransitionType,
  WorldPoint,
} from '../../src/index.js';

/**
 * Случайный многоэтажный кампус для проверок поиска пути.
 *
 * Общий для теста оптимальности и теста согласованности эвристики. Сам
 * генератор — не оракул: он только строит данные, а независимые расчёты
 * живут в тестах.
 */

/**
 * Детерминированный ГПСЧ (mulberry32).
 *
 * `Math.random()` сделал бы падение теста невоспроизводимым: сообщение
 * «маршрут неоптимален» без входных данных бесполезно.
 */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TRANSITION_TYPES: TransitionType[] = ['stairs', 'lift', 'bridge', 'entrance'];

/** Привязка этажа такой, какой её задумал генератор. */
interface PlanTruth {
  scale: number;
  originX: number;
  originY: number;
  rotationRad: number;
  z: number;
}

export interface GeneratedCampus {
  nodeIds: string[];

  /** Граф без привязки планов. */
  pixel: Graph;

  /** Тот же граф с полной привязкой всех этажей. */
  metric: Graph;

  /**
   * Точка узла в пространстве кампуса, посчитанная генератором напрямую, без
   * `createCampusProjection`: иначе оракул проверял бы проекцию ею же самой.
   */
  worldOf(node: MapNode): WorldPoint;
}

/**
 * Строит кампус.
 *
 * Устроен так, чтобы у поиска был выбор и ошибка модели давала другой ответ,
 * а не тот же самый: несколько этажей с координатами в независимых
 * пиксельных системах, лестница и лифт из разных узлов между соседними
 * этажами, цепочки лифта через все этажи (там важна посадка), случайные хорды.
 * Привязка планов случайная, у части этажей — своя поверх привязки корпуса.
 */
export function generateCampus(random: () => number, buildings: number, floors: number): GeneratedCampus {
  const nodes: MapNode[] = [];
  const transitions: Transition[] = [];
  const nodeIds: string[] = [];
  const buildingMetas: BuildingMeta[] = [];
  const truth = new Map<string, PlanTruth>();

  const nodesPerFloor = 5;

  for (let b = 0; b < buildings; b++) {
    const building = `b${b}`;

    const placement = {
      metersPerPixel: 0.02 + random() * 0.18,
      originMeters: { x: random() * 500, y: random() * 500 },
      rotationDeg: random() * 360,
      baseElevationMeters: random() * 2 - 1,
      floorHeightMeters: 3 + random() * 1.5,
    };
    const floorMetas: FloorMeta[] = [];

    for (let f = 1; f <= floors; f++) {
      const floorNodes: MapNode[] = [];

      for (let n = 0; n < nodesPerFloor; n++) {
        const id = `${building}_f${f}_n${n}`;

        floorNodes.push({
          id,
          building,
          floor: f,
          // Разброс координат по этажам намеренно большой: так разность
          // координат между этажами заведомо больше веса перехода.
          x: Math.round(random() * 2000),
          y: Math.round(random() * 2000),
          neighbors: [],
          isPortal: false,
        });

        nodeIds.push(id);
      }

      // Цепочка + случайные хорды: граф связен, но не дерево.
      for (let n = 1; n < floorNodes.length; n++) {
        floorNodes[n - 1].neighbors.push(floorNodes[n].id);
        floorNodes[n].neighbors.push(floorNodes[n - 1].id);
      }
      for (let n = 0; n < floorNodes.length; n++) {
        if (random() < 0.3) {
          const other = Math.floor(random() * floorNodes.length);
          if (other !== n) {
            floorNodes[n].neighbors.push(floorNodes[other].id);
            floorNodes[other].neighbors.push(floorNodes[n].id);
          }
        }
      }

      nodes.push(...floorNodes);

      // Две вертикальные связи между соседними этажами — лестница и лифт из
      // разных узлов. Именно выбор между ними ломался при плохой эвристике.
      if (f > 1) {
        transitions.push({
          fromNode: `${building}_f${f - 1}_n0`,
          toNode: `${building}_f${f}_n0`,
          type: 'stairs',
        });
        transitions.push({
          fromNode: `${building}_f${f - 1}_n${nodesPerFloor - 1}`,
          toNode: `${building}_f${f}_n${nodesPerFloor - 1}`,
          type: 'lift',
        });
      }

      // У части этажей своя привязка поверх корпусной — так проверяется
      // слияние уровней, а не только значения корпуса.
      const floorMeta: FloorMeta = { floor: f };
      let origin = placement.originMeters;
      let rotationDeg = placement.rotationDeg;
      let z = placement.baseElevationMeters + (f - 1) * placement.floorHeightMeters;

      if (random() < 0.3) {
        origin = { x: random() * 500, y: random() * 500 };
        rotationDeg = random() * 360;
        floorMeta.placement = { originMeters: origin, rotationDeg };
      }
      if (random() < 0.2) {
        z += random() - 0.5;
        floorMeta.elevationMeters = z;
      }

      floorMetas.push(floorMeta);
      truth.set(`${building}#${f}`, {
        scale: placement.metersPerPixel,
        originX: origin.x,
        originY: origin.y,
        rotationRad: (rotationDeg * Math.PI) / 180,
        z,
      });
    }

    buildingMetas.push({ id: building, name: building, placement, floors: floorMetas });

    // Связь с предыдущим корпусом случайным типом перехода.
    if (b > 0) {
      transitions.push({
        fromNode: `b${b - 1}_f1_n2`,
        toNode: `${building}_f1_n2`,
        type: TRANSITION_TYPES[Math.floor(random() * TRANSITION_TYPES.length)],
      });
    }
  }

  const campusMeta: CampusMeta = {
    buildings: buildingMetas.map(({ id }) => ({ id })),
    mapSize: { width: 2000, height: 2000 },
    metersPerPixel: 0.1,
  };

  return {
    nodeIds,
    pixel: new Graph(nodes, transitions),
    metric: new Graph(nodes, transitions, createCampusProjection(campusMeta, buildingMetas)),

    worldOf(node) {
      const plan = truth.get(`${node.building}#${node.floor}`);
      if (plan === undefined) {
        throw new Error(`Генератор не создавал этаж узла "${node.id}"`);
      }

      const px = node.x * plan.scale;
      const py = node.y * plan.scale;
      const cos = Math.cos(plan.rotationRad);
      const sin = Math.sin(plan.rotationRad);

      return { x: plan.originX + px * cos - py * sin, y: plan.originY + px * sin + py * cos, z: plan.z };
    },
  };
}
