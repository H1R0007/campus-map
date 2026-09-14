import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { Icon } from './Icon';

export const EdgeContextMenu: React.FC = () => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [subdivideCount, setSubdivideCount] = useState(3);
  const [showSubdivide, setShowSubdivide] = useState(false);

  const contextMenu = useEditorStore((s) => s.contextMenu);
  const closeContextMenu = useEditorStore((s) => s.closeContextMenu);

  const removeEdge = useEditorStore((s) => s.removeEdge);
  const splitEdge = useEditorStore((s) => s.splitEdge);
  const subdivideEdge = useEditorStore((s) => s.subdivideEdge);
  const getNode = useEditorStore((s) => s.getNode);
  const selectSingleNode = useEditorStore((s) => s.selectSingleNode);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
        setShowSubdivide(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeContextMenu();
        setShowSubdivide(false);
      }
    };

    if (contextMenu.open) {
      document.addEventListener('mousedown', handleClickOutside, true);
      document.addEventListener('keydown', handleEscape, true);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [contextMenu.open, closeContextMenu]);

  // Показываем только для рёбер (без nodeId)
  if (!contextMenu.open || contextMenu.nodeId || !contextMenu.edgeFrom || !contextMenu.edgeTo) {
    return null;
  }

  const fromNode = getNode(contextMenu.edgeFrom);
  const toNode = getNode(contextMenu.edgeTo);

  if (!fromNode || !toNode) return null;

  const run = (fn: () => void) => {
    fn();
    closeContextMenu();
    setShowSubdivide(false);
  };

  const handleSubdivide = () => {
    if (contextMenu.edgeFrom && contextMenu.edgeTo) {
      subdivideEdge(contextMenu.edgeFrom, contextMenu.edgeTo, subdivideCount);
    }
    closeContextMenu();
    setShowSubdivide(false);
  };

  // Короткие ID для отображения
  const fromLabel = fromNode.id.length > 20 ? '...' + fromNode.id.slice(-15) : fromNode.id;
  const toLabel = toNode.id.length > 20 ? '...' + toNode.id.slice(-15) : toNode.id;

  return (
    <div
      ref={menuRef}
      className="fixed z-[2500] min-w-[240px] rounded-xl shadow-2xl overflow-hidden"
      style={{
        left: contextMenu.x,
        top: contextMenu.y,
        backgroundColor: 'var(--editor-panel)',
        border: '1px solid var(--editor-border)',
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 text-xs font-mono"
        style={{
          color: 'var(--editor-text-muted)',
          borderBottom: '1px solid var(--editor-border)',
          backgroundColor: 'var(--editor-bg)',
        }}
      >
        <div className="truncate flex items-center gap-1.5"><Icon name="link" size={12} className="flex-shrink-0" />{fromLabel}</div>
        <div className="truncate flex items-center gap-1.5"><Icon name="move" size={12} className="flex-shrink-0" />{toLabel}</div>
      </div>

      {/* Навигация к узлам */}
      <div
        className="px-3 py-2 flex gap-2"
        style={{ borderBottom: '1px solid var(--editor-border)' }}
      >
        <button
          onClick={() => run(() => selectSingleNode(contextMenu.edgeFrom!))}
          className="flex-1 px-2 py-1.5 rounded-lg text-xs transition-colors hover:bg-white/10"
          style={{ backgroundColor: 'var(--editor-accent)', color: 'white' }}
        >
          → Узел A
        </button>
        <button
          onClick={() => run(() => selectSingleNode(contextMenu.edgeTo!))}
          className="flex-1 px-2 py-1.5 rounded-lg text-xs transition-colors hover:bg-white/10"
          style={{ backgroundColor: 'var(--editor-accent)', color: 'white' }}
        >
          → Узел B
        </button>
      </div>

      {/* Actions */}
      <MenuItem
        onClick={() => run(() => {
          if (contextMenu.edgeFrom && contextMenu.edgeTo) {
            splitEdge(contextMenu.edgeFrom, contextMenu.edgeTo);
          }
        })}
        icon={<Icon name="unlink" />}
        label="Разделить пополам"
        hint="Вставить 1 узел в середину"
      />

      <MenuItem
        onClick={() => setShowSubdivide(!showSubdivide)}
        icon={<Icon name="ruler" />}
        label="Subdivide..."
        hint="Разбить на несколько сегментов"
        active={showSubdivide}
      />

      {showSubdivide && (
        <div
          className="px-3 py-3 space-y-2"
          style={{ backgroundColor: 'var(--editor-bg)' }}
        >
          <div className="flex items-center gap-2">
            <label className="text-xs flex-shrink-0" style={{ color: 'var(--editor-text-muted)' }}>
              Сегментов:
            </label>
            <input
              type="range"
              min={2}
              max={10}
              value={subdivideCount}
              onChange={(e) => setSubdivideCount(parseInt(e.target.value))}
              className="flex-1"
              style={{ accentColor: 'var(--editor-highlight)' }}
            />
            <span className="text-sm font-mono w-6 text-center" style={{ color: 'white' }}>
              {subdivideCount}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>
              Будет создано: {subdivideCount - 1} узлов
            </span>
            <button
              onClick={handleSubdivide}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ backgroundColor: 'var(--editor-highlight)', color: 'white' }}
            >
              Применить
            </button>
          </div>
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--editor-border)' }} />

      <MenuItem
        onClick={() => run(() => {
          if (contextMenu.edgeFrom && contextMenu.edgeTo) {
            removeEdge(contextMenu.edgeFrom, contextMenu.edgeTo);
          }
        })}
        icon={<Icon name="trash" />}
        label="Удалить ребро"
        danger
      />
    </div>
  );
};

const MenuItem: React.FC<{
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  danger?: boolean;
  active?: boolean;
}> = ({ onClick, icon, label, hint, danger, active }) => (
  <button
    onClick={onClick}
    className="w-full px-3 py-2.5 text-left text-sm flex items-start gap-2 transition-colors hover:bg-white/10"
    style={{
      color: danger ? '#fca5a5' : 'white',
      backgroundColor: active ? 'var(--editor-accent)' : 'transparent',
    }}
    type="button"
  >
    <span className="flex-shrink-0 mt-0.5">{icon}</span>
    <div className="flex-1 min-w-0">
      <div>{label}</div>
      {hint && (
        <div className="text-xs mt-0.5" style={{ color: 'var(--editor-text-muted)' }}>
          {hint}
        </div>
      )}
    </div>
  </button>
);
