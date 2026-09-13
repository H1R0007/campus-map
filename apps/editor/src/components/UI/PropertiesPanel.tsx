import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { transitionTypeLabel, TRANSITION_TYPES } from '@campus-map/core';
import { TRANSITION_COLORS, TransitionGlyph } from '@campus-map/mapkit';
import type { TransitionType } from '@campus-map/core';
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
  const removeTransition = useEditorStore((s) => s.removeTransition);
  const getTransitionsForNode = useEditorStore((s) => s.getTransitionsForNode);
  const getNodeAliases = useEditorStore((s) => s.getNodeAliases);
  const setNodeAliases = useEditorStore((s) => s.setNodeAliases);
  const comment = useEditorStore((s) => s.getNodeComment(nodeId));
  const setNodeComment = useEditorStore((s) => s.setNodeComment);
  const selectSingleNode = useEditorStore((s) => s.selectSingleNode);
  const addBookmark = useEditorStore((s) => s.addBookmark);

  // Tool actions
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const setEdgeStartNode = useEditorStore((s) => s.setEdgeStartNode);
  const setTransitionStartNode = useEditorStore((s) => s.setTransitionStartNode);
  const setTransitionType = useEditorStore((s) => s.setTransitionType);

  const transitions = useMemo(() => getTransitionsForNode(nodeId), [getTransitionsForNode, nodeId]);
  const aliases = useMemo(() => getNodeAliases(nodeId), [getNodeAliases, nodeId]);

  const unconnectedNodes = useMemo(() => {
    if (!node) return [];
    return nodes.filter(n =>
      n.id !== nodeId &&
      !node.neighbors.includes(n.id)
    ).slice(0, 10);
  }, [nodes, node, nodeId]);

  const [xText, setXText] = useState('');
  const [yText, setYText] = useState('');
  const [showConnectPicker, setShowConnectPicker] = useState(false);
  const [showTransitionPicker, setShowTransitionPicker] = useState(false);

  // Inline alias editing
  const [editingAliasIndex, setEditingAliasIndex] = useState<number | null>(null);
  const [editingAliasValue, setEditingAliasValue] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const aliasInputRef = useRef<HTMLInputElement>(null);

  // Черновик заметки: правка уходит в стор (и в историю отмены) только по
  // завершению, а не на каждое нажатие клавиши.
  const [commentDraft, setCommentDraft] = useState(comment);
  const commentFocused = useRef(false);

  // Координаты читаются как примитивы, а не через объект узла: иначе эффект
  // перезапускался бы на любое изменение узла и сбрасывал несохранённый ввод.
  const nodeX = node?.x;
  const nodeY = node?.y;

  useEffect(() => {
    if (nodeX === undefined || nodeY === undefined) return;
    setXText(String(nodeX));
    setYText(String(nodeY));
  }, [nodeX, nodeY, nodeId]);

  // Смена узла — черновик перезаписывается безусловно, даже если поле
  // осталось в фокусе после программного изменения выделения.
  useEffect(() => {
    commentFocused.current = false;
    setCommentDraft(comment);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  // Значение изменилось извне (отмена или повтор действия) — подхватываем,
  // но только пока пользователь не печатает.
  useEffect(() => {
    if (!commentFocused.current) setCommentDraft(comment);
  }, [comment]);

  useEffect(() => {
    if (editingAliasIndex !== null && aliasInputRef.current) {
      aliasInputRef.current.focus();
      aliasInputRef.current.select();
    }
  }, [editingAliasIndex]);

  const commitXY = useCallback(() => {
    if (!node) return;
    const x = Number.isFinite(Number(xText)) ? Math.round(Number(xText)) : node.x;
    const y = Number.isFinite(Number(yText)) ? Math.round(Number(yText)) : node.y;
    if (x !== node.x || y !== node.y) {
      updateNode(node.id, { x, y });
    }
  }, [node, xText, yText, updateNode]);

  const commitComment = useCallback(() => {
    commentFocused.current = false;
    if (commentDraft !== comment) {
      setNodeComment(nodeId, commentDraft);
    }
  }, [comment, commentDraft, nodeId, setNodeComment]);

  // Alias handlers
  const startEditAlias = (index: number) => {
    setEditingAliasIndex(index);
    setEditingAliasValue(aliases[index]);
  };

  const saveEditAlias = () => {
    if (editingAliasIndex === null) return;
    const newValue = editingAliasValue.trim();
    if (newValue && newValue !== aliases[editingAliasIndex]) {
      const newAliases = [...aliases];
      newAliases[editingAliasIndex] = newValue;
      setNodeAliases(nodeId, newAliases);
    }
    setEditingAliasIndex(null);
    setEditingAliasValue('');
  };

  const cancelEditAlias = () => {
    setEditingAliasIndex(null);
    setEditingAliasValue('');
  };

  const addNewAlias = () => {
    const v = newAlias.trim();
    if (!v || aliases.includes(v)) return;
    setNodeAliases(nodeId, [...aliases, v]);
    setNewAlias('');
  };

  const removeAlias = (idx: number) => {
    setNodeAliases(nodeId, aliases.filter((_, i) => i !== idx));
  };

  // Start edge from this node
  const startEdgeFromHere = () => {
    setActiveTool('edge');
    setEdgeStartNode(nodeId);
    onClose();
  };

  // Start transition from this node
  const startTransitionFromHere = (type?: TransitionType) => {
    if (type) setTransitionType(type);
    setActiveTool('transition');
    setTransitionStartNode(nodeId);
    onClose();
  };

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
              {node.isPortal ? '⭐ Портал' : '☆ Портал'}
            </button>

            <button
              onClick={() => addBookmark(nodeId)}
              className="px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors hover:opacity-90"
              style={{ backgroundColor: 'var(--editor-accent)', color: 'white' }}
            >
              🔖 В закладки
            </button>
          </div>

          {/* Кнопки создания связей */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              onClick={startEdgeFromHere}
              className="px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors hover:opacity-90"
              style={{ backgroundColor: 'var(--editor-accent)', color: 'white' }}
              title="Начать создание ребра от этого узла"
            >
              🔗 Ребро отсюда
            </button>

            <button
              onClick={() => setShowTransitionPicker(!showTransitionPicker)}
              className="px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
              style={{
                backgroundColor: showTransitionPicker ? 'var(--editor-highlight)' : 'var(--editor-accent)',
                color: 'white',
              }}
            >
              🚪 Переход отсюда
            </button>
          </div>

          {/* Выбор типа перехода */}
          {showTransitionPicker && (
            <div className="mt-2 grid grid-cols-2 gap-1">
              {TRANSITION_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    startTransitionFromHere(type);
                    setShowTransitionPicker(false);
                  }}
                  className="px-2 py-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors hover:opacity-90"
                  style={{
                    backgroundColor: TRANSITION_COLORS[type],
                    color: 'white',
                  }}
                >
                  <TransitionGlyph type={type} size={14} /> {transitionTypeLabel(type)}
                </button>
              ))}
            </div>
          )}

          {/* Быстрое соединение */}
          <button
            onClick={() => setShowConnectPicker(!showConnectPicker)}
            className="w-full mt-2 px-3 py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors"
            style={{
              backgroundColor: showConnectPicker ? 'var(--editor-highlight)' : 'var(--editor-accent)',
              color: 'white',
            }}
          >
            ⚡ Быстро соединить с...
          </button>

          {showConnectPicker && unconnectedNodes.length > 0 && (
            <div className="mt-2 space-y-1">
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

        {/* Aliases - Inline Editing */}
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

          <div className="mt-2 space-y-1">
            {aliases.map((alias, idx) => (
              <div
                key={`${alias}-${idx}`}
                className="flex items-center gap-2 py-1"
              >
                {editingAliasIndex === idx ? (
                  <input
                    ref={aliasInputRef}
                    value={editingAliasValue}
                    onChange={(e) => setEditingAliasValue(e.target.value)}
                    onBlur={saveEditAlias}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEditAlias();
                      if (e.key === 'Escape') cancelEditAlias();
                    }}
                    className="flex-1 px-2 py-1 rounded text-sm"
                    style={{
                      backgroundColor: 'var(--editor-panel)',
                      border: '1px solid var(--editor-highlight)',
                      color: 'white',
                    }}
                  />
                ) : (
                  <span
                    className="flex-1 px-2 py-1 rounded text-sm cursor-pointer hover:bg-white/10 truncate"
                    onClick={() => startEditAlias(idx)}
                    title="Кликните для редактирования"
                    style={{ color: 'white' }}
                  >
                    {alias}
                  </span>
                )}

                <button
                  onClick={() => removeAlias(idx)}
                  className="p-1 rounded hover:bg-red-500/20 transition-colors"
                  style={{ color: '#fca5a5' }}
                  title="Удалить"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="mt-2 flex gap-2">
            <input
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addNewAlias()}
              placeholder="Новый алиас..."
              className="flex-1 px-3 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: 'var(--editor-panel)',
                border: '1px solid var(--editor-border)',
                color: 'white'
              }}
            />
            <button
              onClick={addNewAlias}
              disabled={!newAlias.trim()}
              className="px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--editor-highlight)', color: 'white' }}
            >
              +
            </button>
          </div>
        </section>

        {/* Рабочая заметка разметчика */}
        <section
          className="rounded-xl p-3"
          style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)' }}
        >
          <div
            className="text-xs uppercase tracking-wide"
            style={{ color: 'var(--editor-text-muted)' }}
          >
            📝 Заметка разметчика
          </div>

          <textarea
            value={commentDraft}
            rows={3}
            placeholder="Например: геометрия приблизительная, уточнить у коменданта"
            onChange={(e) => setCommentDraft(e.target.value)}
            onFocus={() => {
              commentFocused.current = true;
            }}
            onBlur={commitComment}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                commitComment();
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                commentFocused.current = false;
                setCommentDraft(comment);
                e.currentTarget.blur();
              }
            }}
            className="mt-2 w-full px-3 py-2 rounded-lg text-sm resize-y"
            style={{
              backgroundColor: 'var(--editor-panel)',
              border: '1px solid var(--editor-border)',
              color: 'white',
            }}
          />

          <div className="mt-1 flex items-start gap-2">
            <p className="text-xs flex-1" style={{ color: 'var(--editor-text-muted)' }}>
              Не влияет на маршруты и не показывается студентам — это пометка
              для команды разметки. Ctrl+Enter сохранить, Esc отменить.
            </p>
            {commentDraft !== comment && (
              <button
                onClick={commitComment}
                className="px-2 py-1 rounded text-xs font-medium shrink-0"
                style={{ backgroundColor: 'var(--editor-highlight)', color: 'white' }}
              >
                Сохранить
              </button>
            )}
          </div>
        </section>

        {/* Neighbors */}
        <section
          className="rounded-xl p-3"
          style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)' }}
        >
          <div
            className="text-xs uppercase tracking-wide"
            style={{ color: 'var(--editor-text-muted)' }}
          >
            🔗 Соседи ({node.neighbors.length})
          </div>

          <div
            className="mt-2 rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--editor-border)', backgroundColor: 'var(--editor-panel)' }}
          >
            {node.neighbors.length === 0 ? (
              <div className="px-3 py-2 text-xs" style={{ color: 'var(--editor-text-muted)' }}>
                Нет связей
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
                    >
                      {nb}
                    </button>
                    <button
                      onClick={() => removeEdge(node.id, nb)}
                      className="px-2 py-1 rounded-md text-xs hover:bg-red-500/20 transition-colors"
                      style={{ color: '#fca5a5' }}
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
                Нет переходов
              </div>
            ) : (
              <ul className="max-h-32 overflow-y-auto">
                {transitions.map((t, idx) => {
                  const other = t.fromNode === node.id ? t.toNode : t.fromNode;
                  const color = TRANSITION_COLORS[t.type];

                  return (
                    <li
                      key={`${t.fromNode}-${t.toNode}-${idx}`}
                      className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-white/5"
                      style={{ borderBottom: '1px solid var(--editor-border)' }}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className="px-1.5 py-0.5 rounded text-xs font-medium flex items-center gap-1"
                          style={{ backgroundColor: color, color: 'white' }}
                        >
                          <TransitionGlyph type={t.type} size={14} />
                        </span>
                        <button
                          onClick={() => selectSingleNode(other)}
                          className="font-mono text-xs truncate hover:text-white transition-colors"
                          style={{ color: 'var(--editor-text-muted)' }}
                        >
                          {other}
                        </button>
                      </div>
                      <button
                        onClick={() => removeTransition(t.fromNode, t.toNode)}
                        className="px-2 py-1 rounded-md text-xs hover:bg-red-500/20 transition-colors"
                        style={{ color: '#fca5a5' }}
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
          🗑️ Удалить
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
    <div className="text-sm text-white font-medium truncate">{value}</div>
  </div>
);
