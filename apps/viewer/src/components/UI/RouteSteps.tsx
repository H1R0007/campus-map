import React, { useMemo } from 'react';
import type { ViewScope } from '@campus-map/core';
import { TRANSITION_COLORS, TransitionGlyph } from '@campus-map/mapkit';
import { messagesFor, useLanguage } from '../../i18n';
import type { Language } from '../../i18n/languages';
import { scopeOf, useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import { buildRouteSteps, formatDuration } from '../../utils/routeInstructions';
import type { RouteStep } from '../../utils/routeInstructions';
import { formatDistance, routeSummary } from '../../utils/routeSummary';

/** Совпадает ли вид карты с областью шага — чтобы подсветить текущий шаг. */
function sameScope(a: ViewScope, b: ViewScope): boolean {
  if (a.mode === 'campus' || b.mode === 'campus') return a.mode === b.mode;
  return a.buildingId === b.buildingId && a.floor === b.floor;
}

/** Длина пешего участка или время перехода — что полезнее знать о шаге. */
function stepMeta(step: RouteStep, language: Language): string | null {
  if (step.kind === 'walk' && step.distanceMeters !== null) return formatDistance(step.distanceMeters, language);
  if (step.kind === 'transition' && step.durationSeconds !== null) return formatDuration(step.durationSeconds, language);
  return null;
}

/**
 * Шаги маршрута.
 *
 * Весь шаг — кнопка, открывающая его этаж, а текущий вид карты подсвечен:
 * раньше под каждым шагом стояла отдельная маленькая кнопка «Открыть этаж N»,
 * и что сейчас на карте, по списку было не понять.
 *
 * У шага-перехода вместо номера — значок того же вида и цвета, что точка
 * перехода на плане: лифт в списке узнаётся на карте. Номер для экранного
 * диктора даёт сам нумерованный список.
 */
export const RouteSteps: React.FC = () => {
  const currentRoute = useRouteStore((s) => s.currentRoute);
  const graph = useMapStore((s) => s.graph);
  const aliasManager = useMapStore((s) => s.aliasManager);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const activeFloor = useMapStore((s) => s.activeFloor);
  const setActiveFloor = useMapStore((s) => s.setActiveFloor);
  const clearActiveFloor = useMapStore((s) => s.clearActiveFloor);
  const language = useLanguage();
  const messages = messagesFor(language);

  const steps = useMemo(() => {
    if (!graph || !buildingMetas || !currentRoute?.found) return [];
    return buildRouteSteps({ graph, route: currentRoute, buildingMetas, aliasManager, language });
  }, [graph, buildingMetas, currentRoute, aliasManager, language]);

  if (!graph || !currentRoute?.found || steps.length === 0) return null;

  const view = scopeOf(activeFloor);

  const openScope = (scope: ViewScope) => {
    if (scope.mode === 'campus') clearActiveFloor();
    else setActiveFloor(scope.buildingId, scope.floor);
  };

  return (
    <section aria-label={messages.route.stepsTitle}>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{messages.route.stepsTitle}</h3>
        <span className="text-xs text-gray-600">{routeSummary(graph, currentRoute, language)}</span>
      </div>

      <ol className="space-y-1">
        {steps.map((step, index) => {
          const isCurrent = sameScope(step.scope, view);
          const meta = stepMeta(step, language);

          return (
            // Ключ по индексу допустим: список пересобирается целиком вместе с маршрутом.
            <li key={index}>
              <button
                type="button"
                onClick={() => openScope(step.scope)}
                aria-current={isCurrent ? 'step' : undefined}
                className={`w-full flex items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors ${
                  isCurrent ? 'bg-primary/10' : 'hover:bg-gray-50'
                }`}
              >
                {step.kind === 'transition' && step.transition !== null ? (
                  <span
                    aria-hidden="true"
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0"
                    style={{ backgroundColor: TRANSITION_COLORS[step.transition] }}
                  >
                    <TransitionGlyph type={step.transition} size={14} />
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-700 flex-shrink-0"
                  >
                    {index + 1}
                  </span>
                )}
                {/* Действие и место — отдельными строками: место — имя из
                    данных, и склонять его нельзя. */}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gray-800">{step.title}</span>
                  <span className="block text-xs text-gray-600">{step.place}</span>
                </span>
                {meta !== null && <span className="text-xs text-gray-600 whitespace-nowrap">{meta}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
