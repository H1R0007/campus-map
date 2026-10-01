import { CAMPUS_BUILDING_ID } from '@campus-map/core';
import type { MapNode } from '@campus-map/core';
import { fitSimilarity } from '../../import/planGeometry';
import type { SimilarityFit } from '../../import/planGeometry';
import type { PlanRef } from './structureSlice';
import { showExistingPlan } from './historyApply';
import { floorRef } from '../../utils/labels';
import type { EditorSlice } from './types';

/**
 * Совмещение точек с новым планом (запись 49).
 *
 * План этажа заменили, а точки остались в прежних координатах: у нового
 * плана другой масштаб и сдвиг. Человек называет пары — «эта точка должна
 * стоять вот здесь», — и все точки плана переезжают одним подобием: сдвиг,
 * поворот, масштаб. Двух пар хватает; третья и дальше уточняют и показывают
 * расхождение — где ошибся человек или исказился скан.
 */

export interface AlignPair {
  nodeId: string;
  /** Куда точка должна встать, пиксели нового плана. */
  to: { x: number; y: number };
}

export interface Alignment {
  plan: PlanRef;
  pairs: AlignPair[];
  /** Точка, для которой ждём место на плане. */
  pending: string | null;
  /** Какие планы ждут совмещения после этого. */
  queue: PlanRef[];
}

export interface AlignSlice {
  alignment: Alignment | null;
  /** Начать совмещение: первый план открывается, остальные — следом. */
  startAlignment: (plans: PlanRef[]) => void;
  /** Щелчок по точке: её сейчас переносим. */
  alignPickNode: (nodeId: string) => void;
  /** Щелчок по плану: сюда встаёт выбранная точка. */
  alignPlace: (x: number, y: number) => void;
  alignRemovePair: (index: number) => void;
  /** Передумал: выбрать другую точку. */
  alignClearPending: () => void;
  /** Двигает все точки плана по парам; следующий план из очереди — следом. */
  applyAlignment: () => void;
  /** Бросить этот план как есть и перейти к следующему. */
  skipAlignment: () => void;
  cancelAlignment: () => void;
}

/** Подобие по парам: откуда точка — её место сейчас, куда — место на плане. */
export function alignmentFit(pairs: readonly AlignPair[], nodes: ReadonlyMap<string, MapNode>): SimilarityFit | null {
  const usable = pairs.flatMap((pair) => {
    const node = nodes.get(pair.nodeId);
    return node ? [{ from: { x: node.x, y: node.y }, to: pair.to }] : [];
  });
  return fitSimilarity(usable);
}

/** Точка на совмещаемом плане. */
function onPlan(node: MapNode | undefined, plan: PlanRef): boolean {
  if (!node) return false;
  return plan.building === null ? node.building === CAMPUS_BUILDING_ID : node.building === plan.building && node.floor === plan.floor;
}

export const createAlignSlice: EditorSlice<AlignSlice> = (set, get) => {
  /** Открывает план совмещения и ставит его первым. */
  const open = (plans: PlanRef[]) => {
    const [plan, ...queue] = plans;
    set((s) => {
      s.alignment = plan ? { plan, pairs: [], pending: null, queue } : null;
      if (plan) {
        showExistingPlan(s, plan.building, plan.floor);
        s.selectedNodeIds = new Set();
        s.activeTool = 'select';
      }
    });
  };

  return {
    alignment: null,

    startAlignment: (plans) => open(plans),

    alignPickNode: (nodeId) => {
      const { alignment, nodes } = get();
      if (!alignment || !onPlan(nodes.get(nodeId), alignment.plan)) return;
      set((s) => {
        s.alignment!.pending = nodeId;
        s.selectedNodeIds = new Set([nodeId]);
      });
    },

    alignPlace: (x, y) => {
      const { alignment } = get();
      if (!alignment?.pending) return;
      const nodeId = alignment.pending;
      set((s) => {
        const target = s.alignment!;
        // Та же точка второй раз — новое место вместо прежнего.
        target.pairs = [...target.pairs.filter((pair) => pair.nodeId !== nodeId), { nodeId, to: { x, y } }];
        target.pending = null;
        s.selectedNodeIds = new Set();
      });
    },

    alignClearPending: () =>
      set((s) => {
        if (s.alignment) s.alignment.pending = null;
        s.selectedNodeIds = new Set();
      }),

    alignRemovePair: (index) =>
      set((s) => {
        if (s.alignment) s.alignment.pairs = s.alignment.pairs.filter((_, i) => i !== index);
      }),

    applyAlignment: () => {
      const { alignment, nodes, buildingMetas } = get();
      if (!alignment) return;
      const fit = alignmentFit(alignment.pairs, nodes);
      if (!fit) return;
      const { plan } = alignment;
      const where = plan.building === null ? 'Территория' : floorRef(buildingMetas.get(plan.building), plan.floor ?? 0, plan.building);
      get().moveNodesOfPlan(plan, fit.transform, `Точки совмещены с планом: ${where}`);
      open(alignment.queue);
    },

    skipAlignment: () => open(get().alignment?.queue ?? []),

    cancelAlignment: () =>
      set((s) => {
        s.alignment = null;
      }),
  };
};
