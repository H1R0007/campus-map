import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { containsPoint, distanceToPolygon, fitPaddingOf, meterLatLng, useMapFrame } from '@campus-map/mapkit';
import { useMapStore } from '../../stores/mapStore';
import type { CanvasLayout } from '../../utils/canvasLayout';
import { focusBounds } from '../../utils/routeGeometry';
import { CAMERA_SETTLED, fitSoon, isCameraBusy } from './mapCamera';
import { useMapInsets } from './mapChrome';

/** На экране корпус длиннее этого — вместо крыши виден этаж, CSS-пиксели. */
const REVEAL_PX = 140;

/**
 * Открытый корпус закрывается, только став заметно меньше: без запаса этаж
 * мигал бы, пока человек держит масштаб на границе.
 */
const HIDE_PX = 110;

/** Запас вокруг экрана, доля его размера: корпус у самого края открывается заранее. */
const SCREEN_PAD = 0.25;

/** Текущий корпус остаётся текущим, пока центр карты не дальше этого от его контура, px. */
const KEEP_FOCUS_PX = 48;

/** Сколько территории вокруг места показывает камера, метры: место и соседние помещения. */
const PLACE_SPAN_METERS = 30;

/** Запас от интерфейса до того, к чему ведёт камера, px. */
const VIEW_MARGIN = 24;

/**
 * Камера холста кампуса (запись 32).
 *
 * Ведёт карту туда, куда просит навигатор (`viewRequest`): к корпусу из шапки,
 * к месту из поиска, на территорию. Слой маршрута подгоняет вид после неё — он
 * отрисован позже, и его подгонка в том же обновлении главнее (`fitSoon`).
 *
 * И наоборот — по положению карты решает, что на ней: какие корпуса приближены
 * настолько, что вместо крыши виден этаж, и к какому корпусу приближена камера.
 * Этот корпус становится текущим: шапка и колонка этажей показывают его.
 * Решение принимается по окончании движения, а не на каждом кадре.
 */
export const CanvasCamera: React.FC<{ layout: CanvasLayout }> = ({ layout }) => {
  const map = useMap();
  const { bounds } = useMapFrame();
  const graph = useMapStore((s) => s.graph);
  const viewRequest = useMapStore((s) => s.viewRequest);

  const insets = useMapInsets();
  const latestInsets = useRef(insets);
  latestInsets.current = insets;

  const handledSeq = useRef<number | null>(null);
  /** Куда летит камера по последней просьбе; снимается, когда перелёт закончился. */
  const requestedBounds = useRef<L.LatLngBounds | null>(null);

  useEffect(() => {
    if (viewRequest === null || handledSeq.current === viewRequest.seq || graph === null) return;
    handledSeq.current = viewRequest.seq;

    const { target } = viewRequest;
    let targetBounds: L.LatLngBounds | null = null;

    if (target.kind === 'campus') {
      targetBounds = bounds;
    } else if (target.kind === 'building') {
      const building = layout.buildings.find((candidate) => candidate.id === target.buildingId);
      if (building) targetBounds = L.latLngBounds(building.footprint.map(meterLatLng));
    } else {
      const world = graph.getWorld(target.nodeId);
      if (world) targetBounds = L.latLngBounds(focusBounds([[world.y, world.x]], PLACE_SPAN_METERS));
    }

    if (targetBounds === null) return;
    requestedBounds.current = targetBounds;
    fitSoon(map, targetBounds, { ...fitPaddingOf(latestInsets.current, VIEW_MARGIN), maxZoom: map.getMaxZoom() });
  }, [viewRequest, graph, layout, bounds, map]);

  // Место под карту поменялось, пока камера летит, — например, закрылся поиск,
  // из которого выбрали место: перелёт перестраивается под новые отступы, иначе
  // место оказалось бы под шторкой, а вид — отдалённым до упора.
  useEffect(() => {
    const target = requestedBounds.current;
    if (target === null || !isCameraBusy(map)) return;
    fitSoon(map, target, { ...fitPaddingOf(insets, VIEW_MARGIN), maxZoom: map.getMaxZoom() });
  }, [insets, map]);

  useEffect(() => {
    const forget = () => {
      requestedBounds.current = null;
    };
    map.on(CAMERA_SETTLED, forget);
    return () => {
      map.off(CAMERA_SETTLED, forget);
    };
  }, [map]);

  useEffect(() => {
    const update = () => {
      // Во время перелёта вид промежуточный: решение примет его конец.
      if (isCameraBusy(map)) return;
      const size = map.getSize();
      const edges = latestInsets.current;
      const pixelsPerMeter = map.getZoomScale(map.getZoom(), 0);
      // Центр свободной части карты, а не всего окна: половину экрана может
      // закрывать шторка.
      const centerLatLng = map.containerPointToLatLng(
        L.point((edges.left + size.x - edges.right) / 2, (edges.top + size.y - edges.bottom) / 2)
      );
      const center = { x: centerLatLng.lng, y: centerLatLng.lat };

      // Корпус за краем экрана не открывается, как бы крупно он ни был: его план
      // грузился бы впустую, а без связи этаж, которого человек не видел,
      // оказывался бы «сохранённым».
      const onScreen = map.getBounds().pad(SCREEN_PAD);
      const state = useMapStore.getState();
      const wasRevealed = new Set(state.revealedBuildings);
      const revealed = layout.buildings.filter(
        (building) =>
          building.span * pixelsPerMeter >= (wasRevealed.has(building.id) ? HIDE_PX : REVEAL_PX) &&
          onScreen.intersects(L.latLngBounds(building.footprint.map(meterLatLng)))
      );
      state.setRevealedBuildings(revealed.map((building) => building.id));

      const current = state.activeFloor?.buildingId ?? null;
      const containing = revealed.filter((building) => containsPoint(building.footprint, center));
      const focus =
        containing.find((building) => building.id === current) ??
        containing[0] ??
        revealed.find(
          (building) =>
            building.id === current && distanceToPolygon(building.footprint, center) * pixelsPerMeter <= KEEP_FOCUS_PX
        );
      state.focusFromCamera(focus?.id ?? null);
    };

    // Просьба к камере уже ждёт — решение примет конец её движения, иначе
    // текущий корпус на мгновение сбросился бы по старому виду.
    if (useMapStore.getState().viewRequest === null) update();
    map.on(`moveend zoomend resize ${CAMERA_SETTLED}`, update);
    return () => {
      map.off(`moveend zoomend resize ${CAMERA_SETTLED}`, update);
    };
  }, [map, layout]);

  return null;
};
