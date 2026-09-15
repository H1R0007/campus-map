/**
 * Этаж корпуса «коридор с помещениями по обе стороны»: геометрия и узлы графа.
 *
 * Общая для генератора тестового кампуса (`generate-test-data.mjs`) и
 * синтетического набора целевого объёма (`generate-synthetic-campus.mjs`):
 * план и граф строятся из одного описания, поэтому узлы всегда стоят в своих
 * помещениях, а маршрут проходит через двери, а не сквозь стены (запись 30).
 *
 * Описание — в метрах от левого верхнего угла корпуса. Узлы — в пикселях
 * плана: `PLAN_METERS_PER_PIXEL` метра в пикселе.
 */

export const PLAN_METERS_PER_PIXEL = 0.1;

/** Отступ узла у наружной двери внутрь здания, метры. */
const WALL_INSET = 0.8;

/** Двери ближе этого расстояния — одна точка коридора, метры. */
const MERGE_DISTANCE = 0.6;

/** Точка помещения — на столько метров внутрь от его двери. */
const ROOM_NODE_FROM_DOOR = 1.2;

const PORTAL_KINDS = new Set(['stairs', 'lift']);

export const toPixels = (meters) => Math.round(meters / PLAN_METERS_PER_PIXEL);

/**
 * @param {object} spec
 * @param {string} spec.prefix — префикс id точек коридора: `a1`
 * @param {number} spec.width — длина корпуса, метры
 * @param {number} spec.depth — ширина корпуса, метры
 * @param {{ y: number, height: number }} spec.corridor — полоса коридора
 * @param {Array<{ id?: string, kind: string, side: 'n' | 's', from: number, to: number, comment?: string }>} spec.rooms
 *        помещения; без `id` — служебные, без узла
 * @param {Array<{ id: string, hall: string, comment?: string }>} [spec.entrances] — входы через наружную стену холла
 * @param {Array<{ id: string, end: 'west' | 'east', kind: 'yard' | 'bridge', comment?: string }>} [spec.ends]
 *        двери в торцах коридора: выход во двор или переход в соседний корпус
 */
export function layoutFloor(spec) {
  const { width, depth, corridor } = spec;
  const corridorY = corridor.y + corridor.height / 2;
  const nodes = new Map();

  const add = (id, xMeters, yMeters, isPortal, comment) => {
    if (nodes.has(id)) throw new Error(`Узел ${id} объявлен дважды`);
    nodes.set(id, {
      id,
      x: toPixels(xMeters),
      y: toPixels(yMeters),
      neighbors: [],
      isPortal,
      ...(comment ? { comment } : {}),
    });
  };
  const link = (a, b) => {
    nodes.get(a).neighbors.push(b);
    nodes.get(b).neighbors.push(a);
  };

  const rooms = spec.rooms.map((room) => {
    const top = room.side === 'n' ? 0 : corridor.y + corridor.height;
    const bottom = room.side === 'n' ? corridor.y : depth;
    return { ...room, top, bottom, cx: (room.from + room.to) / 2, cy: (top + bottom) / 2 };
  });

  // Точки коридора — против каждой двери и у торцевых дверей: маршрут идёт по
  // коридору и сворачивает в дверь под прямым углом.
  const stops = [];
  const stopAt = (x) => {
    const near = stops.find((stop) => Math.abs(stop.x - x) < MERGE_DISTANCE);
    if (near) return near;
    const stop = { x };
    stops.push(stop);
    return stop;
  };

  const namedRooms = rooms.filter((room) => room.id);
  const roomStops = new Map(namedRooms.map((room) => [room.id, stopAt(room.cx)]));
  const ends = (spec.ends ?? []).map((end) => ({
    ...end,
    stop: stopAt(end.end === 'west' ? WALL_INSET * 2 : width - WALL_INSET * 2),
    door: { x: end.end === 'west' ? 0 : width, y: corridorY },
  }));

  stops.sort((a, b) => a.x - b.x);
  stops.forEach((stop, index) => {
    stop.id = `${spec.prefix}_corridor_${index + 1}`;
    add(stop.id, stop.x, corridorY, false);
  });
  for (let i = 1; i < stops.length; i += 1) link(stops[i - 1].id, stops[i].id);

  // Точка помещения — у его двери: последний отрезок маршрута идёт от двери к
  // точке и через середину помещения перечёркивал номер аудитории. Лестница и
  // лифт — в своей середине: там их значок на плане.
  for (const room of namedRooms) {
    const portal = PORTAL_KINDS.has(room.kind);
    const doorWall = room.side === 'n' ? corridor.y - ROOM_NODE_FROM_DOOR : corridor.y + corridor.height + ROOM_NODE_FROM_DOOR;
    add(room.id, room.cx, portal ? room.cy : doorWall, portal, room.comment);
    link(room.id, roomStops.get(room.id).id);
  }

  const entrances = (spec.entrances ?? []).map((entrance) => {
    const hall = rooms.find((room) => room.id === entrance.hall);
    if (!hall) throw new Error(`${entrance.id}: нет холла ${entrance.hall}`);
    const outside = hall.side === 's' ? depth : 0;
    add(entrance.id, hall.cx, hall.side === 's' ? depth - WALL_INSET : WALL_INSET, true, entrance.comment);
    link(entrance.id, hall.id);
    return { ...entrance, door: { x: hall.cx, y: outside }, side: hall.side };
  });

  for (const end of ends) {
    add(end.id, end.end === 'west' ? WALL_INSET : width - WALL_INSET, corridorY, true, end.comment);
    link(end.id, end.stop.id);
  }

  return {
    size: { width: toPixels(width), height: toPixels(depth) },
    nodes: [...nodes.values()],
    geometry: { width, depth, corridor, rooms, entrances, ends },
  };
}

/**
 * Точка плана корпуса — метры от его левого верхнего угла — в метрах кампуса.
 *
 * Та же формула, что у `createCampusProjection` ядра: поворот по часовой
 * стрелке вокруг левого верхнего угла, ось y вниз.
 */
export function toWorld(placement, xMeters, yMeters) {
  const radians = (placement.rotationDeg * Math.PI) / 180;
  return {
    x: placement.originMeters.x + xMeters * Math.cos(radians) - yMeters * Math.sin(radians),
    y: placement.originMeters.y + xMeters * Math.sin(radians) + yMeters * Math.cos(radians),
  };
}
