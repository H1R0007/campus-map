import { QUIET_COUNTS_MS, useQuiet } from '../../hooks/useQuiet';
import React, { useMemo, useRef, useState } from 'react';
import { CAMPUS_BUILDING_ID, floorLabel } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import type { PlanRef } from '../../stores/editorStore';
import { Icon } from '../UI/Icon';
import { NewBuildingDialog, NewFloorDialog } from '../UI/AddDialogs';
import { ReadinessStrip } from '../UI/ReadinessView';
import { DisplayOptions } from './DisplayOptions';
import { ColumnResizer } from './ColumnResizer';

/** Ключ плана для подсчёта узлов: корпус и этаж. */
const planKey = (building: string, floor: number) => `${building}:${floor}`;

/**
 * Левая колонка: структура кампуса и что показывать на карте.
 *
 * У каждого плана — число узлов на нём: пустой этаж видно сразу, не
 * открывая его. Этажи раскрываются у открытого корпуса, сверху вниз, как в
 * здании.
 */
export const StructurePanel: React.FC = () => {
  const collapsed = useEditorStore((s) => s.structureCollapsed);
  const setCollapsed = useEditorStore((s) => s.setStructureCollapsed);
  const width = useEditorStore((s) => s.structureWidth);
  const workspace = useEditorStore((s) => s.workspace);
  const columnRef = useRef<HTMLElement>(null);

  if (collapsed) {
    return (
      <nav aria-label="Структура кампуса" className="editor-sidebar editor-sidebar--collapsed">
        <button
          type="button"
          className="editor-icon-button"
          onClick={() => setCollapsed(false)}
          aria-label="Развернуть структуру"
          aria-expanded={false}
          title="Развернуть структуру"
        >
          <Icon name="layers" size={20} />
        </button>
      </nav>
    );
  }

  return (
    <nav aria-label="Структура кампуса" className="editor-sidebar" ref={columnRef} style={width ? { width } : undefined}>
      <div className="editor-column-header">
        <span className="editor-column-header__title">Структура</span>
        <button
          type="button"
          className="editor-icon-button"
          onClick={() => setCollapsed(true)}
          aria-label="Свернуть структуру"
          aria-expanded
          title="Свернуть структуру — больше места карте"
        >
          <Icon name="chevronLeft" size={20} />
        </button>
      </div>
      <div className="editor-column-body">
        {workspace === 'plans' && <ImportButton />}
        <PlanTree />
        {workspace !== 'plans' && <DisplayOptions />}
        {/* Внизу дерева — сколько сделано и что дальше (запись 67). */}
        {workspace === 'plans' && <ReadinessStrip />}
      </div>
      <ColumnResizer column="structure" edge="right" label="Ширина структуры" columnRef={columnRef} />
    </nav>
  );
};

/** «Загрузить планы»: присланные PDF, сканы, чертежи — сразу в этажи и корпуса. */
const ImportButton: React.FC = () => {
  const openImport = useEditorStore((s) => s.openImport);
  return (
    <div className="editor-tree__form">
      <button
        type="button"
        className="editor-button editor-button--ghost editor-button--block"
        onClick={() => openImport()}
        title="PDF, сканы, картинки, чертежи DXF, архивы ZIP. Файлы можно просто перетащить на редактор"
      >
        <Icon name="upload" />
        Загрузить планы…
      </button>
    </div>
  );
};

const PlanTree: React.FC = () => {
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const openPlan = useEditorStore((s) => s.openPlan);
  const openContextMenu = useEditorStore((s) => s.openContextMenu);
  /**
   * Щелчок открывает план в текущей вкладке, как ссылка в браузере; новая
   * вкладка — только по просьбе: Ctrl+щелчок, средняя кнопка или меню правой
   * кнопки, где есть и «Открыть рядом» (запись 66).
   */
  const planButton = (plan: PlanRef) => ({
    onClick: (event: React.MouseEvent) => openPlan(plan, event.ctrlKey || event.metaKey ? 'tab' : 'here'),
    onMouseDown: (event: React.MouseEvent) => {
      if (event.button === 1) event.preventDefault();
    },
    onAuxClick: (event: React.MouseEvent) => {
      if (event.button === 1) openPlan(plan, 'tab');
    },
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      openContextMenu(event.clientX, event.clientY, { kind: 'plan', building: plan.building, floor: plan.floor });
    },
  });
  // Счётчики догоняют перетаскивание, а не пересчитываются на каждом кадре.
  const nodes = useQuiet(useEditorStore((s) => s.nodes), QUIET_COUNTS_MS);

  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const node of nodes.values()) {
      const key = node.building === CAMPUS_BUILDING_ID ? CAMPUS_BUILDING_ID : planKey(node.building, node.floor);
      result.set(key, (result.get(key) ?? 0) + 1);
    }
    return result;
  }, [nodes]);

  const buildings = Array.from(buildingMetas.values());
  const [addingFloor, setAddingFloor] = useState<string | null>(null);
  const addingFloorTo = addingFloor === null ? null : (buildingMetas.get(addingFloor) ?? null);

  return (
    <ul className="editor-tree" aria-label="Планы">
      <li>
        <button
          type="button"
          className="editor-tree__item"
          aria-current={currentBuilding === null ? 'true' : undefined}
          {...planButton({ building: null, floor: null })}
        >
          <Icon name="map" />
          <span className="editor-tree__label">Территория</span>
          <NodeCount count={counts.get(CAMPUS_BUILDING_ID) ?? 0} />
        </button>
      </li>

      {buildings.map((building) => {
        const open = currentBuilding === building.id;
        const floors = building.floors.slice().sort((a, b) => b.floor - a.floor);
        const total = floors.reduce((sum, f) => sum + (counts.get(planKey(building.id, f.floor)) ?? 0), 0);

        return (
          <li key={building.id}>
            <button
              type="button"
              className="editor-tree__item"
              aria-expanded={open}
              {...planButton({ building: building.id, floor: null })}
            >
              <Icon name={open ? 'chevronDown' : 'chevronRight'} />
              <span className="editor-tree__label">{building.name}</span>
              <NodeCount count={total} />
            </button>

            {open && (
              <ul className="editor-tree__floors" aria-label={`Этажи: ${building.name}`}>
                {floors.map((floor) => (
                  <li key={floor.floor}>
                    <button
                      type="button"
                      className="editor-tree__item"
                      aria-current={currentFloor === floor.floor ? 'true' : undefined}
                      {...planButton({ building: building.id, floor: floor.floor })}
                    >
                      <span className="editor-tree__label">Этаж {floorLabel(building, floor.floor)}</span>
                      <NodeCount count={counts.get(planKey(building.id, floor.floor)) ?? 0} />
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className="editor-tree__item editor-tree__item--add"
                    onClick={() => setAddingFloor(building.id)}
                    title={`Новый этаж корпуса «${building.name}»`}
                  >
                    <Icon name="plus" />
                    <span className="editor-tree__label">Этаж</span>
                  </button>
                </li>
              </ul>
            )}
          </li>
        );
      })}

      <li>
        <AddBuilding />
      </li>
      <NewFloorDialog building={addingFloorTo} onClose={() => setAddingFloor(null)} />
    </ul>
  );
};

/** «+ Корпус» — окно «Новый корпус» с подсказанной следующей буквой. */
const AddBuilding: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="editor-tree__item editor-tree__item--add" onClick={() => setOpen(true)} title="Новый корпус">
        <Icon name="plus" />
        <span className="editor-tree__label">Корпус</span>
      </button>
      <NewBuildingDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
};

/** Число точек плана; для экранного диктора — со словом «точек». */
const NodeCount: React.FC<{ count: number }> = ({ count }) => (
  <span className="editor-tree__count">
    <span className="sr-only">точек: </span>
    {count}
  </span>
);
