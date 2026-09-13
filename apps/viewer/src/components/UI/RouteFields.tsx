import React, { useEffect, useState } from 'react';
import type { KeyboardEvent, RefObject } from 'react';
import { messagesFor, useLanguage } from '../../i18n';
import { useSuggestions } from '../../hooks/useSuggestions';
import { useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import type { RouteField } from '../../stores/routeStore';
import { ambiguousMatches } from '../../utils/ambiguity';
import { moveActiveOption } from '../../utils/listNavigation';
import { nodePlaceLabel } from '../../utils/placeLabels';

interface RouteFieldsProps {
  activeInput: RouteField | null;
  onFocusField: (field: RouteField) => void;
  /** Точка выбрана подсказкой или среди одноимённых мест. */
  onPointChosen: (field: RouteField, nodeId: string, label: string) => void;
  fromInputRef: RefObject<HTMLInputElement>;
  toInputRef: RefObject<HTMLInputElement>;
}

const LISTBOX_ID = 'route-suggestions';
const optionId = (index: number) => `route-suggestion-${index}`;

/**
 * Поля «Откуда» и «Куда» с подсказками.
 *
 * Поле — комбобокс по ARIA: стрелки двигают выбор по подсказкам, Enter
 * выбирает, Escape закрывает список. Фокус при этом остаётся в поле, а
 * экранный диктор читает выбранную подсказку через `aria-activedescendant`.
 * Раньше подсказки были просто кнопками под полем: с клавиатуры до них
 * добирались табуляцией, теряя введённый текст из виду.
 *
 * Подсказки вычисляются, а не хранятся: это чистая функция от запроса и
 * загруженных алиасов. Под полями — выбор среди одноимённых мест: точно
 * набранное неоднозначное название иначе оставляло поле неразрешённым без
 * объяснения.
 */
export const RouteFields: React.FC<RouteFieldsProps> = ({
  activeInput,
  onFocusField,
  onPointChosen,
  fromInputRef,
  toInputRef,
}) => {
  const fromQuery = useRouteStore((s) => s.fromQuery);
  const toQuery = useRouteStore((s) => s.toQuery);
  const fromNodeId = useRouteStore((s) => s.fromNodeId);
  const toNodeId = useRouteStore((s) => s.toNodeId);
  const setQuery = useRouteStore((s) => s.setQuery);
  const swapPoints = useRouteStore((s) => s.swapPoints);
  const graph = useMapStore((s) => s.graph);
  const aliasManager = useMapStore((s) => s.aliasManager);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const language = useLanguage();
  const messages = messagesFor(language);

  const activeQuery = activeInput === null ? '' : activeInput === 'from' ? fromQuery : toQuery;
  const activeNodeId = activeInput === null ? null : activeInput === 'from' ? fromNodeId : toNodeId;
  const suggestions = useSuggestions(activeQuery);

  const [activeOption, setActiveOption] = useState(-1);
  // Escape скрывает список до следующей правки текста: иначе он появлялся бы
  // снова на том же запросе при первой же перерисовке.
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);

  // Список, в котором только уже выбранная точка, не открывается: иначе он
  // выпадал при каждом переходе в заполненное поле табуляцией, и первый
  // Escape закрывал его вместо шторки. Другие места с похожим именем
  // по-прежнему показываются.
  const onlyChosenPoint = activeNodeId !== null && suggestions.every((s) => s.id === activeNodeId);
  const listOpen =
    activeInput !== null && suggestions.length > 0 && !onlyChosenPoint && dismissedQuery !== activeQuery;

  // Новый запрос или другое поле — выбор подсказки начинается заново.
  useEffect(() => {
    setActiveOption(-1);
  }, [activeQuery, activeInput]);

  const placeOf = (nodeId: string) =>
    graph && buildingMetas ? nodePlaceLabel(graph, buildingMetas, nodeId, language) : '';

  const handleKeyDown = (field: RouteField) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (!listOpen || activeInput !== field) return;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 'down' : 'up';
        setActiveOption((index) => moveActiveOption(index, suggestions.length, direction));
        break;
      }
      case 'Enter': {
        const suggestion = suggestions[activeOption];
        if (suggestion) {
          event.preventDefault();
          onPointChosen(field, suggestion.id, suggestion.alias);
        }
        break;
      }
      case 'Escape':
        // Сначала закрывается список, а не вся шторка: событие не должно
        // дойти до обработчика Escape у диалога.
        event.preventDefault();
        event.stopPropagation();
        setDismissedQuery(activeQuery);
        break;
    }
  };

  /** ARIA-атрибуты комбобокса для поля. */
  const comboboxProps = (field: RouteField) => {
    const expanded = listOpen && activeInput === field;
    return {
      role: 'combobox' as const,
      'aria-autocomplete': 'list' as const,
      'aria-expanded': expanded,
      'aria-controls': expanded ? LISTBOX_ID : undefined,
      'aria-activedescendant': expanded && activeOption >= 0 ? optionId(activeOption) : undefined,
      onKeyDown: handleKeyDown(field),
    };
  };

  const ambiguity = (['from', 'to'] as const)
    .map((field) => {
      const query = field === 'from' ? fromQuery : toQuery;
      const nodeId = field === 'from' ? fromNodeId : toNodeId;
      const nodeIds = nodeId === null ? ambiguousMatches(query, graph, aliasManager) : [];
      return { field, name: query.trim(), nodeIds };
    })
    .filter((entry) => entry.nodeIds.length > 0);

  return (
    <>
      <div className="flex gap-3 items-start">
        <div className="flex flex-col items-center pt-3" aria-hidden="true">
          <div className={`w-3 h-3 rounded-full ${fromNodeId ? 'bg-start' : 'bg-gray-300'}`} />
          <div className="w-0.5 bg-gray-200 my-2 h-10" />
          <div className={`w-3 h-3 rounded-full ${toNodeId ? 'bg-primary' : 'bg-gray-300'}`} />
        </div>

        <div className="flex-1 space-y-2">
          <input
            ref={fromInputRef}
            value={fromQuery}
            onChange={(e) => setQuery('from', e.target.value)}
            onFocus={() => onFocusField('from')}
            placeholder={messages.search.from}
            aria-label={messages.search.from}
            autoComplete="off"
            {...comboboxProps('from')}
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 focus:bg-white focus:border-start transition-colors"
          />

          <input
            ref={toInputRef}
            value={toQuery}
            onChange={(e) => setQuery('to', e.target.value)}
            onFocus={() => onFocusField('to')}
            placeholder={messages.search.to}
            aria-label={messages.search.to}
            autoComplete="off"
            {...comboboxProps('to')}
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 focus:bg-white focus:border-primary transition-colors"
          />
        </div>

        <button
          type="button"
          onClick={swapPoints}
          className="p-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors mt-2"
          title={messages.search.swap}
          aria-label={messages.search.swap}
        >
          ⇅
        </button>
      </div>

      {listOpen && activeInput && (
        <div
          id={LISTBOX_ID}
          role="listbox"
          aria-label={messages.search.suggestions}
          className="border border-gray-100 rounded-xl overflow-hidden"
        >
          {suggestions.map((s, i) => (
            <div
              key={`${s.id}-${i}`}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeOption}
              // Нажатие мышью не должно уводить фокус из поля: иначе поле
              // теряло бы комбобокс раньше, чем подсказка выбрана.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPointChosen(activeInput, s.id, s.alias)}
              className={`cursor-pointer px-4 py-3 transition-colors border-b border-gray-100 last:border-b-0 ${
                i === activeOption ? 'bg-primary/10' : 'hover:bg-gray-50'
              }`}
            >
              <div className="text-sm text-gray-800">{s.alias}</div>
              <div className="text-xs text-gray-600">{placeOf(s.id)}</div>
            </div>
          ))}
        </div>
      )}

      {ambiguity.map(({ field, name, nodeIds }) => (
        <div
          key={field}
          role="group"
          aria-label={messages.search.ambiguous(name)}
          className="rounded-xl border border-amber-200 bg-amber-50 p-3"
        >
          <div className="text-sm text-amber-900 mb-2">{messages.search.ambiguous(name)}</div>
          <div className="space-y-1">
            {nodeIds.map((nodeId) => (
              <button
                key={nodeId}
                type="button"
                onClick={() => onPointChosen(field, nodeId, name)}
                className="w-full px-3 py-2 rounded-lg bg-white text-left text-sm text-gray-800 hover:bg-amber-100 transition-colors"
              >
                {placeOf(nodeId) || nodeId}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
};
