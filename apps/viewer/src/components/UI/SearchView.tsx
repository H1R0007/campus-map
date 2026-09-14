import React, { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useChoosePlace } from '../../hooks/useChoosePlace';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useSuggestions } from '../../hooks/useSuggestions';
import { messagesFor, useLanguage } from '../../i18n';
import { useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import { useUiStore } from '../../stores/uiStore';
import type { SearchTarget } from '../../stores/uiStore';
import { moveActiveOption } from '../../utils/listNavigation';
import { nodePlaceLabel } from '../../utils/placeLabels';
import { portalTypeOf } from '../../utils/portals';
import { BuildingList } from './BuildingList';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { PlaceIcon } from './PlaceIcon';
import { RecentPlaces } from './RecentPlaces';

/** Сколько мест показывать: поиск занимает весь экран телефона, и восемь помещаются без прокрутки. */
const RESULT_LIMIT = 8;

const TITLE_ID = 'search-title';
const LISTBOX_ID = 'search-results';
const optionId = (index: number) => `search-result-${index}`;

/** Отметка окна поиска: по ней возврат фокуса понимает, что поиск открыт снова. */
const SEARCH_VIEW_ATTRIBUTE = 'data-search-view';

interface SearchViewProps {
  target: SearchTarget;
}

/**
 * Поиск места — окно во весь экран телефона, на широком экране — на месте
 * панели.
 *
 * Отдельное окно, а не поле в шторке: клавиатура телефона закрывает нижнюю
 * половину экрана, и подсказки в шторке оказывались под ней. Окно — диалог
 * (`useDialogFocus`), поле — комбобокс: стрелки выбирают, Enter подтверждает,
 * Escape закрывает поиск.
 *
 * Что делает выбор, зависит от цели: место показывается на карте с карточкой,
 * начало или конец маршрута задаются сразу (`useChoosePlace`). Пустой поиск
 * показывает недавние места и корпуса.
 */
export const SearchView: React.FC<SearchViewProps> = ({ target }) => {
  const graph = useMapStore((s) => s.graph);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const fromNodeId = useRouteStore((s) => s.fromNodeId);
  const toNodeId = useRouteStore((s) => s.toNodeId);
  const closeSearch = useUiStore((s) => s.closeSearch);
  const chooseFor = useChoosePlace();
  const language = useLanguage();
  const messages = messagesFor(language);

  const [query, setQuery] = useState('');
  const [activeOption, setActiveOption] = useState(-1);
  const { options, settled } = useSuggestions(query, RESULT_LIMIT);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Кнопка, открывшая поиск, — запоминается при первой отрисовке, до того как
  // поле заберёт фокус. Если фокуса на ней не было (Safari не переводит его на
  // кнопку при нажатии мышью), активен `body` — возвращать фокус туда значит
  // потерять его; тогда он уходит на главное в панели.
  const [opener] = useState(() => {
    const active = document.activeElement;
    return active instanceof HTMLElement && active !== document.body ? active : null;
  });

  useDialogFocus(containerRef, true, closeSearch);

  // Новый запрос — выбор подсказки начинается заново.
  useEffect(() => {
    setActiveOption(-1);
  }, [query]);

  // После закрытия фокус возвращается туда, откуда поиск открыли. Если той
  // кнопки уже нет — выбор сменил содержимое панели, — фокус получает главное
  // в новом содержимом. Ждём отрисовки нового содержимого; если за это время
  // поиск открылся снова (для второй точки), фокус остаётся в нём.
  useEffect(
    () => () => {
      setTimeout(() => {
        if (document.querySelector(`[${SEARCH_VIEW_ATTRIBUTE}]`)) return;
        if (opener?.isConnected) opener.focus();
        else document.querySelector<HTMLElement>('[data-panel-focus]')?.focus();
      }, 0);
    },
    [opener]
  );

  const choose = (nodeId: string) => chooseFor(target, nodeId);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (options.length === 0) return;
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 'down' : 'up';
      setActiveOption((index) => moveActiveOption(index, options.length, direction));
      return;
    }

    if (event.key === 'Enter') {
      // Подсвеченное место; единственное найденное — и без стрелок.
      const option = options[activeOption] ?? (options.length === 1 ? options[0] : undefined);
      if (option) {
        event.preventDefault();
        choose(option.id);
      }
    }
  };

  const trimmed = query.trim();
  const listOpen = options.length > 0;

  return (
    <div
      ref={containerRef}
      {...{ [SEARCH_VIEW_ATTRIBUTE]: '' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      className="fixed inset-0 z-[1100] flex flex-col bg-surface lg:inset-auto lg:top-4 lg:left-4 lg:w-[24rem] lg:max-h-[calc(100%-2rem)] lg:rounded-2xl lg:border lg:border-gray-100 lg:shadow-2xl"
    >
      <h2 id={TITLE_ID} className="sr-only">
        {messages.search.title[target]}
      </h2>

      <div className="flex items-center gap-1 pl-1 pr-3 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 border-b border-gray-100 lg:pt-2">
        <IconButton icon="back" label={messages.search.close} onClick={closeSearch} />

        <div className="flex-1 min-w-0 h-12 pl-3 rounded-xl bg-gray-100 flex items-center gap-2 focus-within:ring-2 focus-within:ring-accent">
          <Icon name="search" className="flex-shrink-0 text-gray-500" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={messages.search.placeholder[target]}
            aria-label={messages.search.placeholder[target]}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={listOpen}
            aria-controls={listOpen ? LISTBOX_ID : undefined}
            aria-activedescendant={listOpen && activeOption >= 0 ? optionId(activeOption) : undefined}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            className="campus-search-input flex-1 min-w-0 bg-transparent text-base text-gray-900 placeholder:text-gray-500"
          />
          {query !== '' && (
            <IconButton
              icon="close"
              label={messages.search.clear}
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
            />
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-2">
        {listOpen ? (
          <ul id={LISTBOX_ID} role="listbox" aria-label={messages.search.suggestions} className="space-y-0.5">
            {options.map((option, index) => {
              const node = graph?.getNode(option.id);
              const transition = graph && node?.isPortal ? portalTypeOf(graph, node) : null;

              return (
                <li
                  key={option.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeOption}
                  // Нажатие мышью не уводит фокус из поля: иначе комбобокс
                  // терял бы его раньше, чем место выбрано.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option.id)}
                  className={`min-h-[3.5rem] px-3 py-2 rounded-xl flex items-center gap-3 cursor-pointer transition-colors ${
                    index === activeOption ? 'bg-selected' : 'hover:bg-gray-50'
                  }`}
                >
                  <PlaceIcon transition={transition} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-base text-gray-900 truncate">{option.name}</span>
                    {option.matched !== null && (
                      <span className="block text-sm text-gray-600 truncate">{option.matched}</span>
                    )}
                    <span className="block text-sm text-gray-500 truncate">
                      {graph && buildingMetas ? nodePlaceLabel(graph, buildingMetas, option.id, language) : ''}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : trimmed !== '' ? (
          // Пока запрос не устоялся (задержка поиска), «ничего не нашлось» не
          // показываем: иначе оно мигало бы на каждой букве.
          settled && (
            <p role="status" className="px-4 py-8 text-center text-sm text-gray-600">
              {messages.search.nothingFound(trimmed)}
            </p>
          )
        ) : (
          <div className="px-2 py-2 space-y-5">
            <p className="px-1 text-sm text-gray-600">{messages.search.hint}</p>
            {/* Уже заданная точка маршрута как вторая точка ничего не даст —
                маршрут из места в него же. */}
            <RecentPlaces onChoose={choose} exclude={target === 'place' ? [] : [fromNodeId, toNodeId]} />
            {target === 'place' && <BuildingList onChoose={closeSearch} />}
          </div>
        )}
      </div>
    </div>
  );
};
