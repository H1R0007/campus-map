import { useEditorStore } from '../stores/editorStore';
import { useCursorStore } from '../stores/cursorStore';

/**
 * Поставить корпус на территорию: на карту территории, с планом этажа входа
 * поверх. Без масштаба территории метров нет — сначала замер.
 */
export function usePlaceBuilding() {
  const startPlacing = useEditorStore((s) => s.startPlacing);
  const startMeasuring = useEditorStore((s) => s.startMeasuring);
  const showNotice = useEditorStore((s) => s.showNotice);
  return (building: string) => {
    const st = useEditorStore.getState();
    const cursorView = useCursorStore.getState().view;
    const size = st.campusMeta?.mapSize ?? { width: 1200, height: 800 };
    // Корпус впервые ложится туда, куда смотрят на территории; с плана
    // этажа — в середину территории.
    const view =
      st.currentFloor === null && cursorView
        ? cursorView
        : { center: { x: size.width / 2, y: size.height / 2 }, width: size.width };
    const problem = startPlacing(building, view);
    if (problem === null) return;
    showNotice(problem, 'warn');
    if (st.campusMeta?.metersPerPixel === undefined) startMeasuring();
  };
}

