import { useMemo } from 'react';
import type { MapNode } from '@campus-map/core';
import { useEditorStore, useUnsavedChanges } from '../stores/editorStore';
import { useQuiet } from './useQuiet';
import { useValidationReport } from './useValidationReport';
import { useFloorMatches } from './useFloorMatches';
import { useStructureAction } from './useStructureChecks';
import { readiness } from '../utils/readiness';
import type { Readiness, ReadinessAction, ReadinessInput } from '../utils/readiness';

/** Сколько ждать тишины в правках, прежде чем пересчитать список, мс. */
const QUIET_MS = 500;

let cached: { input: ReadinessInput; result: Readiness } | null = null;

/** Для тех же данных список считается один раз, сколько бы мест его ни показывали. */
function readinessOnce(input: ReadinessInput): Readiness {
  const same =
    cached !== null &&
    (Object.keys(input) as (keyof ReadinessInput)[]).every((field) => Object.is(cached!.input[field], input[field]));
  if (!same) cached = { input, result: readiness(input) };
  return cached!.result;
}

/** «Готовность карты» (запись 67) — вслед за правками, с паузой, как проверка данных. */
export function useReadiness(): Readiness {
  const nodes = useQuiet(useEditorStore((s) => s.nodes), QUIET_MS);
  const transitions = useQuiet(useEditorStore((s) => s.transitions), QUIET_MS);
  const aliases = useQuiet(useEditorStore((s) => s.aliases), QUIET_MS);
  const campusMeta = useEditorStore((s) => s.campusMeta);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const planFiles = useEditorStore((s) => s.planFiles);
  const checkedRoutes = useEditorStore((s) => s.checkedRoutes);
  const errors = useValidationReport().errors.length;
  const unsaved = useUnsavedChanges();
  const floorMatches = useFloorMatches();

  return useMemo(
    () =>
      readinessOnce({
        campusMeta,
        buildingMetas,
        planFiles,
        nodes,
        transitions,
        aliases,
        errors,
        unsaved,
        checkedRoutes,
        floorMatches,
      }),
    [campusMeta, buildingMetas, planFiles, nodes, transitions, aliases, errors, unsaved, checkedRoutes, floorMatches]
  );
}

/** Выполняет кнопку строки: открывает план, окно, инструмент или вкладку. */
export function useReadinessAction(): (action: ReadinessAction) => void {
  const structure = useStructureAction();
  return (action) => {
    const st = useEditorStore.getState();
    switch (action.kind) {
      case 'measure':
      case 'place':
      case 'open':
      case 'plan':
      case 'align':
        structure(action);
        return;

      case 'import':
        st.openImport();
        return;

      case 'placeFloor': {
        const problem = st.startPlacingFloor(action.building, action.floor);
        if (problem) st.showNotice(problem, 'warn');
        return;
      }

      case 'show': {
        // В «Планах и корпусах» точки бледные — показываем их в «Проверке».
        if (st.workspace === 'plans') st.openCheck('ready');
        st.openPlan({ building: action.building, floor: action.floor });
        const found = action.nodeIds
          .map((id) => useEditorStore.getState().nodes.get(id))
          .filter((node): node is MapNode => node !== undefined);
        if (found.length === 0) return;
        const now = useEditorStore.getState();
        now.clearSelection();
        now.addToSelection(found.map((node) => node.id));
        now.setCameraCenter(
          found.reduce((sum, node) => sum + node.x, 0) / found.length,
          found.reduce((sum, node) => sum + node.y, 0) / found.length
        );
        return;
      }

      case 'entrance': {
        const meta = st.buildingMetas.get(action.building);
        if (!meta) return;
        st.openPlan({ building: action.building, floor: null });
        st.setActiveTool('transition');
        st.setTransitionType('entrance');
        st.openPlan({ building: null, floor: null }, 'side', { focus: false });
        st.showNotice(`Вход в «${meta.name}»: щёлкните точку у двери на этаже, затем точку у той же двери на территории справа.`);
        return;
      }

      case 'stairs': {
        const meta = st.buildingMetas.get(action.building);
        if (!meta) return;
        // Рядом — соседний этаж в сторону этажа входа: он уже на связи с входом.
        const floors = meta.floors.map((item) => item.floor).sort((a, b) => a - b);
        const entrance = floors.includes(meta.entranceFloor ?? NaN) ? meta.entranceFloor! : floors[0];
        const index = floors.indexOf(action.floor);
        const toward = floors[index + (action.floor > entrance ? -1 : 1)] ?? floors[index - 1] ?? floors[index + 1];
        st.openPlan({ building: action.building, floor: action.floor });
        st.setActiveTool('transition');
        st.setTransitionType('stairs');
        if (toward !== undefined) st.openPlan({ building: action.building, floor: toward }, 'side', { focus: false });
        st.showNotice('Щёлкните лестницу на этом этаже, затем ту же лестницу на соседней карте. Щелчок по пустому месту ставит лестницу сразу на все этажи.');
        return;
      }

      case 'problems':
        st.openCheck('problems');
        return;

      case 'route':
        st.openCheck('route');
        return;

      case 'save':
        st.requestSave();
        return;
    }
  };
}
