import React from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useHistoryStore } from '../../stores/historyStore';
import { Icon } from './Icon';

export const StatusBar: React.FC = () => {
  const currentBuilding = useEditorStore((state) => state.currentBuilding);
  const currentFloor = useEditorStore((state) => state.currentFloor);
  const buildingMetas = useEditorStore((state) => state.buildingMetas);
  const nodes = useEditorStore((state) => state.nodes);
  const transitions = useEditorStore((state) => state.transitions);
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const hasUnsavedChanges = useEditorStore((state) => state.hasUnsavedChanges);
  const activeTool = useEditorStore((state) => state.activeTool);
  const edgeStartNodeId = useEditorStore((state) => state.edgeStartNodeId);
  const transitionStartNodeId = useEditorStore((state) => state.transitionStartNodeId);
  const lineTool = useEditorStore((state) => state.lineTool);

  const historyEntries = useHistoryStore((state) => state.entries);
  const historyIndex = useHistoryStore((state) => state.currentIndex);

  const currentMeta = currentBuilding ? buildingMetas.get(currentBuilding) : null;
  const locationText = currentBuilding
    ? `${currentMeta?.name ?? currentBuilding} / Этаж ${currentFloor}`
    : 'Кампус';

  const toolInfo: Record<string, { name: string; hint: string }> = {
    select: {
      name: 'Выбор',
      hint:
        'Щелчок — выбрать узел · перетащить — сдвинуть · Shift+щелчок — добавить к выбору · ' +
        'Shift+протянуть — рамка · правая кнопка — меню',
    },
    node: {
      name: 'Узел',
      hint: 'Щелчок по карте — поставить узел',
    },
    edge: {
      name: 'Ребро',
      hint: edgeStartNodeId
        ? 'Щелчок по второму узлу — соединить · Esc — отмена'
        : 'Щелчок по первому узлу ребра',
    },
    transition: {
      name: 'Переход',
      hint: transitionStartNodeId
        ? 'Щелчок по второму узлу — создать переход · Esc — отмена'
        : 'Щелчок по первому узлу перехода',
    },
    line: {
      name: 'Линия',
      hint: !lineTool.start
        ? 'Щелчок — начало линии'
        : !lineTool.end
        ? 'Щелчок — конец линии'
        : 'Задайте число узлов в панели и нажмите «Создать»',
    },
    delete: {
      name: 'Удаление',
      hint: 'Щелчок по узлу, ребру или переходу — удалить',
    },
  };

  const currentTool = toolInfo[activeTool] || { name: activeTool, hint: '' };

  return (
    <footer
      aria-label="Строка состояния"
      className="h-9 flex items-center justify-between px-4 text-xs select-none"
      style={{ backgroundColor: 'var(--editor-panel)', borderTop: '1px solid var(--editor-border)' }}
    >
      {/* Left */}
      <div className="flex items-center gap-4">
        <span style={{ color: 'var(--editor-text-muted)' }}>
          <Icon name="pin" size={12} className="inline-block mr-1 align-middle" />
          <span className="text-white">{locationText}</span>
        </span>

        <span style={{ color: 'var(--editor-text-muted)' }}>
          {nodes.size} узлов • {transitions.length} переходов
        </span>

        {selectedNodeIds.size > 0 && (
          <span style={{ color: 'var(--editor-highlight)' }}>
            ✓ Выбрано: {selectedNodeIds.size}
            {selectedNodeIds.size > 1 && ' (Del удалить, ↑↓←→ двигать)'}
          </span>
        )}
      </div>

      {/* Center */}
      <div className="flex items-center gap-2 max-w-[40%]">
        <span className="px-2 py-0.5 rounded font-medium whitespace-nowrap" style={{ backgroundColor: 'var(--editor-highlight)', color: 'white' }}>
          {currentTool.name}
        </span>
        <span className="truncate" style={{ color: 'var(--editor-text-muted)' }} title={currentTool.hint}>
          {currentTool.hint}
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        <span style={{ color: 'var(--editor-text-muted)' }}>Ctrl+F поиск</span>
        <span style={{ color: 'var(--editor-text-muted)' }}>{historyIndex + 1}/{historyEntries.length}</span>

        {hasUnsavedChanges ? (
          <span className="flex items-center gap-1.5" style={{ color: '#fbbf24' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
            Изменено
          </span>
        ) : (
          <span className="flex items-center gap-1.5" style={{ color: '#22c55e' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Сохранено
          </span>
        )}
      </div>
    </footer>
  );
};
