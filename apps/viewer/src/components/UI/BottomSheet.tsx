import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PathfindingOptions, ViewScope } from '@campus-map/core';
import { useRouteStore, type RouteField } from '../../stores/routeStore';
import { scopeOf, useMapStore } from '../../stores/mapStore';
import { useSuggestions } from '../../hooks/useSuggestions';
import { formatFloor, messagesFor, useLanguage } from '../../i18n';
import type { Messages } from '../../i18n';
import { buildRouteSteps, formatDuration } from '../../utils/routeInstructions';
import { nodePlaceLabel, scopeLabel } from '../../utils/placeLabels';

/**
 * Нижняя панель: поиск маршрута и пошаговые инструкции.
 *
 * Единственное место в навигаторе, где показывается результат построения
 * маршрута. Прежний `RouteInfo.tsx` дублировал сводную карточку и не был
 * подключён, поэтому удалён.
 */

/**
 * Место свёрнутой карточки: над системной полосой iPhone, на широком экране —
 * у левого края, чтобы не закрывать середину карты с маршрутом. Высота
 * карточки учтена в `MAP_CHROME_INSETS`.
 */
const COLLAPSED_POSITION =
  'fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-3 right-3 md:left-4 md:right-auto md:w-96 z-[1000]';

/** Ограничения маршрута, вынесенные в интерфейс; подписи — в словаре. */
const OPTION_KEYS = [
  'allowStairs',
  'allowLift',
  'allowBridge',
  'allowEntrance',
  'preferLift',
] as const satisfies readonly (keyof PathfindingOptions & keyof Messages['route']['option'])[];

export const BottomSheet: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeInput, setActiveInput] = useState<RouteField | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  const fromInputRef = useRef<HTMLInputElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);

  const {
    fromQuery,
    toQuery,
    fromNodeId,
    toNodeId,
    currentRoute,
    options,
    setQuery,
    selectSuggestion,
    setOptions,
    buildRoute,
    clearRoute,
    swapPoints,
  } = useRouteStore();

  const graph = useMapStore((s) => s.graph);
  const aliasManager = useMapStore((s) => s.aliasManager);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const activeFloor = useMapStore((s) => s.activeFloor);
  const setActiveFloor = useMapStore((s) => s.setActiveFloor);
  const clearActiveFloor = useMapStore((s) => s.clearActiveFloor);

  const language = useLanguage();
  const messages = messagesFor(language);

  const scope = scopeOf(activeFloor);

  // Фокус на поле, которое пользователь только что выбрал.
  useEffect(() => {
    if (!isExpanded) return;
    if (activeInput === 'from') fromInputRef.current?.focus();
    if (activeInput === 'to') toInputRef.current?.focus();
  }, [isExpanded, activeInput]);

  // Подсказки вычисляются, а не хранятся: это чистая функция от запроса и
  // загруженных алиасов. Раньше два списка лежали в сторе и переписывались
  // на каждое нажатие клавиши.
  const activeQuery = activeInput === null ? '' : activeInput === 'from' ? fromQuery : toQuery;
  const suggestions = useSuggestions(activeQuery);

  const steps = useMemo(() => {
    if (!graph || !buildingMetas || !currentRoute?.found) return [];
    return buildRouteSteps({
      graph,
      path: currentRoute.path,
      buildingMetas,
      aliasManager,
      language,
    });
  }, [graph, buildingMetas, currentRoute, aliasManager, language]);

  const currentScopeLabel = buildingMetas ? scopeLabel(scope, buildingMetas, language) : '';

  const canBuild = fromNodeId !== null && toNodeId !== null;

  const close = () => {
    setIsExpanded(false);
    setActiveInput(null);
  };

  /** Переключает карту на область видимости шага маршрута. */
  const openScope = (target?: ViewScope) => {
    if (!target) return;
    if (target.mode === 'campus') {
      clearActiveFloor();
      return;
    }
    setActiveFloor(target.buildingId, target.floor);
  };

  const handleSuggestionClick = (field: RouteField, suggestionId: string, alias: string) => {
    selectSuggestion(field, { alias, id: suggestionId, score: 0 });

    // После выбора «откуда» переводим фокус на «куда» — это следующий шаг
    // естественного сценария.
    if (field === 'from') {
      setActiveInput('to');
      setTimeout(() => toInputRef.current?.focus(), 0);
    }
  };

  if (!isExpanded) {
    if (currentRoute?.found) {
      // Время в пути есть только в метрическом режиме. Без привязки планов к
      // территории его не показываем вовсе: выдуманное число хуже отсутствующего.
      const duration = currentRoute.durationSeconds;

      return (
        <div className={COLLAPSED_POSITION}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-green-400 to-green-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold" aria-hidden="true">✓</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-800">
                  {messages.route.ready}
                  {duration !== null && ` • ${formatDuration(duration, language)}`}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {fromQuery} → {toQuery}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsExpanded(true);
                  setActiveInput(null);
                }}
                className="px-3 py-2 rounded-xl text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              >
                {messages.route.showSteps}
              </button>

              <button
                type="button"
                onClick={clearRoute}
                className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
                aria-label={messages.route.resetRoute}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={COLLAPSED_POSITION}>
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-2">
          <button
            type="button"
            onClick={() => {
              setIsExpanded(true);
              setActiveInput('to');
            }}
            className="w-full p-2 rounded-xl flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold" aria-hidden="true">🔎</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-gray-800 font-medium truncate">{messages.search.prompt}</div>
              <div className="text-xs text-gray-500 truncate">{currentScopeLabel}</div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* На телефоне шторка закрывает карту, и затемнение подсказывает, что
          нажатие мимо её закроет. На широком экране панель стоит сбоку и
          карту с маршрутом не заслоняет — затемнять нечего. */}
      <div className="fixed inset-0 bg-black/20 z-[999] md:hidden" onClick={close} aria-hidden="true" />

      <div className="fixed bottom-0 left-0 right-0 md:bottom-4 md:left-4 md:right-auto md:w-96 z-[1000]">
        <div className="bg-white md:rounded-2xl rounded-t-3xl shadow-2xl border border-gray-100 overflow-hidden pb-[env(safe-area-inset-bottom)] md:pb-0">
          <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-gray-100">
            <div className="min-w-0">
              <div className="font-semibold text-gray-800">{messages.route.title}</div>
              <div className="text-xs text-gray-500 truncate">{messages.route.view(currentScopeLabel)}</div>
            </div>

            <button
              type="button"
              onClick={close}
              className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
              aria-label={messages.route.close}
            >
              ✕
            </button>
          </div>

          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
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
                  onFocus={() => setActiveInput('from')}
                  placeholder={messages.search.from}
                  aria-label={messages.search.from}
                  autoComplete="off"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 focus:bg-white focus:border-green-400 transition-colors"
                />

                <input
                  ref={toInputRef}
                  value={toQuery}
                  onChange={(e) => setQuery('to', e.target.value)}
                  onFocus={() => setActiveInput('to')}
                  placeholder={messages.search.to}
                  aria-label={messages.search.to}
                  autoComplete="off"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 focus:bg-white focus:border-blue-400 transition-colors"
                />
              </div>

              <button
                type="button"
                onClick={swapPoints}
                className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors mt-2"
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
                    onClick={() => handleSuggestionClick(activeInput, s.id, s.alias)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                  >
                    <div className="text-sm text-gray-800">{s.alias}</div>
                    <div className="text-xs text-gray-500">
                      {graph && buildingMetas ? nodePlaceLabel(graph, buildingMetas, s.id, language) : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Ограничения маршрута. Ядро поддерживало их всегда, но до этого
                момента пользователь не мог управлять ни одним. */}
            <div>
              <button
                type="button"
                onClick={() => setShowOptions((v) => !v)}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                aria-expanded={showOptions}
              >
                {showOptions ? '▾' : '▸'} {messages.route.options}
              </button>

              {showOptions && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {OPTION_KEYS.map((key) => {
                    const enabled = options[key] !== false;

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setOptions({ [key]: !enabled } as Partial<PathfindingOptions>)}
                        aria-pressed={enabled}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          enabled
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {messages.route.option[key]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  buildRoute();
                  setActiveInput(null);
                }}
                disabled={!canBuild}
                className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
                  canBuild
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {messages.route.build}
              </button>

              <button
                type="button"
                onClick={clearRoute}
                className="px-4 py-3 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                {messages.route.reset}
              </button>
            </div>

            {currentRoute?.found && steps.length > 0 && (
              <div className="pt-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {messages.route.stepsTitle}
                </div>

                <div className="space-y-2">
                  {steps.map((step, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-600 flex-shrink-0">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-gray-800">{step.text}</div>
                        {step.scope && (
                          <button
                            type="button"
                            onClick={() => openScope(step.scope)}
                            className="mt-1 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors"
                          >
                            {step.scope.mode === 'campus'
                              ? messages.route.openCampus
                              : messages.route.openFloor(formatFloor(step.scope.floor))}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentRoute && !currentRoute.found && (
              <div className="text-sm text-red-600">
                {/* Причина — по коду ядра: его текстовое описание рассчитано на
                    разработчика и существует только по-русски. */}
                {messages.route.notFound(messages.route.failure[currentRoute.reason ?? 'unreachable'])}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
