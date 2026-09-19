import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { searchNodeHits } from '../../utils/nodeSearch';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { nodePlaceLabel, nodeTitle } from '../../utils/labels';
import { Icon } from './Icon';

/**
 * Поиск узла (Ctrl+F): по названию с опечатками, по id и по координатам.
 *
 * Выбранный результат открывает план узла, выделяет его и показывает в
 * центре карты.
 */
export const SearchPanel: React.FC = () => {
  const searchOpen = useEditorStore((s) => s.searchOpen);
  const setSearchOpen = useEditorStore((s) => s.setSearchOpen);
  const nodes = useEditorStore((s) => s.nodes);
  const aliases = useEditorStore((s) => s.aliases);
  const aliasTranslations = useEditorStore((s) => s.aliasTranslations);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const searchHistory = useEditorStore((s) => s.searchHistory);
  const addToSearchHistory = useEditorStore((s) => s.addToSearchHistory);
  const clearSearchHistory = useEditorStore((s) => s.clearSearchHistory);
  const centerOnNode = useEditorStore((s) => s.centerOnNode);
  const setInspectorTab = useEditorStore((s) => s.setInspectorTab);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const hits = useMemo(
    () => (searchOpen ? searchNodeHits(query, nodes, aliases, aliasTranslations) : []),
    [searchOpen, query, nodes, aliases, aliasTranslations]
  );

  useEffect(() => setActive(0), [query]);

  const close = useCallback(() => {
    setSearchOpen(false);
    setQuery('');
  }, [setSearchOpen]);

  useDialogFocus(searchOpen, dialogRef, close, inputRef);

  const choose = useCallback(
    (nodeId: string) => {
      addToSearchHistory(query);
      centerOnNode(nodeId);
      // Найденное показывается карточкой, даже если справа была проверка.
      setInspectorTab('properties', false);
      setSearchOpen(false);
      setQuery('');
    },
    [query, addToSearchHistory, centerOnNode, setInspectorTab, setSearchOpen]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault();
      choose(hits[active].node.id);
    }
  };

  if (!searchOpen) return null;

  const showHistory = query.trim() === '' && searchHistory.length > 0;

  return (
    <div className="editor-dialog-backdrop editor-dialog-backdrop--top" onClick={close}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Поиск узла"
        className="editor-search"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="editor-search__field">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls="editor-search-results"
            aria-activedescendant={hits[active] ? `editor-search-${hits[active].node.id}` : undefined}
            aria-autocomplete="list"
            aria-label="Название, id или координаты"
            placeholder="Название, id или координаты «100, 200»"
            className="editor-search__input"
          />
          <button type="button" className="editor-icon-button" onClick={close} aria-label="Закрыть поиск">
            <Icon name="close" />
          </button>
        </div>

        <div className="editor-search__body">
          {showHistory && (
            <div className="editor-search__history">
              <div className="editor-search__history-head">
                <span>Недавние запросы</span>
                <button type="button" className="editor-button editor-button--ghost" onClick={clearSearchHistory}>
                  Очистить
                </button>
              </div>
              {searchHistory.map((h) => (
                <button key={h} type="button" className="editor-list__main" onClick={() => setQuery(h)}>
                  <Icon name="clock" size={14} />
                  <span className="editor-list__name">{h}</span>
                </button>
              ))}
            </div>
          )}

          {query.trim() !== '' && hits.length === 0 && (
            <p className="editor-empty" role="status">
              Ничего не найдено. Поиск прощает опечатки и другую раскладку; попробуйте часть названия или id.
            </p>
          )}

          {hits.length > 0 && (
            <ul id="editor-search-results" role="listbox" aria-label="Найденные узлы" className="editor-list">
              {hits.map((hit, i) => {
                const title = nodeTitle(hit.node.id, aliases);
                return (
                  <li
                    key={hit.node.id}
                    id={`editor-search-${hit.node.id}`}
                    role="option"
                    aria-selected={i === active}
                    className={`editor-search__option${i === active ? ' editor-search__option--active' : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(hit.node.id)}
                  >
                    <span className="editor-list__text">
                      <span className="editor-list__name">{title}</span>
                      <span className="editor-list__sub">
                        {nodePlaceLabel(hit.node, buildingMetas)}
                        {hit.matched && hit.matched !== title && ` · нашлось по «${hit.matched}»`}
                        {title !== hit.node.id && ` · ${hit.node.id}`}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="editor-search__footer">
          <span>↑↓ — выбрать</span>
          <span>Enter — показать на карте</span>
          <span>Esc — закрыть</span>
          {hits.length > 0 && <span className="ml-auto">Найдено: {hits.length}</span>}
        </div>
      </div>
    </div>
  );
};
