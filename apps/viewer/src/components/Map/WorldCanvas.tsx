import React from 'react';
import type { ReactNode } from 'react';
import { WorldMap } from '@campus-map/mapkit';
import { useCanvasLayout } from '../../hooks/useCanvasLayout';
import { CanvasCamera } from './CanvasCamera';
import { CanvasPlans } from './CanvasPlans';
import { useMapInsets } from './mapChrome';

/** Наибольший масштаб холста: 2^5 = 32 экранных пикселя на метр — дверь и подпись у неё. */
const CANVAS_MAX_ZOOM = 5;

/**
 * Холст кампуса (запись 32): территория и этажи корпусов на одной карте в
 * метрах. Слои навигатора — точки, маршрут, отметки — те же, что на карте
 * одного плана: что видно, они узнают из `useMapView`.
 */
export const WorldCanvas: React.FC<{ children: ReactNode }> = ({ children }) => {
  const layout = useCanvasLayout();
  const insets = useMapInsets();

  if (layout === null) return null;

  return (
    <WorldMap extent={layout.extent} fitInsets={insets} maxZoom={CANVAS_MAX_ZOOM} constrainToBounds rotatable>
      <CanvasPlans layout={layout} />
      {/* Камера — раньше слоя маршрута: его подгонка вида в том же обновлении главнее. */}
      <CanvasCamera layout={layout} />
      {children}
    </WorldMap>
  );
};
