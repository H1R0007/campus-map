import React from 'react';
import { Rectangle } from 'react-leaflet';
import { useEditorStore } from '../../stores/editorStore';
import { mapPalette } from '../../utils/themeColor';

export const SelectionBox: React.FC = () => {
  const palette = mapPalette();
  const selectionBox = useEditorStore((s) => s.selectionBox);

  if (!selectionBox) return null;

  const { startX, startY, endX, endY } = selectionBox;

  const bounds: [[number, number], [number, number]] = [
    [Math.min(startY, endY), Math.min(startX, endX)],
    [Math.max(startY, endY), Math.max(startX, endX)],
  ];

  return (
    <Rectangle
      bounds={bounds}
      pathOptions={{
        color: palette.draft,
        weight: 2,
        fillColor: palette.draft,
        fillOpacity: 0.15,
        dashArray: '5, 5',
      }}
    />
  );
};
