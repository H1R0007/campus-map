import { useCallback, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import L from 'leaflet';
import { DEFAULT_INSETS, FILL_PARENT, MapFrameContext, PlanMapContainer, PlanViewport } from './mapFrame.js';
import type { MapFrame, MapInsets } from './mapFrame.js';
import type { MeterExtent, MeterPoint } from './placement.js';
import { PlanStatusContext, combinePlanStatuses } from './planStatus.js';
import type { PlanStatusReporter } from './planStatus.js';
import type { ImageStatus } from './useImageSize.js';

/** Точка территории как координата карты: `[y, x]`, как у всех карт mapkit. */
export function meterLatLng(point: MeterPoint): L.LatLngTuple {
  return [point.y, point.x];
}

export interface WorldMapProps {
  /** Территория с корпусами, метры: по ней подгоняется вид и ограничивается прокрутка. */
  extent: MeterExtent;
  /** Когда подгонять вид под всю территорию: при смене ключа. */
  fitKey?: string;
  /** Максимальный масштаб: `2^maxZoom` экранных пикселей на метр. */
  maxZoom?: number;
  zoomControl?: boolean;
  constrainToBounds?: boolean;
  /** Сколько места по краям занимает интерфейс поверх карты. */
  fitInsets?: MapInsets;
  /** Можно ли поворачивать карту пальцами, мышью и тачпадом (запись 36). */
  rotatable?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * Холст кампуса: единая карта в метрах территории (запись 31).
 *
 * В отличие от `PixelMap` своей подложки у холста нет: планы территории и
 * этажей ставят слои `PlacedPlan` по привязке, узлы и маршрут рисуются в
 * мировых координатах графа. Поэтому корпус открывается приближением, а не
 * сменой картинки, и маршрут идёт одной линией с территории в здание.
 *
 * Состояние карты (`useMapFrame().status`) — сводное по видимым планам.
 */
export function WorldMap({
  extent,
  fitKey = 'campus',
  maxZoom = 6,
  zoomControl = false,
  constrainToBounds = false,
  fitInsets = DEFAULT_INSETS,
  rotatable = false,
  className,
  style = FILL_PARENT,
  children,
}: WorldMapProps) {
  const { minX, minY, maxX, maxY } = extent;
  const bounds = useMemo(() => L.latLngBounds([minY, minX], [maxY, maxX]), [minX, minY, maxX, maxY]);

  const [statuses, setStatuses] = useState<ReadonlyMap<string, ImageStatus>>(() => new Map());
  const report = useCallback<PlanStatusReporter>((id, status) => {
    setStatuses((previous) => (previous.get(id) === status ? previous : new Map(previous).set(id, status)));
    return () =>
      setStatuses((previous) => {
        if (!previous.has(id)) return previous;
        const next = new Map(previous);
        next.delete(id);
        return next;
      });
  }, []);

  const status = combinePlanStatuses(statuses.values());
  const frame = useMemo<MapFrame>(() => ({ bounds, status }), [bounds, status]);

  return (
    <PlanMapContainer
      center={[(minY + maxY) / 2, (minX + maxX) / 2]}
      maxZoom={maxZoom}
      constrainToBounds={constrainToBounds}
      zoomControl={zoomControl}
      doubleClickZoom
      rotatable={rotatable}
      className={className}
      style={style}
    >
      <MapFrameContext.Provider value={frame}>
        <PlanStatusContext.Provider value={report}>
          <PlanViewport
            bounds={bounds}
            fitKey={fitKey}
            sizeKnown
            insets={fitInsets}
            constrainToBounds={constrainToBounds}
          />
          {children}
        </PlanStatusContext.Provider>
      </MapFrameContext.Provider>
    </PlanMapContainer>
  );
}
