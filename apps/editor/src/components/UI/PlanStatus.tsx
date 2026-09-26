import React from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { planScopeKey } from '../../utils/planFiles';
import { AddFloorForm } from './StructureCards';

/**
 * Что сказать поверх карты, когда плана нет (запись 47).
 *
 * - У корпуса без этажей карта недоступна: ставить точки некуда. Вместо неё —
 *   предложение добавить первый этаж.
 * - У этажа без файла плана — подсказка сверху: точки ставятся на пустое
 *   поле, план можно добавить потом.
 */
export const PlanStatus: React.FC = () => {
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);
  const building = useEditorStore((s) => (currentBuilding === null ? undefined : s.buildingMetas.get(currentBuilding)));
  const hasPlan = useEditorStore((s) =>
    s.planFiles.has(planScopeKey(currentFloor === null ? null : currentBuilding, currentFloor))
  );

  if (building && currentFloor === null) {
    return (
      <div className="editor-plan-status editor-plan-status--blocking" role="region" aria-label="Корпус без этажей">
        <div className="editor-plan-status__box">
          <h2 className="editor-dialog__title">{building.name}: этажей пока нет</h2>
          <p className="editor-section__hint">Добавьте первый этаж — тогда на нём можно будет ставить точки.</p>
          <AddFloorForm building={building} />
        </div>
      </div>
    );
  }

  if (hasPlan) return null;

  return (
    <div className="editor-plan-status" role="status">
      {currentBuilding === null ? 'У территории нет плана' : 'У этажа нет плана'} — точки ставятся на пустое поле.
    </div>
  );
};
