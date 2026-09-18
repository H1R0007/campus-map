import React, { useEffect, useMemo, useState } from 'react';
import { Tooltip, CircleMarker, useMap } from 'react-leaflet';
import { distance } from '@campus-map/core';
import type { MapNode } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { floorNodesOf } from '../../stores/editor/dataSlice';
import { useQuiet } from '../../hooks/useQuiet';

/**
 * Сколько экранных пикселей должно быть между соседними узлами, чтобы их
 * подписи не слипались в полосу.
 */
const MIN_LABEL_GAP = 48;

/** Сколько ждать тишины в правках, прежде чем пересчитывать расстояния, мс. */
const QUIET_MS = 400;

/**
 * Расстояние до ближайшего соседа, медиана — по узлам с названиями.
 *
 * По ней решается, читаемы ли подписи при нынешнем приближении: порог «по
 * масштабу» не годится — у большого плана пиксель мельче, и один и тот же
 * масштаб означает разную густоту узлов на экране. Считается по названным
 * узлам: подписи есть только у них, а безымянные точки коридора стоят гораздо
 * гуще и занижали бы расстояние.
 */
function medianSpacing(nodes: readonly MapNode[]): number {
  if (nodes.length < 2) return Number.POSITIVE_INFINITY;

  const nearest: number[] = [];
  for (const node of nodes) {
    let best = Number.POSITIVE_INFINITY;
    for (const other of nodes) {
      if (other === node) continue;
      const away = distance(node, other);
      if (away < best) best = away;
    }
    nearest.push(best);
  }
  nearest.sort((a, b) => a - b);
  return nearest[Math.floor(nearest.length / 2)];
}

/**
 * Постоянные подписи узлов («Показывать на карте» → «Названия узлов»).
 *
 * Показываются, только когда узлы на экране достаточно далеко друг от друга:
 * на общем виде этажа подписи соседних узлов налезали друг на друга и
 * сливались в серую полосу. Каждая подпись — свой запоминаемый слой: иначе
 * перетаскивание одного узла двигало подписи всего этажа.
 */
export const AliasLabels: React.FC = () => {
  const map = useMap();
  const allNodes = useEditorStore((s) => s.nodes);
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);
  const showPortals = useEditorStore((s) => s.displayFilters.showPortals);
  const aliases = useEditorStore((s) => s.aliases);
  const showAliasLabels = useEditorStore((s) => s.displayFilters.showAliasLabels);

  const [scale, setScale] = useState(() => 2 ** map.getZoom());

  useEffect(() => {
    const update = () => setScale(2 ** map.getZoom());
    update();
    map.on('zoomend', update);
    return () => {
      map.off('zoomend', update);
    };
  }, [map]);

  const named = useMemo(() => {
    if (!showAliasLabels) return [];
    return floorNodesOf(allNodes, currentBuilding, currentFloor, showPortals)
      .map((node) => ({ node, alias: aliases.get(node.id)?.[0] }))
      .filter((item): item is { node: MapNode; alias: string } => item.alias !== undefined);
  }, [showAliasLabels, allNodes, currentBuilding, currentFloor, showPortals, aliases]);

  // Расстояния считаются по узлам, которые перестали двигаться: обход O(n²)
  // на каждом кадре перетаскивания стоил бы кадра.
  const quietNamed = useQuiet(named, QUIET_MS);
  const spacing = useMemo(() => medianSpacing(quietNamed.map((item) => item.node)), [quietNamed]);

  const labelled = spacing * scale < MIN_LABEL_GAP ? [] : named;

  return (
    <>
      {labelled.map(({ node, alias }) => (
        <AliasLabel key={node.id} node={node} alias={alias} />
      ))}
    </>
  );
};

const AliasLabel = React.memo(function AliasLabel({ node, alias }: { node: MapNode; alias: string }) {
  const center = useMemo((): [number, number] => [node.y, node.x], [node.y, node.x]);

  return (
    <CircleMarker center={center} radius={0} interactive={false} pathOptions={{ opacity: 0, fillOpacity: 0 }}>
      <Tooltip permanent direction="top" offset={[0, -15]} className="alias-label-tooltip">
        <div className="alias-label">{alias}</div>
      </Tooltip>
    </CircleMarker>
  );
});
