import React from 'react';
import { floorLabel } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';

/**
 * Строка пути над картой (запись 60): «Корпус А › Этаж 2», оба звена —
 * списки. Корпус и этаж меняются здесь же, не уходя к дереву, — как
 * «хлебные крошки» в VS Code.
 */
export const MapHeader: React.FC = () => {
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const setCurrentBuilding = useEditorStore((s) => s.setCurrentBuilding);
  const setCurrentFloor = useEditorStore((s) => s.setCurrentFloor);

  const building = currentBuilding === null ? undefined : buildingMetas.get(currentBuilding);
  const floors = building ? [...building.floors].sort((a, b) => b.floor - a.floor) : [];

  return (
    <nav className="editor-mapbar" aria-label="Открытый план">
      <select
        className="editor-crumb"
        aria-label="Корпус"
        value={currentBuilding ?? ''}
        onChange={(event) => setCurrentBuilding(event.target.value === '' ? null : event.target.value)}
      >
        <option value="">Территория</option>
        {[...buildingMetas.values()].map((meta) => (
          <option key={meta.id} value={meta.id}>
            {meta.name}
          </option>
        ))}
      </select>
      {building && (
        <>
          <span className="editor-mapbar__sep" aria-hidden="true">
            ›
          </span>
          {floors.length > 0 ? (
            <select
              className="editor-crumb"
              aria-label="Этаж"
              value={currentFloor === null ? '' : String(currentFloor)}
              onChange={(event) => setCurrentFloor(Number(event.target.value))}
            >
              {floors.map((floor) => (
                <option key={floor.floor} value={String(floor.floor)}>
                  Этаж {floorLabel(building, floor.floor)}
                </option>
              ))}
            </select>
          ) : (
            <span className="editor-mapbar__empty">этажей нет</span>
          )}
        </>
      )}
    </nav>
  );
};
