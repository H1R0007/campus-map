import React, { useMemo } from 'react';
import { CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { MapNode } from '@campus-map/core';
import { scopeOf, useMapStore } from '../../stores/mapStore';
import { pickNode } from '../../utils/mapPicking';
import { themeColor } from '../../utils/themeColor';

/** Радиус касания, CSS-пиксели: примерно подушечка пальца. */
const TAP_RADIUS = 28;

/**
 * Помещения на плане и выбор места нажатием.
 *
 * Карта принимает ввод: нажатие рядом с помещением открывает его карточку
 * («Отсюда» / «Сюда»), нажатие мимо — закрывает. Раньше найти точку можно было
 * только набором названия, хотя человек видит её на плане.
 *
 * Выбирается помещение с названием или точка перехода. Коридор без названия —
 * нет: показать о нём нечего, а маршрут к узлу без названия из интерфейса не
 * строится. Неброские точки показывают, куда нажимать: на заглушках помещений
 * не видно вовсе, а на официальных планах подписано не всё. Точки переходов
 * рисует `PortalLayer`.
 */
export const PlaceLayer: React.FC = () => {
  const graph = useMapStore((s) => s.graph);
  const aliasManager = useMapStore((s) => s.aliasManager);
  const activeFloor = useMapStore((s) => s.activeFloor);
  const selectedNodeId = useMapStore((s) => s.selectedNodeId);
  const selectNode = useMapStore((s) => s.selectNode);
  const map = useMap();

  // Сотни точек этажа — один canvas, а не сотни SVG-элементов. Классов
  // canvas не получает, поэтому фирменный цвет берётся из токена темы.
  const renderer = useMemo(() => L.canvas({ padding: 0.5 }), []);
  const primary = useMemo(() => themeColor('--color-primary'), []);

  const nodes = useMemo(() => {
    if (!graph) return [];
    const scope = scopeOf(activeFloor);
    return scope.mode === 'campus'
      ? graph.getCampusNodes()
      : graph.getNodesForFloor(scope.buildingId, scope.floor);
  }, [graph, activeFloor]);

  const isNamed = (node: MapNode) => aliasManager?.getPrimaryAliasForId(node.id) != null;

  useMapEvents({
    click(event) {
      const picked = pickNode(
        nodes,
        (node) => node.isPortal || isNamed(node),
        (node) => map.latLngToContainerPoint([node.y, node.x]),
        event.containerPoint,
        TAP_RADIUS
      );
      selectNode(picked?.id ?? null);
    },
  });

  const selected = nodes.find((node) => node.id === selectedNodeId);

  return (
    <>
      {nodes
        .filter((node) => !node.isPortal && isNamed(node))
        .map((node) => (
          <CircleMarker
            key={node.id}
            center={[node.y, node.x]}
            radius={4}
            renderer={renderer}
            interactive={false}
            pathOptions={{ color: primary, weight: 2, fillColor: '#ffffff', fillOpacity: 1 }}
          />
        ))}

      {selected && (
        <CircleMarker
          center={[selected.y, selected.x]}
          radius={14}
          renderer={renderer}
          interactive={false}
          pathOptions={{ color: primary, weight: 3, fillColor: primary, fillOpacity: 0.2 }}
        />
      )}
    </>
  );
};
