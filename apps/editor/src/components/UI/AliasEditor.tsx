import React, { useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';

interface AliasEditorProps {
  nodeId: string;
  onClose: () => void;
}

export const AliasEditor: React.FC<AliasEditorProps> = ({ nodeId, onClose }) => {
  const setNodeAliases = useEditorStore((s) => s.setNodeAliases);

  // Берём текущие алиасы один раз при открытии (локальная копия для редактирования)
  const initialAliases = useMemo(() => {
    const st = useEditorStore.getState();
    return st.getNodeAliases(nodeId);
  }, [nodeId]);

  const [aliases, setAliases] = useState<string[]>(initialAliases);
  const [newAlias, setNewAlias] = useState('');

  useEffect(() => {
    setAliases(initialAliases);
  }, [initialAliases]);

  const addAlias = () => {
    const v = newAlias.trim();
    if (!v) return;
    if (aliases.includes(v)) return;
    setAliases((prev) => [...prev, v]);
    setNewAlias('');
  };

  const removeAlias = (idx: number) => {
    setAliases((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = () => {
    // Сохраняем в store (после этого экспорт ZIP возьмёт их автоматически)
    setNodeAliases(nodeId, aliases);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center"
      onClick={onClose}
      style={{
        backgroundColor: 'rgba(0,0,0,0.65)', // гарантированно не прозрачная подложка
      }}
    >
      <div
        className="w-full max-w-md mx-4 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--editor-panel)', // гарантированно НЕ прозрачный фон
          border: '1px solid var(--editor-border)',
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-start justify-between"
          style={{ borderBottom: '1px solid var(--editor-border)' }}
        >
          <div className="min-w-0">
            <div className="text-white font-semibold">Алиасы узла</div>
            <div className="text-xs text-[color:var(--editor-text-muted)] mt-1 break-all">
              {nodeId}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--editor-text-muted)' }}
            onMouseEnter={(e) => ((e.currentTarget.style.backgroundColor = 'var(--editor-accent)'))}
            onMouseLeave={(e) => ((e.currentTarget.style.backgroundColor = 'transparent'))}
            aria-label="Закрыть"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {/* List */}
          <div
            className="rounded-lg overflow-hidden mb-4"
            style={{ border: '1px solid var(--editor-border)', backgroundColor: 'var(--editor-bg)' }}
          >
            {aliases.length === 0 ? (
              <div className="px-4 py-3 text-sm" style={{ color: 'var(--editor-text-muted)' }}>
                Алиасов пока нет.
              </div>
            ) : (
              <ul>
                {aliases.map((a, i) => (
                  <li
                    key={`${a}-${i}`}
                    className="px-4 py-2.5 flex items-center gap-3"
                    style={{ borderBottom: i === aliases.length - 1 ? 'none' : '1px solid var(--editor-border)' }}
                  >
                    <div className="flex-1 text-sm text-white break-words">{a}</div>
                    <button
                      onClick={() => removeAlias(i)}
                      className="p-1.5 rounded-md transition-colors"
                      title="Удалить"
                      style={{ color: 'var(--editor-text-muted)' }}
                      onMouseEnter={(e) => ((e.currentTarget.style.backgroundColor = 'var(--editor-accent)'))}
                      onMouseLeave={(e) => ((e.currentTarget.style.backgroundColor = 'transparent'))}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add */}
          <div className="flex gap-2">
            <input
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addAlias();
              }}
              placeholder="Например: Аудитория 305, 305, А-305"
              className="flex-1 px-3 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: 'var(--editor-bg)',
                border: '1px solid var(--editor-border)',
                color: 'white',
              }}
            />
            <button
              onClick={addAlias}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: 'var(--editor-accent)',
                color: 'white',
                opacity: newAlias.trim() ? 1 : 0.5,
              }}
              disabled={!newAlias.trim()}
            >
              Добавить
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-5 py-4 flex justify-end gap-2"
          style={{ borderTop: '1px solid var(--editor-border)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm transition-colors"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--editor-text-muted)',
            }}
            onMouseEnter={(e) => ((e.currentTarget.style.backgroundColor = 'var(--editor-accent)'))}
            onMouseLeave={(e) => ((e.currentTarget.style.backgroundColor = 'transparent'))}
          >
            Отмена
          </button>

          <button
            onClick={save}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--editor-highlight)',
              color: 'white',
            }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
};
