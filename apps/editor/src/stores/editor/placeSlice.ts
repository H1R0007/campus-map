import { resolvePlanPlacement } from '@campus-map/core';
import type { MapSize } from '@campus-map/core';
import { applySimilarity, composeSimilarity, invertSimilarity, scaleOf } from '../../import/planGeometry';
import type { Point, Similarity } from '../../import/planGeometry';
import { frameOf, initialFrame, placementOf, placementOfWorld, withScaleAndRotation, worldOf } from '../../import/placementMath';
import { planMetersPerPixel } from '../../import/scale';
import { openingFloorOf } from './viewSlice';
import { showPlanIn } from './windowSlice';
import type { EditorSlice } from './types';

/**
 * Постановка корпуса на территорию и масштаб территории (запись 50).
 *
 * Постановка: план этажа входа лежит поверх территории целиком, а
 * территория — красными линиями поверх него (запись 62); план тащат,
 * вращают и растягивают за ручки или задают числами; для точности —
 * булавка (запись 63): приколоть угол здания и довернуть план вокруг него.
 * «Готово» — одна правка: привязка корпуса в метрах.
 *
 * Масштаб территории: два места на её плане и расстояние между ними в
 * метрах. Без него метров нет вовсе — и корпус не поставить.
 */

/**
 * Как показывать наложение (запись 62): эталон — то, по чему равняются
 * (территория или этаж входа), — поверх плана красным.
 *
 * - `contour` — внешний контур эталона (для этажей);
 * - `lines` — все линии эталона: стены этажа или границы на территории;
 * - `swipe` — шторка: слева эталон, справа план, без линий.
 */
export type OverlayShow = 'contour' | 'lines' | 'swipe';

/** Булавка: точка плана и где она стоит на эталоне. */
export interface Pin {
  plan: Point;
  at: Point;
}

export interface Placing {
  /**
   * Что ставим: корпус — на территорию (план этажа входа поверх территории)
   * или этаж — на этаж входа своего корпуса (план этажа поверх него).
   */
  mode: 'building' | 'floor';
  building: string;
  /** Этаж, план которого ставим: этаж входа для корпуса, сам этаж — для этажа. */
  floor: number;
  /**
   * Метров в пикселе того, что под планом: территории или этажа входа.
   * `null` — масштаб территории неизвестен и найдётся по этому корпусу.
   */
  baseMpp: number | null;
  /** Метров в пикселе плана по масштабу чертежа (запись 54); `null` — неизвестно. */
  planMpp: number | null;
  planSize: MapSize;
  /** Пиксель плана → пиксель территории. */
  frame: Similarity;
  /** Булавка: план доворачивают вокруг неё (запись 63). */
  pin: Pin | null;
  show: OverlayShow;
  /** Чувствительность линий, 0…1: у бледного скана линии светлее. */
  strength: number;
  /** Пока зажат пробел, виден только эталон. */
  peek: boolean;
}

export interface Measuring {
  /** Точки на плане территории, пиксели; не больше двух. */
  points: Point[];
}

export interface PlaceSlice {
  placing: Placing | null;
  measuring: Measuring | null;
  /**
   * Начать постановку. `view` — что сейчас видно на карте территории: туда
   * кладётся план корпуса, у которого ещё нет привязки.
   *
   * @returns текст проблемы или `null`
   */
  startPlacing: (building: string, view: { center: Point; width: number }) => string | null;
  /**
   * Совместить этаж с этажом входа: открывается этаж входа, поверх —
   * план этажа.
   *
   * @returns текст проблемы или `null`
   */
  startPlacingFloor: (building: string, floor: number) => string | null;
  setPlacingFrame: (frame: Similarity) => void;
  /** Приколоть булавку в этом месте эталона; `null` — открепить. */
  setPlacingPin: (at: Point | null) => void;
  setPlacingShow: (show: OverlayShow) => void;
  setPlacingStrength: (strength: number) => void;
  setPlacingPeek: (peek: boolean) => void;
  applyPlacing: () => void;
  cancelPlacing: () => void;

  startMeasuring: () => void;
  measureClick: (x: number, y: number) => void;
  /** @returns текст проблемы или `null` */
  applyMeasuring: (meters: number) => string | null;
  cancelMeasuring: () => void;
}

/**
 * Растягивать ли план вокруг булавки: нет, если масштаб известен и у плана
 * (по чертежу), и у того, что под ним.
 */
export function placingAllowsScale(placing: Pick<Placing, 'planMpp' | 'baseMpp'>): boolean {
  return placing.planMpp === null || placing.baseMpp === null;
}

/** Показ по умолчанию: для этажей — контур этажа входа, для корпуса — линии территории. */
const overlayDefaults = (mode: Placing['mode']) => ({
  pin: null,
  show: (mode === 'floor' ? 'contour' : 'lines') as OverlayShow,
  strength: 0.5,
  peek: false,
});

export const createPlaceSlice: EditorSlice<PlaceSlice> = (set, get) => ({
  placing: null,
  measuring: null,

  startPlacing: (building, view) => {
    const st = get();
    const meta = st.buildingMetas.get(building);
    if (!meta) return 'Корпуса нет';
    const campusMpp = st.campusMeta?.metersPerPixel;
    const floor = openingFloorOf(meta);
    if (floor === null) return 'У корпуса нет этажей — ставить нечего';
    const floorMeta = meta.floors.find((item) => item.floor === floor)!;
    const planMpp = planMetersPerPixel(floorMeta);
    // Без масштаба территории корпус с масштабом чертежа сам задаёт его.
    if (campusMpp === undefined && planMpp === null) {
      return 'Сначала задайте масштаб территории: два места и расстояние между ними';
    }
    const planSize = floorMeta.mapSize ?? { width: 1000, height: 700 };
    const resolved = campusMpp === undefined ? null : resolvePlanPlacement(meta, floorMeta);
    let frame = resolved ? frameOf(resolved, campusMpp!) : initialFrame(planSize, view);
    // Новый корпус с масштабом чертежа — сразу в своём размере.
    if (!resolved && planMpp !== null && campusMpp !== undefined) {
      frame = withScaleAndRotation(frame, planSize, planMpp / campusMpp, 0);
    }

    set((s) => {
      s.measuring = null;
      s.alignment = null;
      // Территория — во вкладке: план, с которого пришли, остаётся открытым (запись 66).
      showPlanIn(s, { building: null, floor: null });
      s.selectedNodeIds = new Set();
      s.activeTool = 'select';
      s.placing = {
        mode: 'building',
        building,
        floor,
        baseMpp: campusMpp ?? null,
        planMpp,
        planSize,
        frame,
        ...overlayDefaults('building'),
      };
    });
    return null;
  },

  startPlacingFloor: (building, floor) => {
    const meta = get().buildingMetas.get(building);
    const entrance = openingFloorOf(meta);
    if (!meta || entrance === null) return 'Корпуса нет';
    if (floor === entrance) return 'Этаж входа — основа корпуса: он ставится на территорию вместе с корпусом';
    const base = resolvePlanPlacement(meta, meta.floors.find((item) => item.floor === entrance)!);
    const floorMeta = meta.floors.find((item) => item.floor === floor);
    const own = floorMeta ? resolvePlanPlacement(meta, floorMeta) : null;
    if (!base || !own) return 'Сначала поставьте корпус на территорию: этажи совмещаются относительно него';
    // Пиксель этажа → метры → пиксель этажа входа. Этаж без своей привязки,
    // но с масштабом чертежа — сразу в масштабе этажа входа.
    let frame = composeSimilarity(invertSimilarity(worldOf(base)), worldOf(own));
    const floorMpp = planMetersPerPixel(floorMeta);
    const entranceMpp = planMetersPerPixel(meta.floors.find((item) => item.floor === entrance));
    if (!floorMeta?.placement && floorMpp !== null && entranceMpp !== null) {
      frame = { a: floorMpp / entranceMpp, b: 0, tx: 0, ty: 0 };
    }

    set((s) => {
      s.measuring = null;
      s.alignment = null;
      showPlanIn(s, { building, floor: entrance });
      s.selectedNodeIds = new Set();
      s.activeTool = 'select';
      s.placing = {
        mode: 'floor',
        building,
        floor,
        baseMpp: base.metersPerPixel,
        planMpp: floorMpp,
        planSize: floorMeta!.mapSize ?? { width: 1000, height: 700 },
        frame,
        ...overlayDefaults('floor'),
      };
    });
    return null;
  },

  setPlacingFrame: (frame) =>
    set((s) => {
      if (!s.placing) return;
      s.placing.frame = frame;
      // Булавка — место плана на эталоне: если план ушёл с неё (сдвинули,
      // задали числами), она больше не держит.
      const pin = s.placing.pin;
      if (pin) {
        const at = applySimilarity(frame, pin.plan);
        if (Math.hypot(at.x - pin.at.x, at.y - pin.at.y) > 0.5) s.placing.pin = null;
      }
    }),

  setPlacingPin: (at) =>
    set((s) => {
      if (!s.placing) return;
      s.placing.pin = at === null ? null : { plan: applySimilarity(invertSimilarity(s.placing.frame), at), at };
    }),

  setPlacingShow: (show) =>
    set((s) => {
      if (s.placing) s.placing.show = show;
    }),

  setPlacingStrength: (strength) =>
    set((s) => {
      if (s.placing) s.placing.strength = Math.min(1, Math.max(0, strength));
    }),

  setPlacingPeek: (peek) =>
    set((s) => {
      if (s.placing && s.placing.peek !== peek) s.placing.peek = peek;
    }),

  applyPlacing: () => {
    const { placing, campusMeta, buildingMetas } = get();
    if (!placing) return;
    if (placing.mode === 'building') {
      if (campusMeta?.metersPerPixel !== undefined) {
        get().placeBuilding(placing.building, placementOf(placing.frame, campusMeta.metersPerPixel));
      } else if (placing.planMpp !== null) {
        // Масштаб территории — по корпусу: его план в своём размере растянут
        // по очертаниям на плане территории.
        const campusScale = placing.planMpp / scaleOf(placing.frame);
        get().placeBuilding(placing.building, placementOf(placing.frame, campusScale), campusScale);
      } else {
        return;
      }
    } else {
      const meta = buildingMetas.get(placing.building);
      const entrance = openingFloorOf(meta);
      const base = meta && entrance !== null ? resolvePlanPlacement(meta, meta.floors.find((item) => item.floor === entrance)!) : null;
      if (!base) return;
      get().setFloorPlacement(placing.building, placing.floor, placementOfWorld(composeSimilarity(worldOf(base), placing.frame)));
    }
    set((s) => {
      s.placing = null;
    });
  },

  cancelPlacing: () =>
    set((s) => {
      s.placing = null;
    }),

  startMeasuring: () =>
    set((s) => {
      s.placing = null;
      s.alignment = null;
      showPlanIn(s, { building: null, floor: null });
      s.measuring = { points: [] };
    }),

  measureClick: (x, y) =>
    set((s) => {
      if (!s.measuring) return;
      // Третий щелчок начинает замер заново.
      s.measuring.points = s.measuring.points.length >= 2 ? [{ x, y }] : [...s.measuring.points, { x, y }];
    }),

  applyMeasuring: (meters) => {
    const measuring = get().measuring;
    if (!measuring || measuring.points.length < 2) return 'Щёлкните два места на плане территории';
    if (!Number.isFinite(meters) || meters <= 0) return 'Расстояние — положительное число метров';
    const [a, b] = measuring.points;
    const pixels = Math.hypot(b.x - a.x, b.y - a.y);
    if (pixels < 1) return 'Места слишком близко — выберите подальше друг от друга';
    const problem = get().setCampusScale(meters / pixels);
    if (problem) return problem;
    set((s) => {
      s.measuring = null;
    });
    return null;
  },

  cancelMeasuring: () =>
    set((s) => {
      s.measuring = null;
    }),
});
