import React, { useEffect, useState } from 'react';
import { Polyline, useMap } from 'react-leaflet';
import { useEditorStore } from '../../stores/editorStore';

export const GridOverlay: React.FC = () => {
  const map = useMap();
  const grid = useEditorStore((s) => s.gridSettings);

  const [lines, setLines] = useState<{ v: [number, number][][]; h: [number, number][][] }>({ v: [], h: [] });

  useEffect(() => {
    if (!grid.enabled || !grid.visible) {
      setLines({ v: [], h: [] });
      return;
    }

    const update = () => {
      const bounds = map.getBounds();
      const size = Math.max(2, Math.floor(grid.size));

      const west = Math.floor(bounds.getWest() / size) * size;
      const east = Math.ceil(bounds.getEast() / size) * size;
      const south = Math.floor(bounds.getSouth() / size) * size;
      const north = Math.ceil(bounds.getNorth() / size) * size;

      const v: [number, number][][] = [];
      const h: [number, number][][] = [];

      for (let x = west; x <= east; x += size) {
        v.push([
          [south, x],
          [north, x],
        ]);
      }

      for (let y = south; y <= north; y += size) {
        h.push([
          [y, west],
          [y, east],
        ]);
      }

      setLines({ v, h });
    };

    update();
    map.on('move', update);
    map.on('zoom', update);

    return () => {
      map.off('move', update);
      map.off('zoom', update);
    };
  }, [map, grid.enabled, grid.visible, grid.size]);

  if (!grid.enabled || !grid.visible) return null;

  return (
    <>
      {lines.v.map((positions, i) => (
        <Polyline
          key={`grid-v-${i}`}
          positions={positions}
          pathOptions={{ color: 'rgba(255,255,255,0.12)', weight: 1, opacity: 1 }}
          interactive={false}
        />
      ))}
      {lines.h.map((positions, i) => (
        <Polyline
          key={`grid-h-${i}`}
          positions={positions}
          pathOptions={{ color: 'rgba(255,255,255,0.12)', weight: 1, opacity: 1 }}
          interactive={false}
        />
      ))}
    </>
  );
};