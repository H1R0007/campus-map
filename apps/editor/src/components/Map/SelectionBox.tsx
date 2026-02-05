import React from 'react';
import { Rectangle } from 'react-leaflet';
import { useEditorStore } from '../../stores/editorStore';

export const SelectionBox: React.FC = () => {
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
        color: '#60a5fa',
        weight: 2,
        fillColor: '#60a5fa',
        fillOpacity: 0.15,
        dashArray: '5, 5',
      }}
    />
  );
};