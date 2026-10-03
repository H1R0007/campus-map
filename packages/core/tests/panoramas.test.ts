import { describe, expect, it } from 'vitest';
import {
  CAMPUS_BUILDING_ID,
  Graph,
  bearingOf,
  createCampusProjection,
  panoramaLinks,
  parsePanoramas,
  planRotationLookup,
  routePanoramaViews,
  yawOnPanorama,
} from '../src/index.js';
import type { BuildingMeta, CampusMeta, MapNode, Panorama, Transition } from '../src/index.js';

/**
 * Панорамы 360° в точках графа (запись 90): разбор `panoramas.json`, стрелки
 * к соседним снимкам и виды вдоль маршрута.
 *
 * Кампус теста — корпус «b», повёрнутый на 90° по часовой стрелке, чтобы
 * перевод направлений между планом и территорией проверялся не на нулевом
 * угле. Этаж 1 (план, метр в пикселе, ось y вниз):
 *
 *      r (10,0)             s1 (20,0) ══ s2 (20,0) этаж 2
 *        │                    │
 *   c0 ─ c1 ─────── c2 ─────── c3
 *  (0,10)(2,11)    (10,10)    (20,10)
 *                   │          │
 *                   │          k (20,12) — ниша в двух метрах
 *                  d (10,20) ══ e (улица)
 *
 * c1 чуть ниже прямой: первое ребро из c0 смотрит на 63°, а коридор — на 90°.
 */

function node(id: string, building: string, floor: number, x: number, y: number, neighbors: string[]): MapNode {
  return { id, building, floor, x, y, neighbors, isPortal: false };
}

const NODES: MapNode[] = [
  node('c0', 'b', 1, 0, 10, ['c1']),
  node('c1', 'b', 1, 2, 11, ['c0', 'c2']),
  node('c2', 'b', 1, 10, 10, ['c1', 'c3', 'r', 'd']),
  node('c3', 'b', 1, 20, 10, ['c2', 's1', 'k']),
  node('k', 'b', 1, 20, 12, ['c3']),
  node('r', 'b', 1, 10, 0, ['c2']),
  node('s1', 'b', 1, 20, 0, ['c3']),
  node('d', 'b', 1, 10, 20, ['c2']),
  node('s2', 'b', 2, 20, 0, []),
  // Дверь d на территории: (100 − 20, 100 + 10) = (80, 110); снаружи — на 2 м западнее.
  node('e', CAMPUS_BUILDING_ID, 0, 78, 110, []),
];

const TRANSITIONS: Transition[] = [
  { fromNode: 's1', toNode: 's2', type: 'stairs' },
  { fromNode: 'd', toNode: 'e', type: 'entrance' },
];

const CAMPUS: CampusMeta = { buildings: [{ id: 'b' }], mapSize: { width: 200, height: 200 }, metersPerPixel: 1 };

const BUILDING: BuildingMeta = {
  id: 'b',
  name: 'B',
  placement: {
    metersPerPixel: 1,
    originMeters: { x: 100, y: 100 },
    rotationDeg: 90,
    baseElevationMeters: 0,
    floorHeightMeters: 4,
  },
  floors: [{ floor: 1 }, { floor: 2 }],
};

const metric = new Graph(NODES, TRANSITIONS, createCampusProjection(CAMPUS, [BUILDING]));
const pixel = new Graph(NODES, TRANSITIONS);
const planRotation = planRotationLookup([BUILDING]);

/** Панорамы узлов; `heading` по умолчанию 0 — середина снимка смотрит вверх по плану. */
function panoramasAt(nodes: string[], extra: Partial<Record<string, Partial<Panorama>>> = {}): Map<string, Panorama> {
  return new Map(
    nodes.map((id) => [
      id,
      {
        node: id,
        file: `${id}.jpg`,
        heading: 0,
        takenAt: null,
        hiddenLinks: new Set<string>(),
        linkHeadings: new Map<string, number>(),
        ...extra[id],
      },
    ])
  );
}

const targetsOf = (links: { target: string }[]) => links.map((link) => link.target);

describe('углы', () => {
  it('направление — по часовой стрелке от верха плана, ось y вниз', () => {
    expect(bearingOf(0, -1)).toBe(0);
    expect(bearingOf(1, 0)).toBe(90);
    expect(bearingOf(0, 1)).toBe(180);
    expect(bearingOf(-1, 0)).toBe(270);
  });

  it('угол на снимке — направление минус heading, в (−180, 180]', () => {
    expect(yawOnPanorama(90, 30)).toBe(60);
    expect(yawOnPanorama(10, 350)).toBe(20);
    expect(yawOnPanorama(350, 10)).toBe(-20);
    expect(yawOnPanorama(180, 0)).toBe(180);
    expect(yawOnPanorama(0, 180)).toBe(180);
  });
});

describe('parsePanoramas', () => {
  const hasNode = (id: string) => metric.hasNode(id);

  it('файла нет — панорам нет, предупреждений тоже', () => {
    const result = parsePanoramas(null, hasNode);
    expect(result.panoramas.size).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it('не тот корень — предупреждение, а не падение', () => {
    expect(parsePanoramas([], hasNode).warnings).toHaveLength(1);
    expect(parsePanoramas({ panoramas: {} }, hasNode).warnings).toHaveLength(1);
  });

  it('приводит углы к [0, 360) и оставляет дату снимка', () => {
    const { panoramas, warnings } = parsePanoramas(
      {
        panoramas: [
          { node: 'c0', file: 'b/1/c0.jpg', heading: -90, takenAt: '2026-10-01' },
          { node: 'c2', file: 'c2.WEBP', heading: 450, takenAt: '2026-10', links: { headings: { s2: -45 } } },
          { node: 'c3', file: 'c3.png' },
        ],
      },
      hasNode
    );

    expect(warnings).toEqual([]);
    expect(panoramas.get('c0')).toMatchObject({ heading: 270, takenAt: '2026-10-01', file: 'b/1/c0.jpg' });
    expect(panoramas.get('c2')?.heading).toBe(90);
    expect(panoramas.get('c2')?.linkHeadings.get('s2')).toBe(315);
    expect(panoramas.get('c3')?.heading).toBeNull();
  });

  it('пропускает неизвестный узел, повтор узла и опасное имя файла', () => {
    const files = ['../c.jpg', '/c.jpg', 'a\\c.jpg', 'фото.jpg', 'c.gif', 'a//c.jpg', 'a/../c.jpg', '.c.jpg', 'c'];
    const { panoramas, warnings } = parsePanoramas(
      {
        panoramas: [
          { node: 'nowhere', file: 'x.jpg', heading: 0 },
          { node: 'c0', file: 'c0.jpg', heading: 0 },
          { node: 'c0', file: 'again.jpg', heading: 0 },
          ...files.map((file) => ({ node: 'c2', file, heading: 0 })),
        ],
      },
      hasNode
    );

    expect([...panoramas.keys()]).toEqual(['c0']);
    expect(panoramas.get('c0')?.file).toBe('c0.jpg');
    expect(warnings).toHaveLength(2 + files.length);
  });

  it('битые поля — предупреждение, снимок остаётся', () => {
    const { panoramas, warnings } = parsePanoramas(
      {
        panoramas: [
          {
            node: 'c0',
            file: 'c0.jpg',
            heading: 'север',
            takenAt: '01.10.2026',
            links: { hide: ['c2', 'nowhere'], headings: { c3: 'вправо', nowhere: 10 } },
          },
        ],
      },
      hasNode
    );

    const panorama = panoramas.get('c0');
    expect(panorama?.heading).toBeNull();
    expect(panorama?.takenAt).toBeNull();
    expect([...(panorama?.hiddenLinks ?? [])]).toEqual(['c2']);
    expect(panorama?.linkHeadings.size).toBe(0);
    expect(warnings).toHaveLength(5);
  });
});

describe('panoramaLinks', () => {
  it('стрелка ведёт к ближайшей панораме и дальше неё не идёт', () => {
    const links = panoramaLinks(metric, panoramasAt(['c0', 'c2', 'c3']), 'c0');
    expect(targetsOf(links)).toEqual(['c2']);
    expect(links[0].path).toEqual(['c0', 'c1', 'c2']);
    expect(links[0].transition).toBeNull();
    expect(links[0].distanceMeters).toBeCloseTo(Math.hypot(2, 1) + Math.hypot(8, 1), 6);
  });

  it('направление — на точку пути не ближе трёх метров, а не на первое ребро', () => {
    const [link] = panoramaLinks(metric, panoramasAt(['c0', 'c2']), 'c0');
    expect(link.bearing).toBeCloseTo(90, 6);
    // Без порога это было бы ребро c0→c1: 63°.
    const [near] = panoramaLinks(metric, panoramasAt(['c0', 'c2']), 'c0', { aimMeters: 1 });
    expect(near.bearing).toBeCloseTo(bearingOf(2, 1), 6);
  });

  it('угол на снимке учитывает, куда смотрит его середина', () => {
    const [link] = panoramaLinks(metric, panoramasAt(['c0', 'c2'], { c0: { heading: 30 } }), 'c0');
    expect(link.yaw).toBeCloseTo(60, 6);

    const [unset] = panoramaLinks(metric, panoramasAt(['c0', 'c2'], { c0: { heading: null } }), 'c0');
    expect(unset.bearing).toBeCloseTo(90, 6);
    expect(unset.yaw).toBeNull();
  });

  it('из развилки — стрелка в каждую сторону', () => {
    const links = panoramaLinks(metric, panoramasAt(['c2', 'c0', 'c3', 'r', 'd']), 'c2');
    const byTarget = new Map(links.map((link) => [link.target, link.bearing]));
    expect([...byTarget.keys()].sort()).toEqual(['c0', 'c3', 'd', 'r']);
    expect(byTarget.get('r')).toBeCloseTo(0, 6);
    expect(byTarget.get('c3')).toBeCloseTo(90, 6);
    expect(byTarget.get('d')).toBeCloseTo(180, 6);
    // К c0 путь идёт через c1 — до неё 8 м, прицел на неё.
    expect(byTarget.get('c0')).toBeCloseTo(bearingOf(-8, 1), 6);
  });

  it('скрытая стрелка не показывается, и через её панораму поиск не идёт', () => {
    const panoramas = panoramasAt(['c0', 'c2', 'c3'], { c0: { hiddenLinks: new Set(['c2']) } });
    expect(panoramaLinks(metric, panoramas, 'c0')).toEqual([]);
  });

  it('дальше предела по пути стрелки нет', () => {
    expect(targetsOf(panoramaLinks(metric, panoramasAt(['c0', 'c3']), 'c0', { maxMeters: 15 }))).toEqual([]);
    expect(targetsOf(panoramaLinks(metric, panoramasAt(['c0', 'c3']), 'c0'))).toEqual(['c3']);
  });

  it('стрелка на лестницу: направление по своему этажу, тип перехода — лестница', () => {
    const [link] = panoramaLinks(metric, panoramasAt(['c3', 's2']), 'c3');
    expect(link.target).toBe('s2');
    expect(link.transition).toBe('stairs');
    expect(link.bearing).toBeCloseTo(0, 6);
    expect(link.distanceMeters).toBeCloseTo(10, 6);
  });

  it('снимок на самой лестнице: направления нет, пока его не задали вручную', () => {
    const [plain] = panoramaLinks(metric, panoramasAt(['s1', 's2']), 's1');
    expect(plain.bearing).toBeNull();
    expect(plain.yaw).toBeNull();

    const manual = panoramasAt(['s1', 's2'], { s1: { heading: 10, linkHeadings: new Map([['s2', 45]]) } });
    const [link] = panoramaLinks(metric, manual, 's1');
    expect(link.bearing).toBe(45);
    expect(link.yaw).toBe(35);
  });

  it('выход на улицу: направление по метрам кампуса, переведённое в план корпуса', () => {
    // Снаружи — на 2 м западнее двери. Корпус повёрнут на 90°, поэтому запад
    // территории — это низ его плана: 270° − 90° = 180°.
    const [link] = panoramaLinks(metric, panoramasAt(['d', 'e']), 'd', { planRotation });
    expect(link.target).toBe('e');
    expect(link.transition).toBe('entrance');
    expect(link.bearing).toBeCloseTo(180, 6);

    // Без поворота плана перевести направление не во что.
    expect(panoramaLinks(metric, panoramasAt(['d', 'e']), 'd')[0].bearing).toBeNull();
  });

  it('с улицы внутрь: на территории поворота нет', () => {
    const [link] = panoramaLinks(metric, panoramasAt(['e', 'd']), 'e', { planRotation });
    expect(link.bearing).toBeCloseTo(90, 6);
  });

  it('пиксельный режим: направление по плану, без метров и без предела в метрах', () => {
    const [link] = panoramaLinks(pixel, panoramasAt(['c0', 'c3']), 'c0', { maxMeters: 1 });
    expect(link.target).toBe('c3');
    expect(link.distanceMeters).toBeNull();
    // Масштаба нет — направление по первой несовпадающей точке.
    expect(link.bearing).toBeCloseTo(bearingOf(2, 1), 6);

    expect(panoramaLinks(pixel, panoramasAt(['c0', 'c3']), 'c0', { maxEdges: 2 })).toEqual([]);
  });

  it('у узла без панорамы стрелок нет', () => {
    expect(panoramaLinks(metric, panoramasAt(['c2']), 'c0')).toEqual([]);
  });
});

describe('routePanoramaViews', () => {
  it('снимки вдоль маршрута смотрят туда, куда маршрут ведёт дальше', () => {
    const path = ['c0', 'c1', 'c2', 'r'];
    const views = routePanoramaViews(metric, panoramasAt(['c0', 'c2', 'r'], { c2: { heading: 90 } }), path);

    expect(views.map((view) => [view.node, view.pathIndex, view.next])).toEqual([
      ['c0', 0, 'c2'],
      ['c2', 2, 'r'],
      ['r', 3, null],
    ]);
    expect(views[0].bearing).toBeCloseTo(90, 6);
    // С развилки c2 маршрут уходит вверх, в комнату; середина снимка смотрит вправо.
    expect(views[1].bearing).toBeCloseTo(0, 6);
    expect(views[1].yaw).toBeCloseTo(-90, 6);
    // У последней точки — куда человек шёл, входя в комнату: вверх.
    expect(views[2].bearing).toBeCloseTo(0, 6);
  });

  it('по приходу — по последним шагам, а не по точке в трёх метрах', () => {
    // В нишу k входят с c3 на юг; точка в трёх метрах назад — c2, по диагонали.
    const [view] = routePanoramaViews(metric, panoramasAt(['k']), ['c2', 'c3', 'k']);
    expect(view.bearing).toBeCloseTo(180, 6);
  });

  it('с лестницы — по направлению подхода к ней', () => {
    const views = routePanoramaViews(metric, panoramasAt(['s1']), ['c3', 's1', 's2']);
    expect(views[0].bearing).toBeCloseTo(0, 6);
  });
});
