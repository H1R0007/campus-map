import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { searchNodeHits } from '../../utils/nodeSearch';
import { nodePlaceLabel, nodeTitle } from '../../utils/labels';
import { Icon } from './Icon';

/**
 * Поиск точки — строка в шапке (запись 74): по названию с опечатками, по id и
 * по координатам.
 *
 * Не кнопка, а поле: в него сразу щёлкают и печатают, Ctrl+F ставит в него
 * курсор. Пока поле пустое и не в фокусе, бледная подсказка «Ctrl+F» слева
 * напоминает клавишу. Найденное — выпадающим списком под полем; выбранный
 * результат открывает план точки, выделяет её и показывает в центре карты.
 * Esc очищает поле и возвращает фокус туда, где он был.
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
  const setWorkspace = useEditorStore((s) => s.setWorkspace);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  /** Где был фокус до Ctrl+F — туда он вернётся по Esc. */
  const returnFocus = useRef<HTMLElement | null>(null);

  const hits = useMemo(
    () => (searchOpen ? searchNodeHits(query, nodes, aliases, aliasTranslations) : []),
    [searchOpen, query, nodes, aliases, aliasTranslations]
  );

  useEffect(() => setActive(0), [query]);

  // Ctrl+F открывает поиск через хранилище — курсор встаёт в поле.
  useEffect(() => {
    const input = inputRef.current;
    if (!searchOpen || !input || document.activeElement === input) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    input.focus();
    input.select();
  }, [searchOpen]);

  const close = useCallback(
    (restoreFocus: boolean) => {
      setSearchOpen(false);
      setQuery('');
      if (!restoreFocus) return;
      const back = returnFocus.current;
      returnFocus.current = null;
      if (back && back !== document.body && back.isConnected) back.focus();
      else inputRef.current?.blur();
    },
    [setSearchOpen]
  );

  const choose = useCallback(
    (nodeId: string) => {
      addToSearchHistory(query);
      centerOnNode(nodeId);
      // Найденная точка — в «Разметке»: там её свойства (запись 60).
      setWorkspace('markup');
      returnFocus.current = null;
      setSearchOpen(false);
      setQuery('');
      inputRef.current?.blur();
    },
    [query, addToSearchHistory, centerOnNode, setWorkspace, setSearchOpen]
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
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
  };

  const showHistory = query.trim() === '' && searchHistory.length > 0;
  const showEmpty = query.trim() !== '' && hits.length === 0;
  const popupOpen = searchOpen && (showHistory || showEmpty || hits.length > 0);

  return (
    <div
      ref={rootRef}
      className="editor-find"
      role="search"
      aria-label="Поиск точки"
      // Фокус ушёл из поля и списка — список закрывается, запрос остаётся
      // нетронутым только пока человек в поиске.
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) close(false);
      }}
    >
      <label className="editor-find__field">
        {searchOpen || query ? (
          <Icon name="search" size={16} />
        ) : (
          <kbd className="editor-find__kbd" aria-hidden="true">
            Ctrl+F
          </kbd>
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!searchOpen) setSearchOpen(true);
          }}
          onFocus={() => !searchOpen && setSearchOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={popupOpen}
          aria-controls="editor-search-results"
          aria-activedescendant={hits[active] ? `editor-search-${hits[active].node.id}` : undefined}
          aria-autocomplete="list"
          aria-label="Поиск точки: название, id или координаты"
          aria-keyshortcuts="Control+F"
          placeholder={searchOpen ? 'Название, id или «100, 200»' : 'Поиск точки'}
          className="editor-find__input"
          spellCheck={false}
          autoComplete="off"
        />
      </label>

      {popupOpen && (
        // Щелчок по списку не уводит фокус из поля: иначе список закрылся бы
        // раньше, чем выбор дойдёт до результата.
        <div className="editor-find__popup" onMouseDown={(e) => e.preventDefault()}>
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

            {showEmpty && (
              <p className="editor-empty" role="status">
                Ничего не найдено. Поиск прощает опечатки и другую раскладку; попробуйте часть названия или id.
              </p>
            )}

            {hits.length > 0 && (
              <ul id="editor-search-results" role="listbox" aria-label="Найденные точки" className="editor-list">
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
      )}
    </div>
  );
};
