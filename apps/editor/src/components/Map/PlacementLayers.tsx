import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleMarker, ImageOverlay, Marker, Polygon, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { PlacedPlan, ensurePane, useMapFrame } from '@campus-map/mapkit';
import { planFormatOf, resolvePlanPlacement } from '@campus-map/core';
import type { BuildingMeta, MapSize } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { placingAllowsScale } from '../../stores/editor/placeSlice';
import type { Placing } from '../../stores/editor/placeSlice';
import { BUILDINGS_PANE, PLACING_PANE, REFERENCE_PANE } from './panes';
import { mapPalette } from '../../utils/themeColor';
import { openingFloorOf } from '../../stores/editor/viewSlice';
import { usePlanUrl } from '../../hooks/usePlanUrl';
import { useLineArt } from '../../overlay/lineArtImage';
import type { LineArtKind } from '../../overlay/lineArt';
import { applySimilarity, rotationOf, scaleOf } from '../../import/planGeometry';
import type { Point, Similarity } from '../../import/planGeometry';
import { farCorner, frameCenter, frameOf, moveFrame, rotateFrame, scaleFrame, turnAroundPin } from '../../import/placementMath';
import { usePlanView } from './planView';

/**
 * Корпуса на территории и их размещение (записи 50, 62, 63).
 *
 * Картинка территории лежит в своей pane (`EDITOR_UNDERLAY`, `panes.ts`), корпуса — над
 * ней, точки и линии — над корпусами. Корпус показывается планом этажа входа,
 * как на холсте навигатора.
 *
 * При размещении план лежит целиком, а эталон — территория или этаж входа —
 * поверх него красными линиями: заливки не смешиваются. Шторка делит карту:
 * слева эталон, справа план. Пока зажат пробел, виден только эталон.
 */

/** Подобие на экране — привязка в единицах карты (пиксели территории) для `PlacedPlan`. */
function placementOnMap(frame: Similarity) {
  return { metersPerPixel: scaleOf(frame), originMeters: { x: frame.tx, y: frame.ty }, rotationDeg: rotationOf(frame) };
}

const latLng = (point: Point): L.LatLngTuple => [point.y, point.x];

/** План корпуса на территории; `pane` — где он лежит. */
const BuildingPlan: React.FC<{
  meta: BuildingMeta;
  floor: number;
  frame: Similarity;
  pane: { name: string; zIndex: number };
  className: string;
}> = ({ meta, floor, frame, pane, className }) => {
  const map = useMap();
  ensurePane(map, pane.name, pane.zIndex);
  const { url } = usePlanUrl(meta.id, floor);
  const floorMeta = meta.floors.find((item) => item.floor === floor);
  if (!url) return null;
  return (
    <PlacedPlan
      url={url}
      format={planFormatOf(floorMeta)}
      placement={placementOnMap(frame)}
      fallbackSize={floorMeta?.mapSize}
      pane={pane.name}
      className={className}
      reportStatus={false}
      data={{ building: meta.id }}
    />
  );
};

/** Поставленные корпуса — на территории. */
export const CampusBuildings: React.FC = () => {
  const { floor: currentFloor } = usePlanView();
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
          <BuildingPlan key={item.meta.id} meta={item.meta} floor={item.floor} frame={item.frame} pane={BUILDINGS_PANE} className="editor-campus-building" />
        ))}
    </>
  );
};

const handleIcon = (kind: 'move' | 'rotate' | 'scale' | 'turn', label: string) =>
  L.divIcon({
    className: `editor-place-handle editor-place-handle--${kind}`,
    html: `<span aria-label="${label}" title="${label}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

const ICONS = {
  move: handleIcon('move', 'Тяните — двигать план'),
  rotate: handleIcon('rotate', 'Тяните — поворачивать план'),
  scale: handleIcon('scale', 'Тяните — менять размер плана'),
  turn: handleIcon('turn', 'Тяните к его месту — план довернётся вокруг булавки'),
};

const PIN_ICON = L.divIcon({
  className: 'editor-place-pin',
  html: '<span aria-label="Булавка" title="Булавка: план доворачивается вокруг неё"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/** Ручка размещения: перетаскивание считается от положения в начале. */
const Handle: React.FC<{
  kind: 'move' | 'rotate' | 'scale' | 'turn';
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

/** Какие линии эталона рисовать: территория — границы пятен, этаж — контур или стены. */
function referenceKind(placing: Placing): LineArtKind | null {
  if (placing.peek || placing.show === 'swipe') return null;
  if (placing.mode === 'building') return 'edges';
  return placing.show === 'contour' ? 'contour' : 'lines';
}

/** Эталон красными линиями поверх плана — ровно по картинке эталона на карте. */
const ReferenceLines: React.FC<{ placing: Placing }> = ({ placing }) => {
  const map = useMap();
  const { bounds } = useMapFrame();
  const meta = useEditorStore((s) => s.buildingMetas.get(placing.building));
  const entrance = placing.mode === 'floor' ? openingFloorOf(meta) : null;
  const reference = usePlanUrl(placing.mode === 'floor' ? placing.building : null, entrance);
  const size = placing.mode === 'floor' ? meta?.floors.find((item) => item.floor === entrance)?.mapSize : undefined;
  const lines = useLineArt(reference.url, referenceKind(placing), placing.strength, size);
  ensurePane(map, REFERENCE_PANE.name, REFERENCE_PANE.zIndex);
  if (!lines) return null;
  return <ImageOverlay url={lines} bounds={bounds} pane={REFERENCE_PANE.name} className="editor-reference-lines" interactive={false} />;
};

/**
 * Шторка: план виден справа от черты, эталон — слева. Черту тянут мышью.
 * Обрезается pane плана — в координатах слоёв карты, поэтому пересчёт при
 * каждом сдвиге и масштабе.
 */
const SwipeDivider: React.FC = () => {
  const map = useMap();
  const [x, setX] = useState(() => map.getSize().x / 2);
  const drag = useRef(false);

  useEffect(() => {
    const pane = ensurePane(map, PLACING_PANE.name, PLACING_PANE.zIndex);
    const clip = () => {
      const point = map.containerPointToLayerPoint([x, 0]);
      pane.style.clipPath = `polygon(${point.x}px -100000px, 100000px -100000px, 100000px 100000px, ${point.x}px 100000px)`;
    };
    clip();
    map.on('move zoom viewreset resize', clip);
    return () => {
      map.off('move zoom viewreset resize', clip);
      pane.style.clipPath = '';
    };
  }, [map, x]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = true;
    map.dragging.disable();
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const rect = map.getContainer().getBoundingClientRect();
    setX(Math.min(rect.width - 8, Math.max(8, event.clientX - rect.left)));
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    map.dragging.enable();
  };

  return createPortal(
    <div
      className="editor-swipe"
      style={{ left: x }}
      role="separator"
      aria-orientation="vertical"
      aria-label="Шторка: слева эталон, справа план"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="editor-swipe__handle" aria-hidden="true">
        ⇆
      </span>
    </div>,
    map.getContainer()
  );
};

/** Пробел зажат — виден только эталон (запись 62). */
function usePeekKey(active: boolean): void {
  const setPeek = useEditorStore((s) => s.setPlacingPeek);
  useEffect(() => {
    if (!active) return;
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || typing(event.target)) return;
      event.preventDefault();
      setPeek(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setPeek(false);
    };
    const reset = () => setPeek(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', reset);
      setPeek(false);
    };
  }, [active, setPeek]);
}

/** План, который размещают: целиком, рамка, ручки, булавка; эталон — линиями поверх. */
export const PlacementLayer: React.FC = () => {
  const palette = mapPalette();
  const placing = useEditorStore((s) => s.placing);
  const meta = useEditorStore((s) => (s.placing ? s.buildingMetas.get(s.placing.building) : undefined));
  const setPlacingFrame = useEditorStore((s) => s.setPlacingFrame);
  usePeekKey(placing !== null);

  if (!placing || !meta) return null;
  const { frame, planSize, pin, peek } = placing;
  const corners = cornersOf(frame, planSize);
  const center = frameCenter(frame, planSize);
  const rotateAt = applySimilarity(frame, { x: planSize.width / 2, y: -planSize.height * 0.12 });
  const scaleAt = corners[2];
  const allowScale = placingAllowsScale(placing);

  return (
    <>
      {!peek && <BuildingPlan meta={meta} floor={placing.floor} frame={frame} pane={PLACING_PANE} className="editor-placing-plan" />}
      <ReferenceLines placing={placing} />
      {placing.show === 'swipe' && !peek && <SwipeDivider />}
      {!peek && (
        <Polygon positions={corners.map(latLng)} interactive={false} pathOptions={{ color: palette.handle, weight: 2, fill: false, dashArray: '6 4' }} />
      )}
      {!peek && !pin && (
        <>
          <Polyline positions={[latLng(center), latLng(rotateAt)]} interactive={false} pathOptions={{ color: palette.handle, weight: 1 }} />
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
          {allowScale && (
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
          )}
        </>
      )}
      {pin && (
        <>
          <Marker position={latLng(pin.at)} icon={PIN_ICON} interactive={false} keyboard={false} />
          {!peek && (
            <Handle
              kind="turn"
              at={farCorner(frame, planSize, pin.at)}
              onDrag={(start, now) => setPlacingFrame(turnAroundPin(start, pin.at, now, allowScale))}
            />
          )}
        </>
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
  const palette = mapPalette();
  const measuring = useEditorStore((s) => s.measuring);
  if (!measuring) return null;
  const [a, b] = measuring.points;
  return (
    <>
      {measuring.points.map((point, index) => (
        <CircleMarker key={index} center={latLng(point)} radius={6} interactive={false} pathOptions={{ color: palette.markerStroke, weight: 2, fillColor: palette.handle, fillOpacity: 1 }} />
      ))}
      {a && b && <Polyline positions={[latLng(a), latLng(b)]} interactive={false} pathOptions={{ color: palette.handle, weight: 3 }} />}
    </>
  );
};
