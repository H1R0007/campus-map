import React, { useMemo } from 'react';
import { CAMPUS_BUILDING_ID, campusMapUrl, floorMapUrl } from '@campus-map/core';
import { PixelMap } from '@campus-map/mapkit';
import { useMapStore } from '../../stores/mapStore';
import { DATA_BASE_URL } from '../../config/dataBase';
import { MAP_CHROME_INSETS } from './mapChrome';
import { MapRail } from './MapRail';
import { PathLayer } from './PathLayer';
import { PlaceLayer } from './PlaceLayer';
import { PortalLayer } from './PortalLayer';
import { MarkerLayer } from './MarkerLayer';
import { PlanStatus } from './PlanStatus';

/**
 * Карта навигатора: территория кампуса или план выбранного этажа.
 *
 * Вся обвязка Leaflet (определение размера плана, границы, подгонка вида,
 * смена плана на живой карте) живёт в `PixelMap` из общего пакета — раньше
 * она была скопирована сюда из редактора.
 */
export const CampusMap: React.FC = () => {
  const campusMeta = useMapStore((s) => s.campusMeta);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const activeFloor = useMapStore((s) => s.activeFloor);

  const mapUrl = useMemo(
    () =>
      activeFloor === null
        ? campusMapUrl(DATA_BASE_URL)
        : floorMapUrl(activeFloor.buildingId, activeFloor.floor, DATA_BASE_URL),
    [activeFloor]
  );

  // Размер плана из метаданных — границы до загрузки изображения. Без него
  // вид подгоняется только после загрузки картинки.
  const fallbackSize =
    activeFloor === null
      ? campusMeta?.mapSize
      : buildingMetas
          ?.get(activeFloor.buildingId)
          ?.floors.find((meta) => meta.floor === activeFloor.floor)?.mapSize;

  return (
    <PixelMap
      url={mapUrl}
      fallbackSize={fallbackSize}
      // Вид подгоняется при входе в корпус и возврате на территорию, а этажи
      // одного корпуса листаются на месте: на соседнем этаже человек ищет то
      // же место здания, а не весь план заново.
      fitKey={activeFloor?.buildingId ?? CAMPUS_BUILDING_ID}
      fitInsets={MAP_CHROME_INSETS}
      maxZoom={4}
      constrainToBounds
    >
      <PlaceLayer />
      <PathLayer />
      <PortalLayer />
      <MarkerLayer />
      <PlanStatus />
      <MapRail />
    </PixelMap>
  );
};
