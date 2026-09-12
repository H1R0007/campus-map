import React from 'react';
import { useHistoryStore } from '../../stores/historyStore';
import { useEditorStore } from '../../stores/editorStore';

export const RecentActions: React.FC = () => {
  const entries = useHistoryStore((s) => s.entries);
  const currentIndex = useHistoryStore((s) => s.currentIndex);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const recentEntries = entries.slice(Math.max(0, currentIndex - 4), currentIndex + 1).reverse();

  if (recentEntries.length === 0) return null;

  return (
    <div
      className="absolute bottom-20 left-3 w-64 z-[1500] rounded-xl shadow-lg overflow-hidden"
      style={{
        backgroundColor: 'var(--editor-panel)',
        border: '1px solid var(--editor-border)',
      }}
    >
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--editor-border)' }}
      >
        <span className="text-xs font-medium" style={{ color: 'var(--editor-text-muted)' }}>
          Последние действия
        </span>
        <div className="flex gap-1">
          <button
            onClick={undo}
            disabled={currentIndex < 0}
            className="px-2 py-1 rounded text-xs disabled:opacity-30"
            style={{ backgroundColor: 'var(--editor-accent)', color: 'white' }}
            title="Отменить (Ctrl+Z)"
          >
            ↩
          </button>
          <button
            onClick={redo}
            disabled={currentIndex >= entries.length - 1}
            className="px-2 py-1 rounded text-xs disabled:opacity-30"
            style={{ backgroundColor: 'var(--editor-accent)', color: 'white' }}
            title="Повторить (Ctrl+Y)"
          >
            ↪
          </button>
        </div>
      </div>

      <div className="max-h-40 overflow-y-auto">
        {recentEntries.map((entry, i) => (
          <div
            key={entry.timestamp}
            className="px-3 py-2 text-xs flex items-center gap-2"
            style={{
              borderBottom: '1px solid var(--editor-border)',
              opacity: i === 0 ? 1 : 0.6,
            }}
          >
            <span>{getActionIcon(entry.type)}</span>
            <span className="flex-1 truncate" style={{ color: 'white' }}>
              {entry.description}
            </span>
            <span style={{ color: 'var(--editor-text-muted)' }}>
              {formatTime(entry.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

function getActionIcon(type: string): string {
  switch (type) {
    case 'ADD_NODE': return '➕';
    case 'REMOVE_NODE': return '🗑️';
    case 'MOVE_NODE': return '↔️';
    case 'UPDATE_NODE': return '✏️';
    case 'ADD_EDGE': return '🔗';
    case 'REMOVE_EDGE': return '✂️';
    case 'ADD_TRANSITION': return '🚪';
    case 'REMOVE_TRANSITION': return '❌';
    case 'SET_ALIASES': return '🏷️';
    case 'BATCH': return '📦';
    default: return '•';
  }
}

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return 'сейчас';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}м`;
  return `${Math.floor(diff / 3600000)}ч`;
}
