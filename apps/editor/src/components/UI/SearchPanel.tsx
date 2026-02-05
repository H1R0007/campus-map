import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';

export const SearchPanel: React.FC = () => {
  const searchOpen = useEditorStore((s) => s.searchOpen);
  const setSearchOpen = useEditorStore((s) => s.setSearchOpen);
  const searchNodes = useEditorStore((s) => s.searchNodes);
  const searchHistory = useEditorStore((s) => s.searchHistory);
  const addToSearchHistory = useEditorStore((s) => s.addToSearchHistory);
  const clearSearchHistory = useEditorStore((s) => s.clearSearchHistory);
  const centerOnNode = useEditorStore((s) => s.centerOnNode);
  const getNodeAliases = useEditorStore((s) => s.getNodeAliases);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ReturnType<typeof searchNodes>>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [searchOpen]);

  useEffect(() => {
    if (query.trim()) {
      setResults(searchNodes(query));
      setSelectedIndex(0);
    } else {
      setResults([]);
    }
  }, [query, searchNodes]);

  const handleSelect = useCallback((nodeId: string) => {
    addToSearchHistory(query);
    centerOnNode(nodeId);
    setSearchOpen(false);
    setQuery('');
  }, [query, addToSearchHistory, centerOnNode, setSearchOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex].id);
    } else if (e.key === 'Escape') {
      setSearchOpen(false);
      setQuery('');
    }
  }, [results, selectedIndex, handleSelect, setSearchOpen]);

  if (!searchOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[2500] flex items-start justify-center pt-20"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={() => { setSearchOpen(false); setQuery(''); }}
    >
      <div
        className="w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--editor-panel)', border: '1px solid var(--editor-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="p-4" style={{ borderBottom: '1px solid var(--editor-border)' }}>
          <div className="flex items-center gap-3">
            <span className="text-xl">🔍</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="ID, алиас или координаты (100, 200)..."
              className="flex-1 bg-transparent text-white text-lg outline-none"
              style={{ caretColor: 'var(--editor-highlight)' }}
            />
            <kbd className="px-2 py-1 rounded text-xs" style={{ backgroundColor: 'var(--editor-bg)', color: 'var(--editor-text-muted)' }}>
              ESC
            </kbd>
          </div>
          <div className="text-xs mt-2" style={{ color: 'var(--editor-text-muted)' }}>
            Подсказка: для поиска по координатам введите "100, 200" или "100 200"
          </div>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {query.trim() === '' && searchHistory.length > 0 && (
            <div className="p-2">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>История поиска</span>
                <button onClick={clearSearchHistory} className="text-xs hover:underline" style={{ color: 'var(--editor-text-muted)' }}>
                  Очистить
                </button>
              </div>
              {searchHistory.map((h, i) => (
                <button key={i} onClick={() => setQuery(h)} className="w-full px-3 py-2 text-left text-sm rounded-lg hover:bg-white/10" style={{ color: 'white' }}>
                  🕐 {h}
                </button>
              ))}
            </div>
          )}

          {query.trim() !== '' && results.length === 0 && (
            <div className="p-8 text-center" style={{ color: 'var(--editor-text-muted)' }}>
              Ничего не найдено
            </div>
          )}

          {results.map((node, i) => {
            const aliases = getNodeAliases(node.id);
            const isSelected = i === selectedIndex;

            return (
              <button
                key={node.id}
                onClick={() => handleSelect(node.id)}
                className="w-full px-4 py-3 text-left flex items-center gap-3 transition-colors"
                style={{ backgroundColor: isSelected ? 'var(--editor-highlight)' : 'transparent' }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className="text-lg">{node.isPortal ? '⭐' : '📍'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-medium truncate">
                    {aliases[0] || node.id}
                  </div>
                  <div className="text-xs truncate" style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--editor-text-muted)' }}>
                    {node.building} / Этаж {node.floor} • ({node.x}, {node.y})
                  </div>
                </div>
                <div className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>
                  {node.neighbors.length} связей
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 flex items-center gap-4 text-xs" style={{ borderTop: '1px solid var(--editor-border)', color: 'var(--editor-text-muted)' }}>
          <span>↑↓ навигация</span>
          <span>Enter выбрать</span>
          <span>Esc закрыть</span>
          <span className="ml-auto">Найдено: {results.length}</span>
        </div>
      </div>
    </div>
  );
};