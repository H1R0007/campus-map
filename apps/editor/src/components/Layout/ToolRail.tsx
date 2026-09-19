import React from 'react';
import { TransitionGlyph } from '@campus-map/mapkit';
import { useEditorStore } from '../../stores/editorStore';
import { Icon } from '../UI/Icon';
import { TOOLS } from './tools';

/**
 * Колонка инструментов слева от карты: значок и подпись, как в графических
 * редакторах. Что делает выбранный инструмент и его параметры — в строке над
 * картой (`ToolOptions`).
 */
export const ToolRail: React.FC = () => {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const transitionType = useEditorStore((s) => s.transitionType);

  return (
    <div className="editor-rail" role="toolbar" aria-label="Инструменты" aria-orientation="vertical">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className="editor-rail__tool"
          aria-pressed={activeTool === tool.id}
          onClick={() => setActiveTool(tool.id)}
          title={`${tool.label} (${tool.shortcut})`}
        >
          {tool.icon === null ? <TransitionGlyph type={transitionType} size={22} /> : <Icon name={tool.icon} size={22} />}
          <span>{tool.label}</span>
        </button>
      ))}
    </div>
  );
};
