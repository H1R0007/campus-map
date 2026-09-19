import React from 'react';
import { CircleMarker, Polyline } from 'react-leaflet';
import { useEditorStore } from '../../stores/editorStore';
import { alignToPlan } from '../../stores/editor/editSlice';
import { useCursorStore } from '../../stores/cursorStore';
import { mapPalette } from '../../utils/themeColor';

/**
 * Что получится по щелчку: призрак будущей точки и линии выравнивания.
 *
 * Разметчик видит до нажатия, что точка встанет в один ряд с соседней, —
 * иначе выравнивание выглядит как «редактор сам сдвинул мою точку».
 */
export const SnapPreview: React.FC = () => {
  const activeTool = useEditorStore((s) => s.activeTool);
  const align = useEditorStore((s) => s.gridSettings.alignToNeighbours);
  const cursor = useCursorStore((s) => s.point);
  // Данные плана нужны целиком: подсказка обязана совпадать с тем, что
  // произойдёт по щелчку.
  const state = useEditorStore((s) => s);
  const palette = mapPalette();

  if (activeTool !== 'node' || !align || !cursor) return null;

  const snapped = alignToPlan(state, cursor.x, cursor.y);
  if (!snapped.alignedX && !snapped.alignedY) return null;

  const guide = { color: palette.draft, weight: 1, opacity: 0.9, dashArray: '4 6' };

  return (
    <>
      {snapped.alignedX && (
        <Polyline
          interactive={false}
          pathOptions={guide}
          positions={[
            [snapped.alignedX.y, snapped.alignedX.x],
            [snapped.y, snapped.x],
          ]}
        />
      )}
      {snapped.alignedY && (
        <Polyline
          interactive={false}
          pathOptions={guide}
          positions={[
            [snapped.alignedY.y, snapped.alignedY.x],
            [snapped.y, snapped.x],
          ]}
        />
      )}
      <CircleMarker
        center={[snapped.y, snapped.x]}
        radius={7}
        interactive={false}
        pathOptions={{ color: palette.draft, fillColor: palette.draft, fillOpacity: 0.35, weight: 2 }}
      />
    </>
  );
};
