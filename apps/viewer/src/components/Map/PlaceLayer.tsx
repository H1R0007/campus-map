import React, { useEffect, useMemo } from 'react';
import { CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { MapNode } from '@campus-map/core';
import { containsPoint, fitPaddingOf } from '@campus-map/mapkit';
import { useCanvasLayout } from '../../hooks/useCanvasLayout';
import { useMapView } from '../../hooks/useMapView';
import { shownFloorOf, useMapStore } from '../../stores/mapStore';
import { pickNode } from '../../utils/mapPicking';
import { isDetailShown, mapPointOf, shownNodesOf } from '../../utils/mapView';
import { useColorScheme } from '../../hooks/useColorScheme';
import { themeColor } from '../../utils/themeColor';
import { isCameraBusy } from './mapCamera';
import { useMapInsets } from './mapChrome';

/** Радиус касания, CSS-пиксели: примерно подушечка пальца. */
const TAP_RADIUS = 28;

/** Запас от края интерфейса до выбранного места, когда карта к нему сдвигается, px. */
const SELECTION_MARGIN = 24;

/**
 * Помещения на плане и выбор места нажатием.
 *
 * Карта принимает ввод: нажатие рядом с помещением открывает его карточку
 * («Отсюда» / «Сюда»), нажатие мимо — закрывает. Раньше найти точку можно было
 * только набором названия, хотя человек видит её на плане.
 *
 * Выбирается помещение с названием или точка перехода. Коридор без названия —
 * нет: показать о нём нечего, а маршрут к узлу без названия из интерфейса не
 * строится. Неброские точки показывают, куда нажимать: на плане подписано не
 * всё — ни на тестовой схеме, ни, скорее всего, на официальных планах. Точки
 * переходов рисует `PortalLayer`.
 */
export const PlaceLayer: React.FC = () => {
  const graph = useMapStore((s) => s.graph);
  const aliasManager = useMapStore((s) => s.aliasManager);
  const view = useMapView();
  const layout = useCanvasLayout();
  const selectedNodeId = useMapStore((s) => s.selectedNodeId);
  const selectNode = useMapStore((s) => s.selectNode);
  const map = useMap();

  // Сотни точек этажа — один canvas, а не сотни SVG-элементов. Классов
  // canvas не получает, поэтому цвета берутся из токенов темы — и заново, когда
  // система переключает тему.
  const renderer = useMemo(() => L.canvas({ padding: 0.5 }), []);
  const scheme = useColorScheme();
  const colors = useMemo(
    () => ({ scheme, ring: themeColor('--color-route'), fill: themeColor('--color-surface') }),
    [scheme]
  );

  const nodes = useMemo(() => (graph ? shownNodesOf(graph, view) : []), [graph, view]);
  // Точки и выбор нажатием — только там, где значки видны: на общем виде холста
  // нажатие мимо крыши не выбирает невидимое место.
  const detailNodes = useMemo(() => nodes.filter((node) => isDetailShown(view, node)), [nodes, view]);
  const pointOf = (node: MapNode): [number, number] => (graph ? mapPointOf(graph, view, node) : [node.y, node.x]);

  const isNamed = (node: MapNode) => aliasManager?.getPrimaryAliasForId(node.id) != null;

  useMapEvents({
    click(event) {
      const picked = pickNode(
        detailNodes,
        (node) => node.isPortal || isNamed(node),
        (node) => map.latLngToContainerPoint(pointOf(node)),
        event.containerPoint,
        TAP_RADIUS
      );

      // Нажатие на крышу корпуса ведёт в корпус: его помещений на карте ещё
      // нет, выбирать нечего.
      if (!picked && layout !== null && view.kind === 'canvas') {
        const point = { x: event.latlng.lng, y: event.latlng.lat };
        const roof = layout.buildings.find(
          (building) => !view.revealed.has(building.id) && containsPoint(building.footprint, point)
        );
        if (roof) {
          const { buildingFloors, buildingMetas, setActiveFloor, requestView } = useMapStore.getState();
          setActiveFloor(roof.id, shownFloorOf(buildingFloors, buildingMetas?.get(roof.id), roof.id));
          requestView({ kind: 'building', buildingId: roof.id });
          return;
        }
      }

      selectNode(picked?.id ?? null);
    },
  });

  const selected = nodes.find((node) => node.id === selectedNodeId);
  const insets = useMapInsets();

  // Выбранное место не должно оказаться под шторкой или за краем экрана: место
  // из поиска бывает в другой части плана, а карточка места поднимает край
  // шторки. Карта сдвигается, только если точки не видно.
  // Числа, а не точка: на холсте вид пересобирается при каждом движении камеры,
  // и новая точка того же места двигала бы карту обратно к нему.
  const [selectedY, selectedX] = selected ? pointOf(selected) : [null, null];
  useEffect(() => {
    if (selectedY === null || selectedX === null) return;
    // Камера уже летит к месту (выбор из поиска): сдвиг остановил бы перелёт на
    // полпути, и карта осталась бы на общем виде.
    if (isCameraBusy(map)) return;
    map.panInside([selectedY, selectedX], fitPaddingOf(insets, SELECTION_MARGIN));
  }, [map, selectedY, selectedX, insets]);

  return (
    <>
      {detailNodes
        .filter((node) => !node.isPortal && isNamed(node))
        .map((node) => (
          <CircleMarker
            key={node.id}
            center={pointOf(node)}
            radius={4}
            renderer={renderer}
            interactive={false}
            pathOptions={{ color: colors.ring, weight: 2, fillColor: colors.fill, fillOpacity: 1 }}
          />
        ))}

      {selected && (
        <CircleMarker
          center={pointOf(selected)}
          radius={14}
          renderer={renderer}
          interactive={false}
          pathOptions={{ color: colors.ring, weight: 3, fillColor: colors.ring, fillOpacity: 0.2 }}
        />
      )}
    </>
  );
};
