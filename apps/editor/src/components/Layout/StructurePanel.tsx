import React, { useDeferredValue, useMemo } from 'react';
import { CAMPUS_BUILDING_ID } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { Icon } from '../UI/Icon';
import { DisplayOptions } from './DisplayOptions';

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
    <nav aria-label="Структура кампуса" className="editor-sidebar">
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
        <PlanTree />
        <DisplayOptions />
      </div>
    </nav>
  );
};

const PlanTree: React.FC = () => {
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const setCurrentBuilding = useEditorStore((s) => s.setCurrentBuilding);
  const setCurrentFloor = useEditorStore((s) => s.setCurrentFloor);
  // Счётчики догоняют перетаскивание, а не пересчитываются на каждом кадре.
  const nodes = useDeferredValue(useEditorStore((s) => s.nodes));

  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const node of nodes.values()) {
      const key = node.building === CAMPUS_BUILDING_ID ? CAMPUS_BUILDING_ID : planKey(node.building, node.floor);
      result.set(key, (result.get(key) ?? 0) + 1);
    }
    return result;
  }, [nodes]);

  const buildings = Array.from(buildingMetas.values());

  return (
    <ul className="editor-tree" aria-label="Планы">
      <li>
        <button
          type="button"
          className="editor-tree__item"
          aria-current={currentBuilding === null ? 'true' : undefined}
          onClick={() => setCurrentBuilding(null)}
        >
          <Icon name="map" />
          <span className="editor-tree__label">Территория кампуса</span>
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
              onClick={() => setCurrentBuilding(building.id)}
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
                      onClick={() => setCurrentFloor(floor.floor)}
                    >
                      <span className="editor-tree__label">Этаж {floor.floor}</span>
                      <NodeCount count={counts.get(planKey(building.id, floor.floor)) ?? 0} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
};

/** Число узлов плана; для экранного диктора — со словом «узлов». */
const NodeCount: React.FC<{ count: number }> = ({ count }) => (
  <span className="editor-tree__count">
    <span className="sr-only">узлов: </span>
    {count}
  </span>
);
