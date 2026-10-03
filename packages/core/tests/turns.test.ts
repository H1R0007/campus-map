import { describe, expect, it } from 'vitest';
import {
  BACK_MIN_DEG,
  FORK_DEG,
  Graph,
  STRAIGHT_MAX_DEG,
  classifyTurn,
  createCampusProjection,
  landmarkPassages,
  landmarkTurnAt,
  turnAngle,
  turnAt,
} from '../src/index.js';
import type { BuildingMeta, CampusMeta, MapNode, Transition } from '../src/index.js';
import { makeRandom } from './helpers/generatedCampus.js';

/**
 * «Налево», «направо», «прямо» у ориентира (запись 85).
 *
 * Владелец спросил, точно ли направление определится правильно. Проверки
 * закрывают то, что может его исказить: повёрнутый корпус, небрежно
 * поставленную точку рядом с развилкой, вилку из двух почти прямых веток и
 * смену этажа рядом с точкой.
 */

const B = 'b';

function node(id: string, x: number, y: number, neighbors: string[], floor = 1): MapNode {
  return { id, x, y, floor, building: B, isPortal: false, neighbors };
}

/** Связи в обе стороны по списку пар. */
function linked(points: Record<string, [number, number]>, edges: Array<[string, string]>, floorOf: (id: string) => number = () => 1): MapNode[] {
  const neighbors = new Map<string, string[]>(Object.keys(points).map((id) => [id, []]));
  for (const [a, b] of edges) {
    neighbors.get(a)!.push(b);
    neighbors.get(b)!.push(a);
  }
  return Object.entries(points).map(([id, [x, y]]) => node(id, x, y, neighbors.get(id)!, floorOf(id)));
}

/** Пиксельный граф: без привязки, направление — по соседним точкам. */
function pixelGraph(nodes: MapNode[], transitions: Transition[] = []): Graph {
  return new Graph(nodes, transitions);
}

/**
 * Метрический граф: один корпус, 0,1 м в пикселе, повёрнут на `rotationDeg`.
 * Территория — 1 м в пикселе.
 */
function metricGraph(nodes: MapNode[], rotationDeg = 0, transitions: Transition[] = []): Graph {
  const floors = [...new Set(nodes.map((n) => n.floor))].map((floor) => ({ floor }));
  const building: BuildingMeta = {
    id: B,
    name: 'Корпус',
    floors,
    placement: {
      metersPerPixel: 0.1,
      originMeters: { x: 50, y: 50 },
      rotationDeg,
      baseElevationMeters: 0,
      floorHeightMeters: 3.6,
    },
  };
  const campus: CampusMeta = { buildings: [{ id: B, name: 'Корпус' }], mapSize: { width: 1000, height: 1000 }, metersPerPixel: 1 };
  const graph = new Graph(nodes, transitions, createCampusProjection(campus, [building]));
  expect(graph.isMetric).toBe(true);
  return graph;
}

/**
 * Перекрёсток буквой Т: коридор с запада на восток, ветка на север (вверх на
 * плане — ось y вниз). Длины — 10 м, в пикселях 0,1 м.
 */
const T = linked(
  { w: [0, 100], l: [100, 100], e: [200, 100], n: [100, 0] },
  [
    ['w', 'l'],
    ['l', 'e'],
    ['l', 'n'],
  ]
);

describe('turnAngle и classifyTurn', () => {
  it('ось y вниз: с востока на юг — направо', () => {
    expect(turnAngle({ x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90);
    expect(turnAngle({ x: 1, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(-90);
  });

  it('пороги: прямо, налево, направо, разворот', () => {
    expect(classifyTurn(0)).toBe('straight');
    expect(classifyTurn(STRAIGHT_MAX_DEG)).toBe('straight');
    expect(classifyTurn(STRAIGHT_MAX_DEG + 1)).toBe('right');
    expect(classifyTurn(-(STRAIGHT_MAX_DEG + 1))).toBe('left');
    expect(classifyTurn(BACK_MIN_DEG - 1)).toBe('right');
    expect(classifyTurn(-BACK_MIN_DEG)).toBe('back');
  });
});

describe('turnAt на перекрёстке', () => {
  // Каждый проход через Т глазами идущего.
  const passages: Array<[string, string, string]> = [
    ['w', 'n', 'left'], // шёл на восток, север слева
    ['w', 'e', 'straight'],
    ['e', 'n', 'right'], // шёл на запад, север справа
    ['e', 'w', 'straight'],
    ['n', 'e', 'left'], // шёл на юг, восток слева
    ['n', 'w', 'right'],
  ];

  for (const graph of [pixelGraph(T), metricGraph(T)]) {
    const mode = graph.isMetric ? 'в метрах' : 'в пикселях';
    for (const [from, to, expected] of passages) {
      it(`${mode}: ${from} → l → ${to} — ${expected}`, () => {
        expect(turnAt(graph, [from, 'l', to], 1)?.direction).toBe(expected);
      });
    }
  }

  it('повёрнутый корпус не меняет ответ: поворот плана — подобие', () => {
    for (const rotation of [20, 90, 135, 180, 270, 333]) {
      const graph = metricGraph(T, rotation);
      expect(turnAt(graph, ['w', 'l', 'n'], 1)?.direction).toBe('left');
      expect(turnAt(graph, ['n', 'l', 'w'], 1)?.direction).toBe('right');
    }
  });

  it('зеркальный план меняет лево и право местами', () => {
    const mirrored = T.map((n) => ({ ...n, x: 200 - n.x }));
    expect(turnAt(pixelGraph(mirrored), ['w', 'l', 'n'], 1)?.direction).toBe('right');
  });

  it('в начале и в конце пути поворота нет', () => {
    const graph = pixelGraph(T);
    expect(turnAt(graph, ['w', 'l', 'n'], 0)).toBeNull();
    expect(turnAt(graph, ['w', 'l', 'n'], 2)).toBeNull();
  });
});

describe('turnAt под любым углом', () => {
  it('сотни случайных развилок в повёрнутых планах: ответ совпадает с углом', () => {
    const random = makeRandom(85);

    for (let trial = 0; trial < 400; trial += 1) {
      const heading = random() * 2 * Math.PI;
      // Поворот подальше от порогов: на самом пороге ответ законно любой.
      let turn = (random() * 2 - 1) * 179;
      if ([STRAIGHT_MAX_DEG, BACK_MIN_DEG].some((edge) => Math.abs(Math.abs(turn) - edge) < 2)) turn += 5;

      const outHeading = heading + (turn * Math.PI) / 180;
      const length = 50 + random() * 100;
      const points: Record<string, [number, number]> = {
        a: [500 - Math.cos(heading) * length, 500 - Math.sin(heading) * length],
        l: [500, 500],
        c: [500 + Math.cos(outHeading) * length, 500 + Math.sin(outHeading) * length],
      };
      const nodes = linked(points, [
        ['a', 'l'],
        ['l', 'c'],
      ]);
      const graph = metricGraph(nodes, random() * 360);

      const result = turnAt(graph, ['a', 'l', 'c'], 1);
      expect(result?.angle).toBeCloseTo(turn, 6);
      expect(result?.direction).toBe(classifyTurn(turn));
    }
  });
});

describe('turnAt сглаживает небрежную разметку', () => {
  /**
   * Прямой коридор на запад—восток. Точка у ориентира поставлена на глаз, и
   * предыдущая точка коридора в 40 см от неё сдвинута на 30 см вбок: по двум
   * соседним точкам это «поворот» на 37°, а коридор прямой.
   */
  const corridor = linked(
    { a: [0, 100], b: [96, 97], l: [100, 100], c: [200, 100], side: [100, 0] },
    [
      ['a', 'b'],
      ['b', 'l'],
      ['l', 'c'],
      ['l', 'side'],
    ]
  );

  it('в метрах направление берётся по нескольким метрам пути — прямо', () => {
    expect(turnAt(metricGraph(corridor), ['a', 'b', 'l', 'c'], 2)?.direction).toBe('straight');
  });

  it('и поворот в ветку по-прежнему налево', () => {
    expect(turnAt(metricGraph(corridor), ['a', 'b', 'l', 'side'], 2)?.direction).toBe('left');
  });
});

describe('turnAt на вилке', () => {
  // Коридор расходится буквой Y: обе ветки по 20° от прямого.
  const fork = linked(
    {
      a: [0, 100],
      l: [100, 100],
      left: [100 + 100 * Math.cos((-20 * Math.PI) / 180), 100 + 100 * Math.sin((-20 * Math.PI) / 180)],
      right: [100 + 100 * Math.cos((20 * Math.PI) / 180), 100 + 100 * Math.sin((20 * Math.PI) / 180)],
    },
    [
      ['a', 'l'],
      ['l', 'left'],
      ['l', 'right'],
    ]
  );

  it('«прямо» не говорится, когда прямых веток две', () => {
    const graph = metricGraph(fork);
    expect(turnAt(graph, ['a', 'l', 'left'], 1)?.direction).toBe('bearLeft');
    expect(turnAt(graph, ['a', 'l', 'right'], 1)?.direction).toBe('bearRight');
  });

  it('боковая ветка под прямым углом вилкой не считается', () => {
    expect(FORK_DEG).toBeLessThan(90);
    expect(turnAt(metricGraph(T), ['w', 'l', 'e'], 1)?.direction).toBe('straight');
  });
});

describe('turnAt у смены этажа', () => {
  // Лестница сразу у точки: путь приходит с другого этажа.
  const nodes = linked(
    { s1: [100, 0], l: [100, 100], e: [200, 100], s2: [100, 0] },
    [
      ['s1', 'l'],
      ['l', 'e'],
    ],
    (id) => (id === 's2' ? 2 : 1)
  );
  const transitions: Transition[] = [{ fromNode: 's2', toNode: 's1', type: 'stairs' }];

  it('направление считается только по своему плану', () => {
    const graph = metricGraph(nodes, 0, transitions);
    // Пришёл по лестнице прямо в точку — откуда он шёл, на этом плане не видно.
    expect(turnAt(graph, ['s2', 'l', 'e'], 1)).toBeNull();
    // Пришёл с лестничной площадки этого этажа — видно.
    expect(turnAt(graph, ['s2', 's1', 'l', 'e'], 2)?.direction).toBe('left');
  });
});

describe('исправленный поворот и проходы через ориентир (запись 87)', () => {
  const withTurns = (turns: Array<{ from: string; to: string; turn: 'left' | 'right' | 'straight' }>) =>
    pixelGraph(T.map((n) => (n.id === 'l' ? { ...n, landmark: { name: 'Автомат', turns } } : n)));

  it('исправление действует только на свой проход', () => {
    const graph = withTurns([{ from: 'w', to: 'n', turn: 'straight' }]);
    expect(landmarkTurnAt(graph, ['w', 'l', 'n'], 1)).toBe('straight');
    expect(landmarkTurnAt(graph, ['n', 'l', 'w'], 1)).toBe('right');
  });

  it('проходы через точку — каждая пара её связей в обе стороны, с расчётом и исправлением', () => {
    const passages = landmarkPassages(withTurns([{ from: 'w', to: 'n', turn: 'straight' }]), 'l');

    expect(passages).toHaveLength(6);
    expect(passages.find((p) => p.from === 'w' && p.to === 'n')).toEqual({ from: 'w', to: 'n', auto: 'left', corrected: 'straight' });
    expect(passages.find((p) => p.from === 'e' && p.to === 'n')).toEqual({ from: 'e', to: 'n', auto: 'right', corrected: null });
  });
});
