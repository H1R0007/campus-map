import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';

export const ContextMenu: React.FC = () => {
  const menuRef = useRef<HTMLDivElement>(null);

  const contextMenu = useEditorStore((s) => s.contextMenu);
  const closeContextMenu = useEditorStore((s) => s.closeContextMenu);

  const removeNode = useEditorStore((s) => s.removeNode);
  const removeEdge = useEditorStore((s) => s.removeEdge);
  const removeTransition = useEditorStore((s) => s.removeTransition);

  const updateNode = useEditorStore((s) => s.updateNode);
  const getNode = useEditorStore((s) => s.getNode);
  const selectSingleNode = useEditorStore((s) => s.selectSingleNode);

  const setEdgeStartNode = useEditorStore((s) => s.setEdgeStartNode);
  const setTransitionStartNode = useEditorStore((s) => s.setTransitionStartNode);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeContextMenu();
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
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

  if (!contextMenu.open) return null;

  const node = contextMenu.nodeId ? getNode(contextMenu.nodeId) : null;
  const isLink = !!contextMenu.edgeFrom && !!contextMenu.edgeTo && !contextMenu.nodeId;

  const run = (fn: () => void) => {
    fn();
    closeContextMenu();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[2500] min-w-[200px] rounded-xl shadow-2xl overflow-hidden"
      style={{
        left: contextMenu.x,
        top: contextMenu.y,
        backgroundColor: 'var(--editor-panel)',
        border: '1px solid var(--editor-border)',
      }}
    >
      {node && (
        <>
          <div
            className="px-3 py-2 text-xs font-mono truncate"
            style={{
              color: 'var(--editor-text-muted)',
              borderBottom: '1px solid var(--editor-border)',
              backgroundColor: 'var(--editor-bg)',
            }}
          >
            {node.id}
          </div>

          <MenuItem onClick={() => run(() => selectSingleNode(node.id))} icon="👆" label="Выбрать" />
          <MenuItem
            onClick={() =>
              run(() => {
                setActiveTool('edge');
                setEdgeStartNode(node.id);
              })
            }
            icon="🔗"
            label="Создать ребро отсюда"
          />
          <MenuItem
            onClick={() =>
              run(() => {
                setActiveTool('transition');
                setTransitionStartNode(node.id);
              })
            }
            icon="🚪"
            label="Создать переход отсюда"
          />

          <div style={{ borderTop: '1px solid var(--editor-border)' }} />

          <MenuItem
            onClick={() => run(() => updateNode(node.id, { isPortal: !node.isPortal }))}
            icon={node.isPortal ? '⭐' : '☆'}
            label={node.isPortal ? 'Снять флаг портала' : 'Сделать порталом'}
          />

          <div style={{ borderTop: '1px solid var(--editor-border)' }} />

          <MenuItem onClick={() => run(() => removeNode(node.id))} icon="🗑️" label="Удалить узел" danger />
        </>
      )}

      {isLink && (
        <>
          <div
            className="px-3 py-2 text-xs"
            style={{
              color: 'var(--editor-text-muted)',
              borderBottom: '1px solid var(--editor-border)',
              backgroundColor: 'var(--editor-bg)',
            }}
          >
            Связь
          </div>

          <MenuItem
            onClick={() =>
              run(() => {
                if (contextMenu.edgeFrom && contextMenu.edgeTo) removeEdge(contextMenu.edgeFrom, contextMenu.edgeTo);
              })
            }
            icon="🔗"
            label="Удалить ребро"
            danger
          />

          <MenuItem
            onClick={() =>
              run(() => {
                if (contextMenu.edgeFrom && contextMenu.edgeTo) removeTransition(contextMenu.edgeFrom, contextMenu.edgeTo);
              })
            }
            icon="🚪"
            label="Удалить переход"
            danger
          />
        </>
      )}
    </div>
  );
};

const MenuItem: React.FC<{ onClick: () => void; icon: string; label: string; danger?: boolean }> = ({
  onClick,
  icon,
  label,
  danger,
}) => (
  <button
    onClick={onClick}
    className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors hover:bg-white/10"
    style={{ color: danger ? '#fca5a5' : 'white' }}
    type="button"
  >
    <span>{icon}</span>
    <span>{label}</span>
  </button>
);