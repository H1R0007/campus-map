import React, { useMemo } from 'react';
import type { TransitionType, ViewScope } from '@campus-map/core';
import { TRANSITION_COLORS, TransitionGlyph } from '@campus-map/mapkit';
import { messagesFor, useLanguage } from '../../i18n';
import type { Language } from '../../i18n/languages';
import { scopeOf, useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import { buildRouteSteps, formatDuration } from '../../utils/routeInstructions';
import type { RouteStep } from '../../utils/routeInstructions';
import { formatDistance } from '../../utils/routeSummary';

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

/** Значок шага — тем же, чем его место отмечено на карте. */
type StepMarker = { kind: 'start' } | { kind: 'end' } | { kind: 'walk' } | { kind: 'transition'; type: TransitionType };

function stepMarker(step: RouteStep, isLast: boolean): StepMarker {
  if (step.kind === 'start') return { kind: 'start' };
  // Последний шаг ведёт к цели — пеший он или «Вы на месте».
  if (isLast) return { kind: 'end' };
  if (step.kind === 'transition' && step.transition !== null) return { kind: 'transition', type: step.transition };
  return { kind: 'walk' };
}

const ICON_CLASS = 'relative w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0';

const StepIcon: React.FC<{ marker: StepMarker }> = ({ marker }) => {
  switch (marker.kind) {
    case 'transition':
      // Вид и цвет точки перехода на плане: лифт в списке узнаётся на карте.
      return (
        <span aria-hidden="true" className={`${ICON_CLASS} text-white`} style={{ backgroundColor: TRANSITION_COLORS[marker.type] }}>
          <TransitionGlyph type={marker.type} size={14} />
        </span>
      );

    case 'walk':
      return (
        <span aria-hidden="true" className={`${ICON_CLASS} bg-gray-100 text-gray-600`}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" focusable="false">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      );

    case 'start':
    case 'end':
      // Цвета концов маршрута на карте: начало — `start`, цель — `primary`.
      return (
        <span aria-hidden="true" className={`${ICON_CLASS} ${marker.kind === 'start' ? 'bg-start' : 'bg-primary'}`}>
          <span className="w-2 h-2 rounded-full bg-white" />
        </span>
      );
  }
};

/**
 * Шаги маршрута.
 *
 * Весь шаг — кнопка, открывающая его этаж, а текущий вид карты подсвечен:
 * раньше под каждым шагом стояла отдельная маленькая кнопка «Открыть этаж N»,
 * и что сейчас на карте, по списку было не понять.
 *
 * Значок у каждого шага и обозначает его место так же, как карта: начало и
 * цель — цветами концов маршрута, переход — значком и цветом своего типа,
 * пеший участок — стрелкой. Раньше значок был только у перехода, а у
 * остальных шагов номер, и нумерация читалась как «1, 2, значок, 4».
 * Последовательность показывает линия между значками, номер для экранного
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
      {/* Сводка маршрута — в заголовке обзора над шагами, здесь её не повторяем. */}
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{messages.route.stepsTitle}</h3>

      <ol className="space-y-1">
        {steps.map((step, index) => {
          const isCurrent = sameScope(step.scope, view);
          const isLast = index === steps.length - 1;
          const meta = stepMeta(step, language);

          return (
            // Ключ по индексу допустим: список пересобирается целиком вместе с маршрутом.
            <li key={index}>
              <button
                type="button"
                onClick={() => openScope(step.scope)}
                aria-current={isCurrent ? 'step' : undefined}
                className={`relative w-full flex items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors ${
                  isCurrent ? 'bg-primary/10' : 'hover:bg-gray-50'
                }`}
              >
                {/* Линия от значка к значку следующего шага: отступ кнопки,
                    промежуток списка и отступ следующей кнопки. */}
                {!isLast && (
                  <span aria-hidden="true" className="absolute left-[1.1875rem] top-8 -bottom-3 w-0.5 bg-gray-200" />
                )}
                <StepIcon marker={stepMarker(step, isLast)} />
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
