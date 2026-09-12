import React, { useMemo } from 'react';
import { campusMapUrl, floorMapUrl } from '@campus-map/core';
import { PixelMap } from '@campus-map/mapkit';
import { useMapStore } from '../../stores/mapStore';
import { PathLayer } from './PathLayer';
import { PortalLayer } from './PortalLayer';
import { MarkerLayer } from './MarkerLayer';
import { ZoomControls } from '../UI/ZoomControls';

/**
 * Карта навигатора: территория кампуса или план выбранного этажа.
 *
 * Вся обвязка Leaflet (определение размера плана, границы, центрирование,
 * пересоздание карты при смене этажа) живёт в `PixelMap` из общего пакета —
 * раньше она была скопирована сюда из редактора.
 */
export const CampusMap: React.FC = () => {
  const campusMeta = useMapStore((s) => s.campusMeta);
  const activeFloor = useMapStore((s) => s.activeFloor);

  const mapUrl = useMemo(
    () =>
      activeFloor === null
        ? campusMapUrl()
        : floorMapUrl(activeFloor.buildingId, activeFloor.floor),
    [activeFloor]
  );

  // Резервный размер из метаданных имеет смысл только для карты кампуса:
  // `mapSize` описывает именно её, а планы этажей имеют другие габариты.
  const fallbackSize = activeFloor === null ? campusMeta?.mapSize : undefined;

  return (
    <PixelMap url={mapUrl} fallbackSize={fallbackSize} maxZoom={4} constrainToBounds>
      <PathLayer />
      <PortalLayer />
      <MarkerLayer />
      <ZoomControls />
    </PixelMap>
  );
};
