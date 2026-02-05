import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';

export const PropertiesPanel: React.FC = () => {
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const clearSelection = useEditorStore((s) => s.clearSelection);

  const selectedIds = Array.from(selectedNodeIds);
  const nodeId = selectedIds.length === 1 ? selectedIds[0] : null;

  if (!nodeId) return null;

  return <PropertiesPanelInner nodeId={nodeId} onClose={clearSelection} />;
};

const PropertiesPanelInner: React.FC<{ nodeId: string; onClose: () => void }> = ({ nodeId, onClose }) => {
  const node = useEditorStore((s) => s.getNode(nodeId));
  const nodes = useEditorStore((s) => s.getNodesForCurrentFloor());
  const updateNode = useEditorStore((s) => s.updateNode);
  const removeNode = useEditorStore((s) => s.removeNode);
  const addEdge = useEditorStore((s) => s.addEdge);
  const removeEdge = useEditorStore((s) => s.removeEdge);
  const addTransition = useEditorStore((s) => s.addTransition);
  const removeTransition = useEditorStore((s) => s.removeTransition);
  const getTransitionsForNode = useEditorStore((s) => s.getTransitionsForNode);
  const getNodeAliases = useEditorStore((s) => s.getNodeAliases);
  const setNodeAliases = useEditorStore((s) => s.setNodeAliases);
  const selectSingleNode = useEditorStore((s) => s.selectSingleNode);
  const transitionType = useEditorStore((s) => s.transitionType);

  const transitions = useMemo(() => getTransitionsForNode(nodeId), [getTransitionsForNode, nodeId]);
  const aliases = useMemo(() => getNodeAliases(nodeId), [getNodeAliases, nodeId]);

  // Узлы без связи с текущим (для быстрого добавления рёбер)
  const unconnectedNodes = useMemo(() => {
    if (!node) return [];
    return nodes.filter(n => 
      n.id !== nodeId && 
      !node.neighbors.includes(n.id)
    ).slice(0, 10); // Показываем первые 10
  }, [nodes, node, nodeId]);

  const [xText, setXText] = useState('');
  const [yText, setYText] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [showConnectPicker, setShowConnectPicker] = useState(false);

  useEffect(() => {
    if (!node) return;
    setXText(String(node.x));
    setYText(String(node.y));
  }, [node?.x, node?.y, nodeId]);

  const commitXY = useCallback(() => {
    if (!node) return;
    const x = Number.isFinite(Number(xText)) ? Math.round(Number(xText)) : node.x;
    const y = Number.isFinite(Number(yText)) ? Math.round(Number(yText)) : node.y;
    if (x !== node.x || y !== node.y) {
      updateNode(node.id, { x, y });
    }
  }, [node, xText, yText, updateNode]);

  const addAlias = useCallback(() => {
    const v = newAlias.trim();
    if (!v) return;
    if (aliases.includes(v)) return;
    setNodeAliases(nodeId, [...aliases, v]);
    setNewAlias('');
  }, [newAlias, aliases, setNodeAliases, nodeId]);

  const removeAlias = useCallback((idx: number) => {
    const next = aliases.filter((_, i) => i !== idx);
    setNodeAliases(nodeId, next);
  }, [aliases, setNodeAliases, nodeId]);

  if (!node) return null;

  return (
    <div
      className="absolute top-3 right-3 bottom-10 w-[380px] z-[1600] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
      style={{
        backgroundColor: 'var(--editor-panel)',
        border: '1px solid var(--editor-border)',
      }}
    >
      {/* Header */}
      <div 
        className="px-4 py-3 flex items-start justify-between" 
        style={{ borderBottom: '1px solid var(--editor-border)' }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold">Свойства</span>
            {node.isPortal && (
              <span 
                className="px-2 py-0.5 rounded text-xs font-medium"
                style={{ backgroundColor: '#f59e0b', color: 'white' }}
              >
                Портал
              </span>
            )}
          </div>
          <div 
            className="text-xs font-mono break-all mt-1" 
            style={{ color: 'var(--editor-text-muted)' }}
          >
            {node.id}
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-white/10 transition-colors"
          style={{ color: 'var(--editor-text-muted)' }}
          title="Закрыть (Escape)"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {/* Quick Actions */}
        <section 
          className="rounded-xl p-3" 
          style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)' }}
        >
          <div 
            className="text-xs uppercase tracking-wide mb-2" 
            style={{ color: 'var(--editor-text-muted)' }}
          >
            Быстрые действия
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => updateNode(node.id, { isPortal: !node.isPortal })}
              className="px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
              style={{ 
                backgroundColor: node.isPortal ? '#f59e0b' : 'var(--editor-accent)',
                color: 'white',
              }}
            >
              {node.isPortal ? '⭐ Портал' : '☆ Сделать порталом'}
            </button>
            
            <button
              onClick={() => setShowConnectPicker(!showConnectPicker)}
              className="px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
              style={{ 
                backgroundColor: showConnectPicker ? 'var(--editor-highlight)' : 'var(--editor-accent)',
                color: 'white',
              }}
            >
              🔗 Соединить с...
            </button>
          </div>

          {/* Connect Picker */}
          {showConnectPicker && unconnectedNodes.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>
                Выберите узел для соединения:
              </div>
              <div 
                className="max-h-32 overflow-y-auto rounded-lg p-1"
                style={{ backgroundColor: 'var(--editor-panel)' }}
              >
                {unconnectedNodes.map(n => (
                  <button
                    key={n.id}
                    onClick={() => {
                      addEdge(node.id, n.id);
                      setShowConnectPicker(false);
                    }}
                    className="w-full px-2 py-1.5 text-left text-xs font-mono rounded hover:bg-white/10 transition-colors truncate"
                    style={{ color: 'var(--editor-text-muted)' }}
                  >
                    {n.id}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Context */}
        <section 
          className="rounded-xl p-3" 
          style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)' }}
        >
          <div 
            className="text-xs uppercase tracking-wide" 
            style={{ color: 'var(--editor-text-muted)' }}
          >
            Контекст
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <InfoBox label="Корпус" value={node.building} />
            <InfoBox label="Этаж" value={String(node.floor)} />
          </div>
        </section>

        {/* Position */}
        <section 
          className="rounded-xl p-3" 
          style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)' }}
        >
          <div 
            className="text-xs uppercase tracking-wide" 
            style={{ color: 'var(--editor-text-muted)' }}
          >
            Позиция
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>X</label>
              <input
                value={xText}
                onChange={(e) => setXText(e.target.value)}
                onBlur={commitXY}
                onKeyDown={(e) => e.key === 'Enter' && commitXY()}
                className="mt-1 w-full px-3 py-2 rounded-lg text-sm"
                style={{ 
                  backgroundColor: 'var(--editor-panel)', 
                  border: '1px solid var(--editor-border)', 
                  color: 'white' 
                }}
              />
            </div>
            <div>
              <label className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>Y</label>
              <input
                value={yText}
                onChange={(e) => setYText(e.target.value)}
                onBlur={commitXY}
                onKeyDown={(e) => e.key === 'Enter' && commitXY()}
                className="mt-1 w-full px-3 py-2 rounded-lg text-sm"
                style={{ 
                  backgroundColor: 'var(--editor-panel)', 
                  border: '1px solid var(--editor-border)', 
                  color: 'white' 
                }}
              />
            </div>
          </div>
        </section>

        {/* Neighbors */}
        <section 
          className="rounded-xl p-3" 
          style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)' }}
        >
          <div className="flex items-center justify-between">
            <div 
              className="text-xs uppercase tracking-wide" 
              style={{ color: 'var(--editor-text-muted)' }}
            >
              🔗 Соседи ({node.neighbors.length})
            </div>
          </div>

          <div 
            className="mt-2 rounded-lg overflow-hidden" 
            style={{ border: '1px solid var(--editor-border)', backgroundColor: 'var(--editor-panel)' }}
          >
            {node.neighbors.length === 0 ? (
              <div className="px-3 py-2 text-xs" style={{ color: 'var(--editor-text-muted)' }}>
                Нет связей. Используйте инструмент "Ребро" или кнопку "Соединить с..."
              </div>
            ) : (
              <ul className="max-h-32 overflow-y-auto">
                {node.neighbors.map((nb) => (
                  <li
                    key={nb}
                    className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-white/5"
                    style={{ borderBottom: '1px solid var(--editor-border)' }}
                  >
                    <button
                      onClick={() => selectSingleNode(nb)}
                      className="text-xs font-mono truncate flex-1 text-left hover:text-white transition-colors"
                      style={{ color: 'var(--editor-text-muted)' }}
                      title="Перейти к узлу"
                    >
                      {nb}
                    </button>
                    <button
                      onClick={() => removeEdge(node.id, nb)}
                      className="px-2 py-1 rounded-md text-xs hover:bg-red-500/20 transition-colors"
                      style={{ color: '#fca5a5' }}
                      title="Удалить ребро"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Transitions */}
        <section 
          className="rounded-xl p-3" 
          style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)' }}
        >
          <div 
            className="text-xs uppercase tracking-wide" 
            style={{ color: 'var(--editor-text-muted)' }}
          >
            🚪 Переходы ({transitions.length})
          </div>

          <div 
            className="mt-2 rounded-lg overflow-hidden" 
            style={{ border: '1px solid var(--editor-border)', backgroundColor: 'var(--editor-panel)' }}
          >
            {transitions.length === 0 ? (
              <div className="px-3 py-2 text-xs" style={{ color: 'var(--editor-text-muted)' }}>
                Нет переходов. Используйте инструмент "Переход" для связи с другими этажами/корпусами.
              </div>
            ) : (
              <ul className="max-h-32 overflow-y-auto">
                {transitions.map((t, idx) => {
                  const other = t.fromNode === node.id ? t.toNode : t.fromNode;
                  const typeColors: Record<string, string> = {
                    stairs: '#22c55e',
                    lift: '#3b82f6',
                    door: '#f59e0b',
                    bridge: '#a855f7',
                  };
                  
                  return (
                    <li
                      key={`${t.fromNode}-${t.toNode}-${idx}`}
                      className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-white/5"
                      style={{ borderBottom: '1px solid var(--editor-border)' }}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span 
                          className="px-1.5 py-0.5 rounded text-xs font-medium"
                          style={{ backgroundColor: typeColors[t.type] || '#6b7280', color: 'white' }}
                        >
                          {t.type}
                        </span>
                        <span 
                          className="font-mono text-xs truncate" 
                          style={{ color: 'var(--editor-text-muted)' }}
                        >
                          → {other}
                        </span>
                      </div>
                      <button
                        onClick={() => removeTransition(t.fromNode, t.toNode)}
                        className="px-2 py-1 rounded-md text-xs hover:bg-red-500/20 transition-colors"
                        style={{ color: '#fca5a5' }}
                        title="Удалить переход"
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Aliases */}
        <section 
          className="rounded-xl p-3" 
          style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)' }}
        >
          <div 
            className="text-xs uppercase tracking-wide" 
            style={{ color: 'var(--editor-text-muted)' }}
          >
            🏷️ Алиасы ({aliases.length})
          </div>

          {aliases.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {aliases.map((a, idx) => (
                <span
                  key={`${a}-${idx}`}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs"
                  style={{ 
                    backgroundColor: 'var(--editor-panel)', 
                    border: '1px solid var(--editor-border)', 
                    color: 'white' 
                  }}
                >
                  <span className="max-w-[150px] truncate">{a}</span>
                  <button
                    onClick={() => removeAlias(idx)}
                    className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-red-500/20 transition-colors"
                    style={{ color: '#fca5a5' }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mt-2 flex gap-2">
            <input
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addAlias()}
              placeholder="Аудитория 305, А-305..."
              className="flex-1 px-3 py-2 rounded-lg text-sm"
              style={{ 
                backgroundColor: 'var(--editor-panel)', 
                border: '1px solid var(--editor-border)', 
                color: 'white' 
              }}
            />
            <button
              onClick={addAlias}
              disabled={!newAlias.trim()}
              className="px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--editor-highlight)', color: 'white' }}
            >
              +
            </button>
          </div>
        </section>
      </div>

      {/* Footer */}
      <div 
        className="p-4 flex gap-2" 
        style={{ borderTop: '1px solid var(--editor-border)' }}
      >
        <button
          onClick={() => {
            removeNode(node.id);
            onClose();
          }}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-red-500/30"
          style={{ backgroundColor: 'rgba(239,68,68,0.18)', color: '#fca5a5' }}
        >
          🗑️ Удалить узел
        </button>

        <button
          onClick={onClose}
          className="px-4 py-2.5 rounded-xl text-sm transition-colors hover:bg-white/10"
          style={{ backgroundColor: 'var(--editor-accent)', color: 'white' }}
        >
          Скрыть
        </button>
      </div>
    </div>
  );
};

const InfoBox: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div 
    className="rounded-lg p-2" 
    style={{ backgroundColor: 'var(--editor-panel)', border: '1px solid var(--editor-border)' }}
  >
    <div className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>{label}</div>
    <div className="text-sm text-white font-medium">{value}</div>
  </div>
);