import { useMemo } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useQuiet } from './useQuiet';
import { structureChecks } from '../utils/structureChecks';
import type { StructureAction, StructureIssue } from '../utils/structureChecks';
import { usePlaceBuilding } from './usePlaceBuilding';

/** Находки проверки структуры — вслед за правками, с паузой, как проверка данных. */
export function useStructureChecks(): StructureIssue[] {
  const nodes = useQuiet(useEditorStore((s) => s.nodes), 500);
  const campusMeta = useEditorStore((s) => s.campusMeta);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const planFiles = useEditorStore((s) => s.planFiles);
  return useMemo(() => structureChecks({ campusMeta, buildingMetas, planFiles, nodes }), [campusMeta, buildingMetas, planFiles, nodes]);
}

/** Выполняет действие находки: открывает нужный план, окно или режим. */
export function useStructureAction(): (action: StructureAction) => void {
  const place = usePlaceBuilding();
  return (action) => {
    const st = useEditorStore.getState();
    switch (action.kind) {
      case 'measure':
        st.startMeasuring();
        break;
      case 'place':
        place(action.building);
        break;
      case 'open':
        st.openPlan({ building: action.building, floor: action.floor });
        st.setWorkspace('plans');
        break;
      case 'plan':
        st.openImport([], action.building === null ? { campus: true } : { building: action.building, floor: action.floor ?? undefined });
        break;
      case 'align':
        st.startAlignment([{ building: action.building, floor: action.floor }]);
        break;
    }
  };
}
