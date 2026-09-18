import React, { useMemo } from 'react';
import { Tooltip, CircleMarker } from 'react-leaflet';
import { useEditorStore } from '../../stores/editorStore';

export const AliasLabels: React.FC = () => {
  const nodes = useEditorStore((s) => s.getNodesForCurrentFloor());
  const aliases = useEditorStore((s) => s.aliases);
  const showAliasLabels = useEditorStore((s) => s.displayFilters.showAliasLabels);

  const nodesWithAliases = useMemo(() => {
    if (!showAliasLabels) return [];

    return nodes
      .map(node => {
        const nodeAliases = aliases.get(node.id) || [];
        if (nodeAliases.length === 0) return null;
        return { node, alias: nodeAliases[0] };
      })
      .filter(Boolean) as { node: typeof nodes[0]; alias: string }[];
  }, [nodes, aliases, showAliasLabels]);

  if (!showAliasLabels || nodesWithAliases.length === 0) {
    return null;
  }

  return (
    <>
      {nodesWithAliases.map(({ node, alias }) => (
        <CircleMarker
          key={`label-${node.id}`}
          center={[node.y, node.x]}
          radius={0}
          pathOptions={{ opacity: 0, fillOpacity: 0 }}
        >
          <Tooltip
            permanent
            direction="top"
            offset={[0, -15]}
            className="alias-label-tooltip"
          >
            <div className="alias-label">
              {alias}
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
};
