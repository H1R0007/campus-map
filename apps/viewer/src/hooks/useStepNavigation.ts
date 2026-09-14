import { useMemo } from 'react';
import type { ViewScope } from '@campus-map/core';
import { useLanguage } from '../i18n';
import { useMapStore } from '../stores/mapStore';
import { useRouteStore } from '../stores/routeStore';
import { buildRouteSteps } from '../utils/routeInstructions';
import type { RouteStep } from '../utils/routeInstructions';

/**
 * Шаги показанного маршрута на языке интерфейса; пустой список, если маршрута
 * нет или он не найден.
 *
 * Считаются при отрисовке и не хранятся: это чистая функция от маршрута,
 * данных и языка.
 */
export function useRouteSteps(): RouteStep[] {
  const graph = useMapStore((s) => s.graph);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const aliasManager = useMapStore((s) => s.aliasManager);
  const currentRoute = useRouteStore((s) => s.currentRoute);
  const language = useLanguage();

  return useMemo(() => {
    if (!graph || !buildingMetas || !currentRoute?.found) return [];
    return buildRouteSteps({ graph, route: currentRoute, buildingMetas, aliasManager, language });
  }, [graph, buildingMetas, aliasManager, currentRoute, language]);
}

export interface StepNavigation {
  steps: RouteStep[];
  /** Текущий шаг; `null` — обзор маршрута. */
  index: number | null;
  /** Перейти к шагу и открыть на карте его этаж или территорию. */
  goTo: (index: number) => void;
  /** Снова открыть на карте область текущего шага — после ручной смены этажа. */
  showCurrent: () => void;
  /** Вернуться к обзору маршрута. */
  exit: () => void;
}

/**
 * Пошаговая навигация по показанному маршруту.
 *
 * Номер шага хранит стор маршрута (`stepIndex`), а какой этаж открыть,
 * знает шаг (`RouteStep.scope`). Переход к шагу делает и то и другое сразу:
 * иначе человек нажимал бы «Далее» и сам искал этаж на панели этажей.
 */
export function useStepNavigation(): StepNavigation {
  const steps = useRouteSteps();
  const stepIndex = useRouteStore((s) => s.stepIndex);
  const setStep = useRouteStore((s) => s.setStep);
  const setActiveFloor = useMapStore((s) => s.setActiveFloor);
  const clearActiveFloor = useMapStore((s) => s.clearActiveFloor);

  const openScope = (scope: ViewScope) => {
    if (scope.mode === 'campus') clearActiveFloor();
    else setActiveFloor(scope.buildingId, scope.floor);
  };

  // Номер вне шагов — только если маршрут сменился раньше, чем стор успел его
  // сбросить; показывать такой шаг нельзя.
  const index = stepIndex !== null && stepIndex < steps.length ? stepIndex : null;

  return {
    steps,
    index,
    goTo: (target) => {
      const step = steps[target];
      if (!step) return;
      setStep(target);
      openScope(step.scope);
    },
    showCurrent: () => {
      if (index !== null) openScope(steps[index].scope);
    },
    exit: () => setStep(null),
  };
}
