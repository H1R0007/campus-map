import React, { useMemo } from 'react';
import { CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import { useEditorStore } from '../../stores/editorStore';
import { floorNodesOf } from '../../stores/editor/dataSlice';
import { alignmentFit } from '../../stores/editor/alignSlice';
import { applySimilarity } from '../../import/planGeometry';

/**
 * Совмещение на карте (запись 49): пара — пунктир от точки к месту, где она
 * должна стоять, с номером пары. С двух пар видно, куда встанут все точки
 * плана, — бледными кружками: ошибку в паре видно до «Применить».
 */
export const AlignmentLayer: React.FC = () => {
  const alignment = useEditorStore((s) => s.alignment);
  const nodes = useEditorStore((s) => s.nodes);

  const fit = useMemo(() => (alignment ? alignmentFit(alignment.pairs, nodes) : null), [alignment, nodes]);
  const ghosts = useMemo(() => {
    if (!alignment || !fit) return [];
    const plan = alignment.plan;
    return floorNodesOf(nodes, plan.building, plan.floor, true).map((node) => ({
      id: node.id,
      at: applySimilarity(fit.transform, node),
    }));
  }, [alignment, fit, nodes]);

  if (!alignment) return null;

  const pending = alignment.pending ? nodes.get(alignment.pending) : undefined;

  return (
    <>
      {ghosts.map(({ id, at }) => (
        <CircleMarker
          key={`ghost-${id}`}
          center={[at.y, at.x]}
          radius={5}
          interactive={false}
          pathOptions={{ color: '#22c55e', weight: 2, fillOpacity: 0, dashArray: '2 3' }}
        />
      ))}
      {alignment.pairs.map((pair, index) => {
        const node = nodes.get(pair.nodeId);
        if (!node) return null;
        return (
          <React.Fragment key={pair.nodeId}>
            <Polyline
              positions={[
                [node.y, node.x],
                [pair.to.y, pair.to.x],
              ]}
              interactive={false}
              pathOptions={{ color: '#e94560', weight: 2, dashArray: '6 4' }}
            />
            <CircleMarker
              center={[pair.to.y, pair.to.x]}
              radius={7}
              interactive={false}
              pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#e94560', fillOpacity: 1 }}
            >
              <Tooltip permanent direction="right" offset={[8, 0]} className="editor-align-tip">
                {index + 1}
              </Tooltip>
            </CircleMarker>
          </React.Fragment>
        );
      })}
      {pending && (
        <CircleMarker
          center={[pending.y, pending.x]}
          radius={13}
          interactive={false}
          pathOptions={{ color: '#e94560', weight: 3, fillOpacity: 0, dashArray: '4 3' }}
        />
      )}
    </>
  );
};
