import React, { useMemo } from 'react';
import { CAMPUS_BUILDING_ID } from '@campus-map/core';
import { PixelMap } from '@campus-map/mapkit';
import { usePrefetchRoutePlans } from '../../hooks/usePrefetchRoutePlans';
import { scopeOf, useMapStore } from '../../stores/mapStore';
import { scopePlanUrl } from '../../utils/planUrls';
import { DATA_BASE_URL } from '../../config/dataBase';
import { useMapInsets } from './mapChrome';
import { MapRail } from './MapRail';
import { PathLayer } from './PathLayer';
import { PlaceLayer } from './PlaceLayer';
import { PortalLayer } from './PortalLayer';
import { MarkerLayer } from './MarkerLayer';
import { PlanStatus } from './PlanStatus';
import { MapGestureWatch } from './MapGestureWatch';
import { WorldCanvas } from './WorldCanvas';

/**
 * Карта навигатора. Данные с привязкой к метрике — холст кампуса (`WorldCanvas`,
 * запись 32): территория и этажи корпусов на одной карте. Без привязки —
 * территория кампуса или план выбранного этажа.
 *
 * Вся обвязка Leaflet (определение размера плана, границы, подгонка вида,
 * смена плана на живой карте) живёт в `PixelMap` из общего пакета — раньше
 * она была скопирована сюда из редактора.
 */
export const CampusMap: React.FC = () => {
  const graph = useMapStore((s) => s.graph);
  const campusMeta = useMapStore((s) => s.campusMeta);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const activeFloor = useMapStore((s) => s.activeFloor);
  const insets = useMapInsets();

  // Планы построенного маршрута — заранее, пока есть связь (запись 26).
  usePrefetchRoutePlans();

  const mapUrl = useMemo(
    () => scopePlanUrl(scopeOf(activeFloor), campusMeta, buildingMetas, DATA_BASE_URL),
    [activeFloor, campusMeta, buildingMetas]
  );

  // Размер плана из метаданных — границы до загрузки изображения. Без него
  // вид подгоняется только после загрузки картинки.
  const fallbackSize =
    activeFloor === null
      ? campusMeta?.mapSize
      : buildingMetas
          ?.get(activeFloor.buildingId)
          ?.floors.find((meta) => meta.floor === activeFloor.floor)?.mapSize;

  // Слои одни на обе карты: что видно, они узнают из `useMapView`.
  const layers = (
    <>
      <PlaceLayer />
      <PathLayer />
      <PortalLayer />
      <MarkerLayer />
      <PlanStatus />
      <MapRail />
      <MapGestureWatch />
    </>
  );

  // До загрузки данных неизвестно, какая карта нужна, и показывать на ней нечего.
  if (graph === null) return null;
  if (graph.isMetric) return <WorldCanvas>{layers}</WorldCanvas>;

  return (
    <PixelMap
      url={mapUrl}
      fallbackSize={fallbackSize}
      // Вид подгоняется при входе в корпус и возврате на территорию, а этажи
      // одного корпуса листаются на месте: на соседнем этаже человек ищет то
      // же место здания, а не весь план заново.
      fitKey={activeFloor?.buildingId ?? CAMPUS_BUILDING_ID}
      fitInsets={insets}
      maxZoom={4}
      constrainToBounds
    >
      {layers}
    </PixelMap>
  );
};
