import React, { useEffect, useMemo, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { containsPoint, fitPaddingOf, meterLatLng, useMapFrame } from '@campus-map/mapkit';
import { useMapStore } from '../../stores/mapStore';
import type { CanvasLayout } from '../../utils/canvasLayout';
import { DETAIL_PIXELS_PER_METER, PRELOAD_SHARE, isRevealedAt, screenShare } from '../../utils/canvasReveal';
import { focusBounds } from '../../utils/routeGeometry';
import { CAMERA_SETTLED, fitSoon, isCameraBusy } from './mapCamera';
import { useMapInsets } from './mapChrome';

/** Запас вокруг экрана, доля его размера: корпус у самого края открывается заранее. */
const SCREEN_PAD = 0.25;


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
 * И наоборот — по положению карты решает, что на ней: какие корпуса открыты
 * (`canvasReveal.ts`) и к какому корпусу приближена камера. Этот корпус
 * становится текущим: шапка и колонка этажей показывают его. Решение
 * принимается по окончании движения. По ходу масштаба решается только, чьи
 * этажи грузить заранее и показывать ли значки территории.
 */
export const CanvasCamera: React.FC<{ layout: CanvasLayout }> = ({ layout }) => {
  const map = useMap();
  const { bounds } = useMapFrame();
  const graph = useMapStore((s) => s.graph);
  const viewRequest = useMapStore((s) => s.viewRequest);

  const insets = useMapInsets();
  const latestInsets = useRef(insets);
  latestInsets.current = insets;

  const footprintBounds = useMemo(
    () => new Map(layout.buildings.map((building) => [building.id, L.latLngBounds(building.footprint.map(meterLatLng))])),
    [layout]
  );

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
      const freeWidth = size.x - edges.left - edges.right;
      const freeHeight = size.y - edges.top - edges.bottom;
      const state = useMapStore.getState();
      const wasRevealed = new Set(state.revealedBuildings);
      const revealed = layout.buildings.filter(
        (building) =>
          isRevealedAt(screenShare(building.span, pixelsPerMeter, freeWidth, freeHeight), wasRevealed.has(building.id)) &&
          onScreen.intersects(footprintBounds.get(building.id)!)
      );
      state.setRevealedBuildings(revealed.map((building) => building.id));

      // Прежний корпус остаётся текущим, пока его этаж открыт и виден в
      // свободной части карты, а центр не зашёл в другой корпус. Раньше он
      // держался, только пока центр рядом с контуром: шаг «Войдите в здание»
      // кадрирует вход на краю корпуса, центр оказывался на газоне, и шапка
      // с колонкой этажей сбрасывались на территорию посреди навигации.
      const freeView = L.latLngBounds(
        map.containerPointToLatLng(L.point(edges.left, edges.top)),
        map.containerPointToLatLng(L.point(size.x - edges.right, size.y - edges.bottom))
      );
      const current = state.activeFloor?.buildingId ?? null;
      const containing = revealed.filter((building) => containsPoint(building.footprint, center));
      const focus =
        containing.find((building) => building.id === current) ??
        containing[0] ??
        revealed.find((building) => building.id === current && freeView.intersects(footprintBounds.get(building.id)!));
      state.focusFromCamera(focus?.id ?? null);
    };

    // Просьба к камере уже ждёт — решение примет конец её движения, иначе
    // текущий корпус на мгновение сбросился бы по старому виду.
    if (useMapStore.getState().viewRequest === null) update();
    map.on(`moveend zoomend resize ${CAMERA_SETTLED}`, update);
    return () => {
      map.off(`moveend zoomend resize ${CAMERA_SETTLED}`, update);
    };
  }, [map, layout, footprintBounds]);

  // По ходу масштаба и перетаскивания, во время перелёта тоже: этаж корпуса,
  // к которому летит камера или который въезжает в экран под пальцем, должен
  // начать грузиться до того, как крыша начнёт таять.
  useEffect(() => {
    const update = () => {
      const size = map.getSize();
      const edges = latestInsets.current;
      const pixelsPerMeter = map.getZoomScale(map.getZoom(), 0);
      const onScreen = map.getBounds().pad(SCREEN_PAD);
      const freeWidth = size.x - edges.left - edges.right;
      const freeHeight = size.y - edges.top - edges.bottom;
      const state = useMapStore.getState();

      state.setNearBuildings(
        layout.buildings
          .filter(
            (building) =>
              screenShare(building.span, pixelsPerMeter, freeWidth, freeHeight) >= PRELOAD_SHARE &&
              onScreen.intersects(footprintBounds.get(building.id)!)
          )
          .map((building) => building.id)
      );
      state.setCanvasDetailed(pixelsPerMeter >= DETAIL_PIXELS_PER_METER);
    };

    // Перетаскивание присылает движения чаще кадров — решение не чаще кадра.
    let frame = 0;
    const updateOnMove = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };

    update();
    map.on('zoom moveend resize', update);
    map.on('move', updateOnMove);
    return () => {
      map.off('zoom moveend resize', update);
      map.off('move', updateOnMove);
      cancelAnimationFrame(frame);
    };
  }, [map, layout, footprintBounds]);

  return null;
};
