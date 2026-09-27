import React, { useState } from 'react';
import { floorLabel } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { planScopeKey } from '../../utils/planFiles';
import { Icon } from './Icon';
import { AddFloorForm } from './StructureCards';

/**
 * Что сказать поверх карты, когда плана нет (записи 47, 52).
 *
 * - У корпуса без этажей карта недоступна: ставить точки некуда. Вместо неё —
 *   добавить этажи из файлов или пустой этаж.
 * - У этажа или территории без плана — посередине карты: выбрать файл плана
 *   или бросить его сюда. Размечать без плана тоже можно — тогда видно
 *   пустое поле, на которое встают точки.
 */
export const PlanStatus: React.FC = () => {
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);
  const building = useEditorStore((s) => (currentBuilding === null ? undefined : s.buildingMetas.get(currentBuilding)));
  const openImport = useEditorStore((s) => s.openImport);
  const planBuilding = currentFloor === null ? null : currentBuilding;
  const scope = planScopeKey(planBuilding, currentFloor);
  const hasPlan = useEditorStore((s) => s.planFiles.has(scope));
  /** Планы, которые человек решил размечать без файла, — до перезагрузки страницы. */
  const [withoutPlan, setWithoutPlan] = useState<ReadonlySet<string>>(new Set());

  if (building && currentFloor === null) {
    return (
      <div className="editor-plan-status editor-plan-status--blocking" role="region" aria-label="Корпус без этажей">
        <div className="editor-plan-status__box">
          <h2 className="editor-dialog__title">{building.name}: этажей пока нет</h2>
          <p className="editor-section__hint">
            Добавьте этажи из файлов планов — перетащите их сюда или выберите кнопкой. Корпус и этаж редактор угадает по
            имени файла и тексту на листе. Или добавьте пустой этаж и поставьте план потом.
          </p>
          <button
            type="button"
            className="editor-button editor-button--primary editor-button--block"
            onClick={() => openImport([], { building: building.id })}
          >
            <Icon name="upload" />
            Этажи из файлов…
          </button>
          <AddFloorForm building={building} />
        </div>
      </div>
    );
  }

  if (hasPlan) return null;

  if (withoutPlan.has(scope)) {
    return (
      <div className="editor-plan-status" role="status">
        {planBuilding === null ? 'У территории нет плана' : 'У этажа нет плана'} — точки ставятся на пустое поле.
      </div>
    );
  }

  const title =
    planBuilding === null ? 'У территории пока нет плана' : `У этажа ${floorLabel(building, currentFloor ?? 0)} корпуса «${building?.name}» пока нет плана`;

  return (
    <div className="editor-plan-status editor-plan-status--blocking" role="region" aria-label="План не добавлен">
      <div className="editor-plan-status__box editor-plan-status__box--drop">
        <Icon name="upload" size={32} />
        <h2 className="editor-dialog__title">{title}</h2>
        <p className="editor-section__hint">
          Перетащите файл плана прямо сюда — PDF, скан или картинку, чертёж DXF — или выберите его кнопкой. Поля листа
          обрежутся сами, а если в файле несколько листов, выберете нужный.
        </p>
        <button
          type="button"
          className="editor-button editor-button--primary editor-button--block"
          onClick={() =>
            openImport([], planBuilding === null ? { campus: true } : { building: planBuilding, floor: currentFloor ?? undefined })
          }
        >
          <Icon name="upload" />
          Выбрать файл плана…
        </button>
        <button
          type="button"
          className="editor-button editor-button--ghost editor-button--block"
          onClick={() => setWithoutPlan((previous) => new Set(previous).add(scope))}
        >
          Размечать без плана
        </button>
      </div>
    </div>
  );
};
