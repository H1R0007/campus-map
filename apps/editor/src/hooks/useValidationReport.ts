import { useDeferredValue, useMemo } from 'react';
import type { BuildingMeta, MapNode, Transition } from '@campus-map/core';
import { useEditorStore } from '../stores/editorStore';
import { validateDataset } from '../utils/validateData';
import type { ValidationResult } from '../utils/validateData';

let cached: {
  nodes: Map<string, MapNode>;
  transitions: Transition[];
  buildingMetas: Map<string, BuildingMeta>;
  report: ValidationResult;
} | null = null;

/**
 * Проверка данных для тех же данных считается один раз, сколько бы частей
 * интерфейса её ни показывали: счётчик в шапке и вкладка «Проверка» получают
 * один и тот же отчёт.
 */
function validateOnce(
  nodes: Map<string, MapNode>,
  transitions: Transition[],
  buildingMetas: Map<string, BuildingMeta>
): ValidationResult {
  if (cached && cached.nodes === nodes && cached.transitions === transitions && cached.buildingMetas === buildingMetas) {
    return cached.report;
  }
  const report = validateDataset({ nodes, transitions, buildingMetas });
  cached = { nodes, transitions, buildingMetas, report };
  return report;
}

/**
 * Отчёт проверки данных, который обновляется вслед за правками.
 *
 * Данные берутся отложенно (`useDeferredValue`): перетаскивание узла меняет их
 * каждый кадр, и проверка всего датасета на каждом кадре отнимала бы время у
 * самой карты. Отчёт догоняет правку, как только браузер свободен.
 */
export function useValidationReport(): ValidationResult {
  const nodes = useDeferredValue(useEditorStore((s) => s.nodes));
  const transitions = useDeferredValue(useEditorStore((s) => s.transitions));
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  return useMemo(() => validateOnce(nodes, transitions, buildingMetas), [nodes, transitions, buildingMetas]);
}
