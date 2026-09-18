import React from 'react';
import { Polyline } from 'react-leaflet';
import { useEditorStore } from '../../stores/editorStore';
import { useCursorStore } from '../../stores/cursorStore';
import { mapPalette } from '../../utils/themeColor';

/**
 * Пунктир от последней точки начатой линии к курсору.
 *
 * Показывает, куда пойдёт следующая связь, до того как человек щёлкнет: на
 * плане с сотнями точек иначе непонятно, от чего продолжается коридор.
 */
export const ChainPreview: React.FC = () => {
  const chainLastNodeId = useEditorStore((s) => s.chainLastNodeId);
  const from = useEditorStore((s) => (s.chainLastNodeId ? s.nodes.get(s.chainLastNodeId) : undefined));
  const activeTool = useEditorStore((s) => s.activeTool);
  const cursor = useCursorStore((s) => s.point);
  const palette = mapPalette();

  if (!chainLastNodeId || !from || !cursor || activeTool !== 'node') return null;

  return (
    <Polyline
      positions={[
        [from.y, from.x],
        [cursor.y, cursor.x],
      ]}
      interactive={false}
      pathOptions={{ color: palette.draft, weight: 3, opacity: 0.8, dashArray: '6 6' }}
    />
  );
};
