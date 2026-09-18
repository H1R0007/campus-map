import React from 'react';
import { TransitionGlyph } from '@campus-map/mapkit';
import { useEditorStore } from '../../stores/editorStore';
import type { EditorTool } from '../../stores/editorStore';
import { Icon } from '../UI/Icon';
import type { IconName } from '../UI/Icon';

/** Инструменты. Значок `null` — значок выбранного типа перехода. */
export const TOOLS: { id: EditorTool; icon: IconName | null; label: string; shortcut: string }[] = [
  { id: 'select', label: 'Выбор', shortcut: 'V', icon: 'select' },
  { id: 'node', label: 'Узел', shortcut: 'N', icon: 'plus' },
  { id: 'edge', label: 'Связь', shortcut: 'E', icon: 'link' },
  { id: 'transition', label: 'Переход', shortcut: 'T', icon: null },
  { id: 'line', label: 'Линия', shortcut: 'L', icon: 'ruler' },
];

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
