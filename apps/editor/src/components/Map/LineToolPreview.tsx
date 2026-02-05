import React, { useMemo } from 'react';
import { CircleMarker, Polyline } from 'react-leaflet';
import { useEditorStore } from '../../stores/editorStore';

export const LineToolPreview: React.FC = () => {
  const activeTool = useEditorStore((s) => s.activeTool);
  const lt = useEditorStore((s) => s.lineTool);

  const points = useMemo(() => {
    if (!lt.start || !lt.end) return [];
    
    const count = lt.count;
    if (typeof count !== 'number' || !Number.isFinite(count) || count < 2) {
      return [];
    }
    
    const n = Math.max(2, Math.min(50, Math.floor(count)));
    const divisor = n - 1;
    
    if (divisor <= 0) return [];
    
    const dx = (lt.end.x - lt.start.x) / divisor;
    const dy = (lt.end.y - lt.start.y) / divisor;
    
    const arr: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const x = lt.start.x + dx * i;
      const y = lt.start.y + dy * i;
      // Проверка на валидность координат
      if (Number.isFinite(x) && Number.isFinite(y)) {
        arr.push([y, x]); // Leaflet: [lat, lng] = [y, x]
      }
    }
    return arr;
  }, [lt.start, lt.end, lt.count]);

  // Не показываем превью если не выбран LineTool
  if (activeTool !== 'line') return null;
  
  // Нет начальной точки - ничего не показываем
  if (!lt.start) return null;

  // Проверка валидности начальной точки
  if (!Number.isFinite(lt.start.x) || !Number.isFinite(lt.start.y)) {
    return null;
  }

  // Только начальная точка (ещё нет конечной)
  if (!lt.end) {
    return (
      <CircleMarker
        center={[lt.start.y, lt.start.x]}
        radius={8}
        pathOptions={{ 
          color: '#60a5fa', 
          fillColor: '#60a5fa', 
          fillOpacity: 0.9, 
          weight: 2 
        }}
      />
    );
  }

  // Проверка валидности конечной точки
  if (!Number.isFinite(lt.end.x) || !Number.isFinite(lt.end.y)) {
    return (
      <CircleMarker
        center={[lt.start.y, lt.start.x]}
        radius={8}
        pathOptions={{ 
          color: '#60a5fa', 
          fillColor: '#60a5fa', 
          fillOpacity: 0.9, 
          weight: 2 
        }}
      />
    );
  }

  return (
    <>
      {/* Линия между start и end */}
      <Polyline
        positions={[
          [lt.start.y, lt.start.x],
          [lt.end.y, lt.end.x],
        ]}
        pathOptions={{ 
          color: '#60a5fa', 
          weight: 3, 
          opacity: 0.9, 
          dashArray: '6 6' 
        }}
      />

      {/* Превью точек */}
      {points.map((p, i) => (
        <CircleMarker
          key={i}
          center={p}
          radius={5}
          pathOptions={{ 
            color: '#93c5fd', 
            fillColor: '#93c5fd', 
            fillOpacity: 0.9, 
            weight: 1 
          }}
        />
      ))}
    </>
  );
};