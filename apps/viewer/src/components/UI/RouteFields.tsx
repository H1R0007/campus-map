import React from 'react';
import type { RefObject } from 'react';
import { messagesFor, useLanguage } from '../../i18n';
import { useSuggestions } from '../../hooks/useSuggestions';
import { useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import type { RouteField } from '../../stores/routeStore';
import { ambiguousMatches } from '../../utils/ambiguity';
import { nodePlaceLabel } from '../../utils/placeLabels';

interface RouteFieldsProps {
  activeInput: RouteField | null;
  onFocusField: (field: RouteField) => void;
  /** Точка выбрана подсказкой или среди одноимённых мест. */
  onPointChosen: (field: RouteField, nodeId: string, label: string) => void;
  fromInputRef: RefObject<HTMLInputElement>;
  toInputRef: RefObject<HTMLInputElement>;
}

/**
 * Поля «Откуда» и «Куда» с подсказками.
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
  const suggestions = useSuggestions(activeQuery);

  const placeOf = (nodeId: string) =>
    graph && buildingMetas ? nodePlaceLabel(graph, buildingMetas, nodeId, language) : '';

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
          <div className={`w-3 h-3 rounded-full ${fromNodeId ? 'bg-green-500' : 'bg-gray-300'}`} />
          <div className="w-0.5 bg-gray-200 my-2 h-10" />
          <div className={`w-3 h-3 rounded-full ${toNodeId ? 'bg-blue-500' : 'bg-gray-300'}`} />
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
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 focus:bg-white focus:border-green-400 transition-colors"
          />

          <input
            ref={toInputRef}
            value={toQuery}
            onChange={(e) => setQuery('to', e.target.value)}
            onFocus={() => onFocusField('to')}
            placeholder={messages.search.to}
            aria-label={messages.search.to}
            autoComplete="off"
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 focus:bg-white focus:border-blue-400 transition-colors"
          />
        </div>

        <button
          type="button"
          onClick={swapPoints}
          className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors mt-2"
          title={messages.search.swap}
          aria-label={messages.search.swap}
        >
          ⇅
        </button>
      </div>

      {activeInput && suggestions.length > 0 && (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={`${s.id}-${i}`}
              type="button"
              onClick={() => onPointChosen(activeInput, s.id, s.alias)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
            >
              <div className="text-sm text-gray-800">{s.alias}</div>
              <div className="text-xs text-gray-600">{placeOf(s.id)}</div>
            </button>
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
