import React, { useMemo, useRef } from 'react';
import { CircleMarker, Marker, Polygon, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { PlacedPlan, ensurePane } from '@campus-map/mapkit';
import { planFormatOf, resolvePlanPlacement } from '@campus-map/core';
import type { BuildingMeta, MapSize } from '@campus-map/core';
import { useMap } from 'react-leaflet';
import { useEditorStore } from '../../stores/editorStore';
import { BUILDINGS_PANE } from './panes';
import { openingFloorOf } from '../../stores/editor/viewSlice';
import { usePlanUrl } from '../../hooks/usePlanUrl';
import { applySimilarity, rotationOf, scaleOf } from '../../import/planGeometry';
import type { Point, Similarity } from '../../import/planGeometry';
import { frameCenter, frameOf, moveFrame, rotateFrame, scaleFrame } from '../../import/placementMath';

/**
 * Корпуса на территории в редакторе (запись 50).
 *
 * Картинка территории лежит в своей pane (`EDITOR_UNDERLAY`, `panes.ts`), корпуса — над
 * ней, точки и линии — над корпусами. Корпус показывается планом этажа входа,
 * как на холсте навигатора.
 */


/** Подобие на экране — привязка в единицах карты (пиксели территории) для `PlacedPlan`. */
function placementOnMap(frame: Similarity) {
  return { metersPerPixel: scaleOf(frame), originMeters: { x: frame.tx, y: frame.ty }, rotationDeg: rotationOf(frame) };
}

const latLng = (point: Point): L.LatLngTuple => [point.y, point.x];

/** План корпуса на территории. */
const BuildingPlan: React.FC<{ meta: BuildingMeta; floor: number; frame: Similarity; placing?: boolean }> = ({ meta, floor, frame, placing }) => {
  const map = useMap();
  ensurePane(map, BUILDINGS_PANE.name, BUILDINGS_PANE.zIndex);
  const { url } = usePlanUrl(meta.id, floor);
  const floorMeta = meta.floors.find((item) => item.floor === floor);
  if (!url) return null;
  return (
    <PlacedPlan
      url={url}
      format={planFormatOf(floorMeta)}
      placement={placementOnMap(frame)}
      fallbackSize={floorMeta?.mapSize}
      pane={BUILDINGS_PANE.name}
      className={placing ? 'editor-placing-plan' : 'editor-campus-building'}
      reportStatus={false}
      data={{ building: meta.id }}
    />
  );
};

/** Поставленные корпуса — на территории. */
export const CampusBuildings: React.FC = () => {
  const currentFloor = useEditorStore((s) => s.currentFloor);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const campusMpp = useEditorStore((s) => s.campusMeta?.metersPerPixel);
  const placingBuilding = useEditorStore((s) => s.placing?.building);

  const placed = useMemo(() => {
    if (campusMpp === undefined) return [];
    return [...buildingMetas.values()].flatMap((meta) => {
      const floor = openingFloorOf(meta);
      const floorMeta = meta.floors.find((item) => item.floor === floor);
      const resolved = floorMeta ? resolvePlanPlacement(meta, floorMeta) : null;
      return floor !== null && resolved ? [{ meta, floor, frame: frameOf(resolved, campusMpp) }] : [];
    });
  }, [buildingMetas, campusMpp]);

  // Корпуса — только на территории; у корпуса без этажей карта тоже территория.
  if (currentFloor !== null) return null;
  return (
    <>
      {placed
        .filter((item) => item.meta.id !== placingBuilding)
        .map((item) => (
          <BuildingPlan key={item.meta.id} meta={item.meta} floor={item.floor} frame={item.frame} />
        ))}
    </>
  );
};

const handleIcon = (kind: 'move' | 'rotate' | 'scale', label: string) =>
  L.divIcon({
    className: `editor-place-handle editor-place-handle--${kind}`,
    html: `<span aria-label="${label}" title="${label}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

const ICONS = {
  move: handleIcon('move', 'Тяните — двигать корпус'),
  rotate: handleIcon('rotate', 'Тяните — поворачивать корпус'),
  scale: handleIcon('scale', 'Тяните — менять размер корпуса'),
};

/** Ручка постановки: перетаскивание считается от положения в начале. */
const Handle: React.FC<{
  kind: 'move' | 'rotate' | 'scale';
  at: Point;
  onDrag: (start: { frame: Similarity; at: Point }, now: Point) => void;
}> = ({ kind, at, onDrag }) => {
  const frame = useEditorStore((s) => s.placing?.frame);
  const start = useRef<{ frame: Similarity; at: Point } | null>(null);
  const handlers = useMemo(
    () => ({
      dragstart: () => {
        if (frame) start.current = { frame, at };
      },
      drag: (event: L.LeafletEvent) => {
        const { lat, lng } = (event.target as L.Marker).getLatLng();
        if (start.current) onDrag(start.current, { x: lng, y: lat });
      },
      dragend: () => {
        start.current = null;
      },
    }),
    [frame, at, onDrag]
  );
  return <Marker position={latLng(at)} icon={ICONS[kind]} draggable eventHandlers={handlers} keyboard={false} />;
};

/** Корпус, который ставят: полупрозрачный план, рамка, ручки, пары. */
export const PlacementLayer: React.FC = () => {
  const placing = useEditorStore((s) => s.placing);
  const meta = useEditorStore((s) => (s.placing ? s.buildingMetas.get(s.placing.building) : undefined));
  const setPlacingFrame = useEditorStore((s) => s.setPlacingFrame);

  if (!placing || !meta) return null;
  const { frame, planSize } = placing;
  const corners = cornersOf(frame, planSize);
  const center = frameCenter(frame, planSize);
  const rotateAt = applySimilarity(frame, { x: planSize.width / 2, y: -planSize.height * 0.12 });
  const scaleAt = corners[2];

  return (
    <>
      <BuildingPlan meta={meta} floor={placing.floor} frame={frame} placing />
      <Polygon positions={corners.map(latLng)} interactive={false} pathOptions={{ color: '#e94560', weight: 2, fill: false, dashArray: '6 4' }} />
      {!placing.pairMode && (
        <>
          <Polyline positions={[latLng(center), latLng(rotateAt)]} interactive={false} pathOptions={{ color: '#e94560', weight: 1 }} />
          <Handle kind="move" at={center} onDrag={(start, now) => setPlacingFrame(moveFrame(start.frame, now.x - start.at.x, now.y - start.at.y))} />
          <Handle
            kind="rotate"
            at={rotateAt}
            onDrag={(start, now) => {
              const pivot = frameCenter(start.frame, planSize);
              const before = Math.atan2(start.at.y - pivot.y, start.at.x - pivot.x);
              const after = Math.atan2(now.y - pivot.y, now.x - pivot.x);
              setPlacingFrame(rotateFrame(start.frame, pivot, ((after - before) * 180) / Math.PI));
            }}
          />
          <Handle
            kind="scale"
            at={scaleAt}
            onDrag={(start, now) => {
              const pivot = frameCenter(start.frame, planSize);
              const before = Math.hypot(start.at.x - pivot.x, start.at.y - pivot.y);
              const after = Math.hypot(now.x - pivot.x, now.y - pivot.y);
              if (before > 0 && after > 0) setPlacingFrame(scaleFrame(start.frame, pivot, after / before));
            }}
          />
        </>
      )}
      {placing.pairs.map((pair, index) => {
        const from = applySimilarity(frame, pair.from);
        return (
          <React.Fragment key={index}>
            <Polyline positions={[latLng(from), latLng(pair.to)]} interactive={false} pathOptions={{ color: '#e94560', weight: 2, dashArray: '4 3' }} />
            <CircleMarker center={latLng(pair.to)} radius={7} interactive={false} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#e94560', fillOpacity: 1 }}>
              <Tooltip permanent direction="right" offset={[8, 0]} className="editor-align-tip">
                {index + 1}
              </Tooltip>
            </CircleMarker>
          </React.Fragment>
        );
      })}
      {placing.pendingFrom && (
        <CircleMarker
          center={latLng(applySimilarity(frame, placing.pendingFrom))}
          radius={10}
          interactive={false}
          pathOptions={{ color: '#e94560', weight: 3, fillOpacity: 0, dashArray: '4 3' }}
        />
      )}
    </>
  );
};

function cornersOf(frame: Similarity, size: MapSize): Point[] {
  return [
    { x: 0, y: 0 },
    { x: size.width, y: 0 },
    { x: size.width, y: size.height },
    { x: 0, y: size.height },
  ].map((corner) => applySimilarity(frame, corner));
}

/** Замер масштаба территории: две точки и линия между ними. */
export const MeasureLayer: React.FC = () => {
  const measuring = useEditorStore((s) => s.measuring);
  if (!measuring) return null;
  const [a, b] = measuring.points;
  return (
    <>
      {measuring.points.map((point, index) => (
        <CircleMarker key={index} center={latLng(point)} radius={6} interactive={false} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#e94560', fillOpacity: 1 }} />
      ))}
      {a && b && <Polyline positions={[latLng(a), latLng(b)]} interactive={false} pathOptions={{ color: '#e94560', weight: 3 }} />}
    </>
  );
};
