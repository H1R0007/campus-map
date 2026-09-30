import { QUIET_COUNTS_MS, useQuiet } from '../../hooks/useQuiet';
import React, { useMemo } from 'react';
import { useEditorStore, useUnsavedChanges } from '../../stores/editorStore';
import { floorNodesOf } from '../../stores/editor/dataSlice';
import { useHistoryStore } from '../../stores/historyStore';
import { useCursorStore } from '../../stores/cursorStore';
import { nodePlaceLabel, nodesCount } from '../../utils/labels';
import { useToolHint } from '../../hooks/useToolHint';
import { useReadiness } from '../../hooks/useReadiness';

/**
 * Строка состояния: какой план открыт (теми же словами, что в свойствах и на
 * отметках карты: «Корпус А, этаж 1»), что выбрано, что делает инструмент и его
 * клавиши, где курсор и сохранено ли (запись 60). Над картой — только
 * инструмент и его параметры.
 */
export const StatusBar: React.FC = () => {
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const showPortals = useEditorStore((s) => s.displayFilters.showPortals);
  const nodes = useQuiet(useEditorStore((s) => s.nodes), QUIET_COUNTS_MS);
  const selectedCount = useEditorStore((s) => s.selectedNodeIds.size);
  const unsaved = useUnsavedChanges();
  const editCount = useHistoryStore((s) => s.currentIndex + 1);
  const point = useCursorStore((s) => s.point);
  const zoom = useCursorStore((s) => s.zoom);
  const hint = useToolHint();
  const ready = useReadiness();
  const openCheck = useEditorStore((s) => s.openCheck);

  const planNodes = useMemo(
    () => floorNodesOf(nodes, currentBuilding, currentFloor, showPortals).length,
    [nodes, currentBuilding, currentFloor, showPortals]
  );

  const buildingName = currentBuilding === null ? '' : (buildingMetas.get(currentBuilding)?.name ?? currentBuilding);
  const place =
    currentBuilding === null
      ? 'Территория'
      : currentFloor === null
        ? `${buildingName}, этажей нет`
        : nodePlaceLabel({ building: currentBuilding, floor: currentFloor }, buildingMetas);
  // У корпуса без этажей плана нет — и считать на нём нечего.
  const noPlan = currentBuilding !== null && currentFloor === null;

  return (
    <footer aria-label="Строка состояния" className="editor-statusbar">
      <span className="editor-statusbar__place" data-status-place>
        {place}
      </span>
      {!noPlan && <span>На плане: {nodesCount(planNodes)}</span>}
      {selectedCount > 0 && <span>Выбрано: {selectedCount}</span>}

      <span className="editor-statusbar__hint" data-status-hint title={hint ?? undefined}>
        {hint}
      </span>

      <span className="editor-statusbar__coords" title="Место под курсором, пиксели плана">
        {point ? `x ${point.x} · y ${point.y}` : 'курсор вне карты'}
      </span>
      {zoom !== null && (
        <span title="Масштаб: сколько пикселей экрана приходится на пиксель плана">
          Масштаб {Math.round(2 ** zoom * 100)}%
        </span>
      )}
      <button
        type="button"
        className="editor-statusbar__ready"
        title="Готовность карты: сколько проверок выполнено. Открыть список"
        onClick={() => openCheck('ready')}
      >
        Готовность {ready.done} из {ready.total}
      </button>
      <span title="Сколько правок можно отменить">Правок: {editCount}</span>
      <span className={`editor-statusbar__state${unsaved ? ' editor-statusbar__state--unsaved' : ''}`}>
        <span className="editor-statusbar__dot" aria-hidden="true" />
        {unsaved ? 'Изменено, не сохранено' : 'Сохранено'}
      </span>
    </footer>
  );
};
