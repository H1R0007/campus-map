import React, { useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { Icon } from './Icon';

export const BookmarksPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const bookmarks = useEditorStore((s) => s.bookmarks);
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const getNode = useEditorStore((s) => s.getNode);

  const addBookmark = useEditorStore((s) => s.addBookmark);
  const removeBookmark = useEditorStore((s) => s.removeBookmark);
  const renameBookmark = useEditorStore((s) => s.renameBookmark);
  const goToBookmark = useEditorStore((s) => s.goToBookmark);

  const bookmarkList = Array.from(bookmarks.entries())
    .map(([id, bm]) => ({ id, ...bm }))
    .sort((a, b) => b.createdAt - a.createdAt);

  const selectedNodeId = selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null;
  const canAddBookmark = selectedNodeId && !bookmarkList.some(bm => bm.nodeId === selectedNodeId);

  const startEdit = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  };

  const saveEdit = () => {
    if (editingId && editName.trim()) {
      renameBookmark(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName('');
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="px-3 py-2 rounded-xl text-sm font-medium shadow-lg transition-colors hover:opacity-90"
        style={{
          backgroundColor: 'var(--editor-panel)',
          border: '1px solid var(--editor-border)',
          color: 'white',
        }}
        title="Закладки"
      >
        <span className="inline-flex items-center gap-2"><Icon name="bookmark" />Закладки {bookmarkList.length > 0 && `(${bookmarkList.length})`}</span>
      </button>
    );
  }

  return (
    <div
      className="w-72 rounded-2xl shadow-2xl overflow-hidden"
      style={{
        backgroundColor: 'var(--editor-panel)',
        border: '1px solid var(--editor-border)',
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--editor-border)' }}
      >
        <div className="text-white font-semibold flex items-center gap-2"><Icon name="bookmark" />Закладки</div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 rounded hover:bg-white/10"
          style={{ color: 'var(--editor-text-muted)' }}
        >
          ✕
        </button>
      </div>

      {/* Add bookmark */}
      {canAddBookmark && (
        <div
          className="px-4 py-3"
          style={{ borderBottom: '1px solid var(--editor-border)' }}
        >
          <button
            onClick={() => addBookmark(selectedNodeId!)}
            className="w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: 'var(--editor-highlight)', color: 'white' }}
          >
            + Добавить выбранный узел
          </button>
        </div>
      )}

      {/* List */}
      <div className="max-h-80 overflow-y-auto">
        {bookmarkList.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--editor-text-muted)' }}>
            Нет закладок.<br />
            Выберите узел и добавьте его.
          </div>
        ) : (
          bookmarkList.map((bm) => {
            const node = getNode(bm.nodeId);
            const isEditing = editingId === bm.id;

            return (
              <div
                key={bm.id}
                className="px-4 py-3 hover:bg-white/5 transition-colors"
                style={{ borderBottom: '1px solid var(--editor-border)' }}
              >
                {isEditing ? (
                  <div className="flex gap-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                      className="flex-1 px-2 py-1 rounded text-sm"
                      style={{
                        backgroundColor: 'var(--editor-bg)',
                        border: '1px solid var(--editor-border)',
                        color: 'white',
                      }}
                    />
                    <button
                      onClick={saveEdit}
                      className="px-2 py-1 rounded text-xs"
                      style={{ backgroundColor: 'var(--editor-highlight)', color: 'white' }}
                    >
                      ✓
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => goToBookmark(bm.id)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="text-sm text-white truncate">{bm.name}</div>
                      <div className="text-xs truncate" style={{ color: 'var(--editor-text-muted)' }}>
                        {node ? `${node.building} / ${node.floor}` : 'Узел не найден'}
                      </div>
                    </button>

                    <button
                      onClick={() => startEdit(bm.id, bm.name)}
                      className="p-1 rounded hover:bg-white/10"
                      style={{ color: 'var(--editor-text-muted)' }}
                      title="Переименовать"
                    >
                      <Icon name="edit" size={14} />
                    </button>

                    <button
                      onClick={() => removeBookmark(bm.id)}
                      className="p-1 rounded hover:bg-red-500/20"
                      style={{ color: '#fca5a5' }}
                      title="Удалить"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
