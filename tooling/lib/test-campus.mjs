/**
 * Тестовый кампус — описание, из которого `generate-test-data.mjs` строит
 * `data/`: планы SVG, графы, привязку к метрике и переходы (запись 30).
 *
 * Id мест и их смысл повторяют прежний набор: сценарии и ручная проверка
 * опираются на «А-305» на третьем этаже, лифт только до второго, переход
 * А2—Б2, столовые в А и Б. Названия, переводы и категории — в
 * `data/aliases.json`: генератор их не трогает.
 *
 * Всё в метрах. Помещения — полосы по сторонам коридора: `side` n — к северу
 * (вверху плана), s — к югу; `from`/`to` — вдоль корпуса. Без `id` —
 * служебное помещение без узла.
 */

export const CAMPUS = { width: 320, depth: 190, metersPerPixel: 0.5 };
export const FLOOR_HEIGHT_METERS = 3.6;

const r = (id, kind, side, from, to, extra = {}) => ({ ...(id ? { id } : {}), kind, side, from, to, ...extra });
const service = (side, from, to) => r(null, 'service', side, from, to);

const A_NORTH_1 = [r('a1_stairs', 'stairs', 'n', 0, 6), r('a1_room101', 'room', 'n', 6, 18), r('a1_room102', 'room', 'n', 18, 28), service('n', 28, 32), r('a1_lift', 'lift', 'n', 32, 36), r('a1_room103', 'room', 'n', 36, 50), r('a1_room104', 'room', 'n', 50, 62), service('n', 62, 72)];

export const BUILDINGS = [
  {
    id: 'building_a',
    name: 'Корпус А',
    nameEn: 'Building A',
    label: 'А',
    width: 72,
    depth: 26,
    corridor: { y: 11.5, height: 3 },
    placement: { originMeters: { x: 30, y: 40 }, rotationDeg: 0 },
    floors: {
      1: {
        rooms: [
          ...A_NORTH_1,
          r('a1_canteen', 'canteen', 's', 0, 20),
          r('a1_cloakroom', 'cloakroom', 's', 20, 30),
          r('a1_hall', 'hall', 's', 30, 42),
          service('s', 42, 62),
          r('a1_toilet', 'toilet', 's', 62, 72),
        ],
        entrances: [{ id: 'a1_entrance', hall: 'a1_hall' }],
        ends: [{ id: 'a1_entrance_yard', end: 'west', kind: 'yard', comment: 'Открыт до 18:00 — уточнить у коменданта' }],
      },
      2: {
        rooms: [
          r('a2_stairs', 'stairs', 'n', 0, 6), r('a2_room201', 'room', 'n', 6, 18), r('a2_room202', 'room', 'n', 18, 28),
          service('n', 28, 32), r('a2_lift', 'lift', 'n', 32, 36), r('a2_dean', 'dean', 'n', 36, 50),
          r('a2_room204', 'room', 'n', 50, 62), service('n', 62, 72),
          service('s', 0, 6), r('a2_room205', 'room', 's', 6, 20), service('s', 20, 26), r('a2_room206', 'room', 's', 26, 40),
          service('s', 40, 62), r('a2_toilet', 'toilet', 's', 62, 72),
        ],
        ends: [{ id: 'a2_bridge', end: 'east', kind: 'bridge' }],
      },
      3: {
        rooms: [
          r('a3_stairs', 'stairs', 'n', 0, 6), r('a3_room301', 'room', 'n', 6, 18), r('a3_room302', 'room', 'n', 18, 30),
          service('n', 30, 36), r('a3_conference', 'conference', 'n', 36, 58), service('n', 58, 72),
          service('s', 0, 6), r('a3_room304', 'room', 's', 6, 20), service('s', 20, 26), r('a3_room305', 'room', 's', 26, 40),
          service('s', 40, 58), r('a3_rector', 'dean', 's', 58, 72),
        ],
      },
    },
  },
  {
    id: 'building_b',
    name: 'Корпус Б',
    nameEn: 'Building B',
    label: 'Б',
    width: 56,
    depth: 24,
    corridor: { y: 10.5, height: 3 },
    // Коридор Б на одной линии с коридором А: переход — прямой крытый мост.
    // Корпуса вплотную проверяет синтетический набор: по умолчанию он ставит
    // их без зазора.
    placement: { originMeters: { x: 120, y: 41 }, rotationDeg: 0 },
    floors: {
      1: {
        rooms: [
          r('b1_library', 'library', 'n', 0, 22), service('n', 22, 26), r('b1_room101', 'room', 'n', 26, 38),
          r('b1_room102', 'room', 'n', 38, 48), service('n', 48, 50), r('b1_stairs', 'stairs', 'n', 50, 56),
          r('b1_canteen', 'canteen', 's', 0, 14), service('s', 14, 22), r('b1_hall', 'hall', 's', 22, 34),
          service('s', 34, 44), r('b1_toilet', 'toilet', 's', 44, 52), service('s', 52, 56),
        ],
        entrances: [{ id: 'b1_entrance', hall: 'b1_hall' }],
      },
      2: {
        rooms: [
          r('b2_lab', 'lab', 'n', 2, 16), service('n', 16, 20), r('b2_room202', 'room', 'n', 20, 32), service('n', 32, 50),
          r('b2_stairs', 'stairs', 'n', 50, 56),
          r('b2_room203', 'room', 's', 2, 16), service('s', 16, 36),
          r('b2_room204', 'room', 's', 36, 48, { comment: 'Геометрия приблизительная — сверить с официальным планом' }),
          service('s', 48, 56),
        ],
        ends: [{ id: 'b2_bridge', end: 'west', kind: 'bridge' }],
      },
    },
  },
  {
    id: 'building_c',
    name: 'Корпус В',
    nameEn: 'Building V',
    label: 'В',
    width: 60,
    depth: 30,
    corridor: { y: 13.5, height: 3 },
    // Повёрнут: официальные корпуса редко стоят параллельно, и поворот плана
    // должен проверяться на тестовых данных.
    placement: { originMeters: { x: 210, y: 52 }, rotationDeg: 20 },
    floors: {
      1: {
        rooms: [
          r('c1_gym', 'gym', 'n', 2, 28), r('c1_pool', 'pool', 'n', 32, 58),
          r('c1_lockers', 'lockers', 's', 2, 18), r('c1_hall', 'hall', 's', 24, 36), r('c1_athletics', 'athletics', 's', 42, 58),
        ],
        entrances: [{ id: 'c1_entrance', hall: 'c1_hall' }],
      },
    },
  },
];

/** Точки территории, не зависящие от корпусов, — метры кампуса. */
export const CAMPUS_POINTS = {
  gate: { x: 148, y: 180 },
  square: { x: 148, y: 140 },
  busStop: { x: 292, y: 180 },
  parking: { x: 18, y: 146 },
};

export const TRANSITIONS = [
  ['campus_entrance_a', 'a1_entrance', 'entrance'],
  ['campus_entrance_a_yard', 'a1_entrance_yard', 'entrance'],
  ['campus_entrance_b', 'b1_entrance', 'entrance'],
  ['campus_entrance_c', 'c1_entrance', 'entrance'],
  ['a1_stairs', 'a2_stairs', 'stairs'],
  ['a2_stairs', 'a3_stairs', 'stairs'],
  ['a1_lift', 'a2_lift', 'lift'],
  ['b1_stairs', 'b2_stairs', 'stairs'],
  ['a2_bridge', 'b2_bridge', 'bridge'],
];
