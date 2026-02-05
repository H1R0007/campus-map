import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouteStore } from '../../stores/routeStore';
import { useMapStore } from '../../stores/mapStore';
import { buildRouteSteps } from '../../utils/routeInstructions';

export const BottomSheet: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeInput, setActiveInput] = useState<'from' | 'to' | null>(null);

  const fromInputRef = useRef<HTMLInputElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);

  const {
    fromQuery,
    toQuery,
    fromSuggestions,
    toSuggestions,
    fromNodeId,
    toNodeId,
    currentRoute,
    setFromQuery,
    setToQuery,
    setActiveField,
    selectSuggestion,
    buildRoute,
    clearRoute,
    swapPoints,
  } = useRouteStore();

  const graph = useMapStore((s) => s.graph);
  const aliasManager = useMapStore((s) => s.aliasManager);
  const buildingMetas = useMapStore((s) => s.buildingMetas);

  const viewMode = useMapStore((s) => s.viewMode);
  const activeFloor = useMapStore((s) => s.activeFloor);
  const setActiveFloor = useMapStore((s) => s.setActiveFloor);
  const clearActiveFloor = useMapStore((s) => s.clearActiveFloor);

  // focus
  useEffect(() => {
    if (!isExpanded) return;
    if (activeInput === 'from') fromInputRef.current?.focus();
    if (activeInput === 'to') toInputRef.current?.focus();
  }, [isExpanded, activeInput]);

  const suggestions = activeInput === 'from' ? fromSuggestions : toSuggestions;

  const steps = useMemo(() => {
    if (!graph || !currentRoute?.found) return [];
    return buildRouteSteps({
      graph,
      path: currentRoute.path,
      buildingMetas,
      aliasManager: aliasManager ?? null,
    });
  }, [graph, currentRoute, buildingMetas, aliasManager]);

  const openHint = (hint?: { mode: 'campus' | 'floor'; buildingId?: string; floor?: number }) => {
    if (!hint) return;
    if (hint.mode === 'campus') {
      clearActiveFloor();
      return;
    }
    if (hint.mode === 'floor' && hint.buildingId && typeof hint.floor === 'number') {
      setActiveFloor(hint.buildingId, hint.floor);
    }
  };

  const handleSuggestionClick = (s: { alias: string; id: string }) => {
    selectSuggestion(s as any);

    if (activeInput === 'from') {
      setActiveInput('to');
      setTimeout(() => toInputRef.current?.focus(), 0);
    } else {
      // если обе точки выбраны — можно построить
      if (fromNodeId || s.id) {
        // просто оставляем пользователю кнопку “Построить”
      }
    }
  };

  const canBuild = !!fromNodeId && !!toNodeId;

  // --- collapsed ---
  if (!isExpanded) {
    // route card
    if (currentRoute?.found) {
      const minutes = Math.max(1, Math.round(currentRoute.totalDistance / 50));
      return (
        <div className="fixed bottom-6 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-md z-[1000]">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-green-400 to-green-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold">✓</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-800">
                  Маршрут готов • ~{minutes} мин
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {fromQuery} → {toQuery}
                </div>
              </div>

              <button
                onClick={() => {
                  setIsExpanded(true);
                  setActiveInput(null);
                }}
                className="px-3 py-2 rounded-xl text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              >
                Шаги
              </button>

              <button
                onClick={clearRoute}
                className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
                aria-label="Сбросить"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      );
    }

    // search CTA
    return (
      <div className="fixed bottom-6 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-md z-[1000]">
        <button
          onClick={() => {
            setIsExpanded(true);
            setActiveInput('to');
          }}
          className="w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-4 flex items-center gap-4 hover:border-gray-200 transition-all"
        >
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold">🔎</span>
          </div>
          <div className="flex-1 text-left">
            <div className="text-gray-800 font-medium">Куда вы хотите попасть?</div>
            <div className="text-xs text-gray-500">
              {viewMode === 'campus'
                ? 'Кампус'
                : `${activeFloor?.buildingId ?? ''}, этаж ${activeFloor?.floor ?? ''}`}
            </div>
          </div>
        </button>
      </div>
    );
  }

  // --- expanded (search + steps) ---
  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 z-[999]"
        onClick={() => {
          setIsExpanded(false);
          setActiveInput(null);
        }}
      />

      <div className="fixed bottom-0 left-0 right-0 md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:max-w-md z-[1000]">
        <div className="bg-white md:rounded-2xl rounded-t-3xl shadow-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 pt-4 pb-3 flex items-start justify-between border-b border-gray-100">
            <div>
              <div className="font-semibold text-gray-800">Маршрут</div>
              <div className="text-xs text-gray-500">
                {viewMode === 'campus'
                  ? 'Вид: Кампус'
                  : `Вид: ${activeFloor?.buildingId ?? ''}, этаж ${activeFloor?.floor ?? ''}`}
              </div>
            </div>

            <button
              onClick={() => {
                setIsExpanded(false);
                setActiveInput(null);
              }}
              className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Inputs */}
            <div className="flex gap-3 items-start">
              <div className="flex flex-col items-center pt-3">
                <div className={`w-3 h-3 rounded-full ${fromNodeId ? 'bg-green-500' : 'bg-gray-300'}`} />
                <div className="w-0.5 bg-gray-200 my-2 h-10" />
                <div className={`w-3 h-3 rounded-full ${toNodeId ? 'bg-blue-500' : 'bg-gray-300'}`} />
              </div>

              <div className="flex-1 space-y-2">
                <input
                  ref={fromInputRef}
                  value={fromQuery}
                  onChange={(e) => {
                    setFromQuery(e.target.value);
                    setActiveField('from');
                  }}
                  onFocus={() => setActiveInput('from')}
                  placeholder="Откуда"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 focus:bg-white focus:border-green-400 transition-colors"
                />

                <input
                  ref={toInputRef}
                  value={toQuery}
                  onChange={(e) => {
                    setToQuery(e.target.value);
                    setActiveField('to');
                  }}
                  onFocus={() => setActiveInput('to')}
                  placeholder="Куда"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 focus:bg-white focus:border-blue-400 transition-colors"
                />
              </div>

              <button
                onClick={swapPoints}
                className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors mt-2"
                title="Поменять местами"
              >
                ⇅
              </button>
            </div>

            {/* Suggestions */}
            {activeInput && suggestions.length > 0 && (
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                {suggestions.map((s, i) => (
                  <button
                    key={`${s.id}-${i}`}
                    onClick={() => handleSuggestionClick(s)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                  >
                    <div className="text-sm text-gray-800">{s.alias}</div>
                    <div className="text-xs text-gray-500">{s.id}</div>
                  </button>
                ))}
              </div>
            )}

            {/* Build */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  buildRoute();
                  setActiveInput(null);
                }}
                disabled={!canBuild}
                className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
                  canBuild ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                Построить
              </button>

              <button
                onClick={clearRoute}
                className="px-4 py-3 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                Сброс
              </button>
            </div>

            {/* Steps */}
            {currentRoute?.found && steps.length > 0 && (
              <div className="pt-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Шаги маршрута
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {steps.map((st, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-600 flex-shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-gray-800">{st.text}</div>
                        {st.hint && (
                          <button
                            onClick={() => openHint(st.hint)}
                            className="mt-1 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors"
                          >
                            Открыть {st.hint.mode === 'campus' ? 'кампус' : `этаж ${st.hint.floor}`}
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
                Маршрут не найден: {currentRoute.error ?? 'проверьте точки'}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};