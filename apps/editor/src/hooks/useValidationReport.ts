import { useMemo } from 'react';
import type { BuildingMeta, MapNode, Transition } from '@campus-map/core';
import { useEditorStore } from '../stores/editorStore';
import { useQuiet } from './useQuiet';
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

/** Сколько ждать тишины в правках, прежде чем проверять данные, мс. */
const QUIET_MS = 500;

/**
 * Отчёт проверки данных, который обновляется вслед за правками — с паузой,
 * чтобы не отнимать кадры у карты во время перетаскивания.
 */
export function useValidationReport(): ValidationResult {
  const nodes = useQuiet(useEditorStore((s) => s.nodes), QUIET_MS);
  const transitions = useQuiet(useEditorStore((s) => s.transitions), QUIET_MS);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  return useMemo(() => validateOnce(nodes, transitions, buildingMetas), [nodes, transitions, buildingMetas]);
}
