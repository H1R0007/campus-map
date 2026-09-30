import React, { useMemo } from 'react';
import { CircleMarker, ImageOverlay, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { edgeKey, planFormatOf, resolvePlanPlacement } from '@campus-map/core';
import { PlacedPlan, ensurePane } from '@campus-map/mapkit';
import { applySimilarity, composeSimilarity, invertSimilarity, rotationOf, scaleOf } from '../../import/planGeometry';
import { worldOf } from '../../import/placementMath';
import { BUILDINGS_PANE } from './panes';
import type { MapNode } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { floorNodesOf } from '../../stores/editor/dataSlice';
import { usePlanUrl } from '../../hooks/usePlanUrl';
import { mapPalette } from '../../utils/themeColor';

/**
 * Класс ставится при добавлении слоя, а не через `pathOptions`: react-leaflet
 * применяет настройки вида вызовом `setStyle`, а `className` тот не трогает,
 * и в собранном приложении класс не появлялся вовсе.
 */
const ghostNodeClass = { add: (e: L.LeafletEvent) => (e.target as L.Path).getElement()?.classList.add('editor-ghost-node') };
const ghostEdgeClass = { add: (e: L.LeafletEvent) => (e.target as L.Path).getElement()?.classList.add('editor-ghost-edge') };

/**
 * Соседний этаж бледно поверх открытого — «калька».
 *
 * Нужна, чтобы лестницы, лифты и туалеты вставали друг над другом от этажа
 * к этажу, а расхождение планов было видно сразу. Привязка к метрике для
 * этого не нужна: калька рисуется в координатах плана, и если этажи корпуса
 * начерчены в одной системе, всё совпадает само.
 *
 * Слой ничего не ловит мышью: щелчок сквозь кальку попадает в свой этаж.
 *
 * Точки и связи кальки — запомненные компоненты с неизменными ссылками, как
 * слои своего этажа (запись 39): перетаскивание точки открытого этажа меняет
 * список всех точек на каждом кадре, и без этого вся калька перерисовывалась
 * бы вместе с ним, хотя на соседнем этаже ничего не менялось.
 */
export const NeighbourFloor: React.FC = () => {
  const show = useEditorStore((s) => s.displayFilters.showNeighbourFloor);
  const direction = useEditorStore((s) => s.displayFilters.neighbourFloorBelow);
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const allNodes = useEditorStore((s) => s.nodes);
  const palette = mapPalette();
  const map = useMap();

  const meta = currentBuilding === null ? undefined : buildingMetas.get(currentBuilding);

  /** Ближайший этаж в выбранную сторону: соседнего может и не быть. */
  const neighbour = useMemo(() => {
    if (!show || !meta || currentFloor === null) return null;
    const floors = meta.floors.map((floorMeta) => floorMeta.floor).sort((a, b) => a - b);
    const below = [...floors].reverse().find((floor) => floor < currentFloor);
    const above = floors.find((floor) => floor > currentFloor);
    const chosen = direction ? (below ?? above) : (above ?? below);
    return chosen === undefined ? null : chosen;
  }, [show, meta, currentFloor, direction]);

  /**
   * Пиксель соседнего этажа → пиксель открытого (запись 53). Этажи со своей
   * привязкой начерчены в разном масштабе: калька ставится по привязкам,
   * чтобы лестницы совпали. Без привязок — один и тот же пиксель.
   */
  const relative = useMemo(() => {
    if (!meta || neighbour === null || currentFloor === null) return null;
    const own = meta.floors.find((item) => item.floor === currentFloor);
    const other = meta.floors.find((item) => item.floor === neighbour);
    const here = own ? resolvePlanPlacement(meta, own) : null;
    const there = other ? resolvePlanPlacement(meta, other) : null;
    if (!here || !there) return null;
    const rel = composeSimilarity(invertSimilarity(worldOf(here)), worldOf(there));
    const identity = Math.abs(rel.a - 1) < 1e-9 && Math.abs(rel.b) < 1e-9 && Math.abs(rel.tx) < 1e-6 && Math.abs(rel.ty) < 1e-6;
    return identity ? null : rel;
  }, [meta, neighbour, currentFloor]);

  // Точки кальки — в пикселях открытого этажа. Один и тот же объект точки
  // даёт один и тот же пересчёт: иначе перетаскивание на открытом этаже
  // перерисовывало бы всю кальку.
  const moved = useMemo(() => ({ relative, cache: new WeakMap<MapNode, MapNode>() }), [relative]);
  const nodes = useMemo(() => {
    const list = neighbour === null ? [] : floorNodesOf(allNodes, currentBuilding, neighbour, true);
    if (!relative) return list;
    return list.map((node) => {
      let copy = moved.cache.get(node);
      if (!copy) {
        copy = { ...node, ...applySimilarity(relative, node) };
        moved.cache.set(node, copy);
      }
      return copy;
    });
  }, [allNodes, currentBuilding, neighbour, relative, moved]);

  const edges = useMemo(() => {
    const seen = new Set<string>();
    const result: { key: string; a: MapNode; b: MapNode }[] = [];
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const node of nodes) {
      for (const neighbourId of node.neighbors) {
        const other = byId.get(neighbourId);
        if (!other) continue;
        const key = edgeKey(node.id, neighbourId);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ key, a: node, b: other });
      }
    }
    return result;
  }, [nodes]);

  const floorMeta = neighbour === null ? undefined : meta?.floors.find((item) => item.floor === neighbour);
  const plan = usePlanUrl(currentBuilding, neighbour);
  const width = floorMeta?.mapSize?.width;
  const height = floorMeta?.mapSize?.height;
  const bounds = useMemo(
    () => (width === undefined || height === undefined ? null : L.latLngBounds([0, 0], [height, width])),
    [width, height]
  );

  if (neighbour === null || currentBuilding === null || !meta) return null;

  return (
    <>
      {relative && plan.url !== null && (
        <PlacedPlan
          url={plan.url}
          format={planFormatOf(floorMeta)}
          placement={{ metersPerPixel: scaleOf(relative), originMeters: { x: relative.tx, y: relative.ty }, rotationDeg: rotationOf(relative) }}
          fallbackSize={floorMeta?.mapSize}
          pane={ghostPane(map)}
          className="editor-ghost-plan"
          reportStatus={false}
        />
      )}
      {!relative && bounds && plan.url !== null && (
        <ImageOverlay
          url={plan.url}
          bounds={bounds}
          opacity={0.18}
          interactive={false}
        />
      )}
      {edges.map(({ key, a, b }) => (
        <GhostEdge key={`ghost-edge-${key}`} a={a} b={b} color={palette.edge} />
      ))}
      {nodes.map((node) => (
        <GhostNode key={`ghost-node-${node.id}`} node={node} color={node.isPortal ? palette.portal : palette.node} />
      ))}
    </>
  );
};

/**
 * Связь кальки. Перерисовывается, только когда сдвинулся один из её концов:
 * точки соседнего этажа при правке открытого остаются теми же объектами.
 */
const GhostEdge = React.memo(function GhostEdge({ a, b, color }: { a: MapNode; b: MapNode; color: string }) {
  const positions = useMemo<L.LatLngTuple[]>(
    () => [
      [a.y, a.x],
      [b.y, b.x],
    ],
    [a.x, a.y, b.x, b.y]
  );
  const pathOptions = useMemo(() => ({ color, weight: 2, opacity: 0.35 }), [color]);

  return <Polyline positions={positions} interactive={false} eventHandlers={ghostEdgeClass} pathOptions={pathOptions} />;
});

/** Точка кальки. Перерисовывается, только когда изменилась сама точка. */
const GhostNode = React.memo(function GhostNode({ node, color }: { node: MapNode; color: string }) {
  const center = useMemo<L.LatLngTuple>(() => [node.y, node.x], [node.x, node.y]);
  const pathOptions = useMemo(
    () => ({ color, fillColor: color, fillOpacity: 0.3, opacity: 0.45, weight: 1 }),
    [color]
  );

  return <CircleMarker center={center} radius={5} interactive={false} eventHandlers={ghostNodeClass} pathOptions={pathOptions} />;
});

/** Pane кальки: над подложкой, под точками открытого этажа. */
function ghostPane(map: L.Map): string {
  ensurePane(map, BUILDINGS_PANE.name, BUILDINGS_PANE.zIndex);
  return BUILDINGS_PANE.name;
}
