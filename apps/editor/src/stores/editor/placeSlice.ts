import { resolvePlanPlacement } from '@campus-map/core';
import type { MapSize } from '@campus-map/core';
import { applySimilarity, composeSimilarity, fitSimilarity, invertSimilarity } from '../../import/planGeometry';
import type { Point, Similarity } from '../../import/planGeometry';
import { frameOf, initialFrame, placementOf, placementOfWorld, worldOf } from '../../import/placementMath';
import { openingFloorOf } from './viewSlice';
import type { EditorSlice } from './types';

/**
 * Постановка корпуса на территорию и масштаб территории (запись 50).
 *
 * Постановка: план этажа входа лежит поверх территории полупрозрачно, его
 * тащат, вращают и растягивают за ручки или задают числами; для точности —
 * пары «место на плане корпуса — то же место на территории», как при
 * совмещении. «Применить» — одна правка: привязка корпуса в метрах.
 *
 * Масштаб территории: два места на её плане и расстояние между ними в
 * метрах. Без него метров нет вовсе — и корпус не поставить.
 */

export interface PlacePair {
  /** Место на плане корпуса, пиксели плана. */
  from: Point;
  /** То же место на территории, пиксели территории. */
  to: Point;
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
  /** Метров в пикселе того, что под планом: территории или этажа входа. */
  baseMpp: number;
  planSize: MapSize;
  /** Пиксель плана → пиксель территории. */
  frame: Similarity;
  /** Щелчки ставят пары. */
  pairMode: boolean;
  pairs: PlacePair[];
  /** Место на плане выбрано, ждём то же место на территории. */
  pendingFrom: Point | null;
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
  setPairMode: (on: boolean) => void;
  /** Щелчок по карте территории в режиме пар. */
  placingClick: (x: number, y: number) => void;
  placingRemovePair: (index: number) => void;
  applyPlacing: () => void;
  cancelPlacing: () => void;

  startMeasuring: () => void;
  measureClick: (x: number, y: number) => void;
  /** @returns текст проблемы или `null` */
  applyMeasuring: (meters: number) => string | null;
  cancelMeasuring: () => void;
}

/** Постановка по парам: с двух пар — подобие по ним. */
export function placingFit(pairs: readonly PlacePair[]) {
  return fitSimilarity(pairs.map((pair) => ({ from: pair.from, to: pair.to })));
}

export const createPlaceSlice: EditorSlice<PlaceSlice> = (set, get) => ({
  placing: null,
  measuring: null,

  startPlacing: (building, view) => {
    const st = get();
    const meta = st.buildingMetas.get(building);
    if (!meta) return 'Корпуса нет';
    const campusMpp = st.campusMeta?.metersPerPixel;
    if (campusMpp === undefined) return 'Сначала задайте масштаб территории: два места и расстояние между ними';
    const floor = openingFloorOf(meta);
    if (floor === null) return 'У корпуса нет этажей — ставить нечего';
    const floorMeta = meta.floors.find((item) => item.floor === floor)!;
    const planSize = floorMeta.mapSize ?? { width: 1000, height: 700 };
    const resolved = resolvePlanPlacement(meta, floorMeta);
    const frame = resolved ? frameOf(resolved, campusMpp) : initialFrame(planSize, view);

    set((s) => {
      s.measuring = null;
      s.alignment = null;
      s.currentBuilding = null;
      s.currentFloor = null;
      s.selectedNodeIds = new Set();
      s.activeTool = 'select';
      s.placing = { mode: 'building', building, floor, baseMpp: campusMpp, planSize, frame, pairMode: false, pairs: [], pendingFrom: null };
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
    // Пиксель этажа → метры → пиксель этажа входа.
    const frame = composeSimilarity(invertSimilarity(worldOf(base)), worldOf(own));

    set((s) => {
      s.measuring = null;
      s.alignment = null;
      s.currentBuilding = building;
      s.currentFloor = entrance;
      s.selectedNodeIds = new Set();
      s.activeTool = 'select';
      s.placing = {
        mode: 'floor',
        building,
        floor,
        baseMpp: base.metersPerPixel,
        planSize: floorMeta!.mapSize ?? { width: 1000, height: 700 },
        frame,
        pairMode: false,
        pairs: [],
        pendingFrom: null,
      };
    });
    return null;
  },

  setPlacingFrame: (frame) =>
    set((s) => {
      if (s.placing) s.placing.frame = frame;
    }),

  setPairMode: (on) =>
    set((s) => {
      if (!s.placing) return;
      s.placing.pairMode = on;
      s.placing.pendingFrom = null;
    }),

  placingClick: (x, y) => {
    const placing = get().placing;
    if (!placing?.pairMode) return;
    set((s) => {
      const target = s.placing!;
      if (target.pendingFrom === null) {
        // Первый щелчок — место на плане корпуса: оно под курсором сейчас.
        target.pendingFrom = applySimilarity(invertSimilarity(target.frame), { x, y });
        return;
      }
      target.pairs = [...target.pairs, { from: target.pendingFrom, to: { x, y } }];
      target.pendingFrom = null;
      const fit = placingFit(target.pairs);
      if (fit) target.frame = fit.transform;
    });
  },

  placingRemovePair: (index) =>
    set((s) => {
      if (!s.placing) return;
      s.placing.pairs = s.placing.pairs.filter((_, i) => i !== index);
      const fit = placingFit(s.placing.pairs);
      if (fit) s.placing.frame = fit.transform;
    }),

  applyPlacing: () => {
    const { placing, campusMeta, buildingMetas } = get();
    if (!placing) return;
    if (placing.mode === 'building') {
      if (campusMeta?.metersPerPixel === undefined) return;
      get().placeBuilding(placing.building, placementOf(placing.frame, campusMeta.metersPerPixel));
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
      s.currentBuilding = null;
      s.currentFloor = null;
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
