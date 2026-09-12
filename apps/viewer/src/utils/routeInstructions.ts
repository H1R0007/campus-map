import type {
  AliasManager,
  BuildingMeta,
  Graph,
  TransitionType,
  ViewScope,
} from '@campus-map/core';
import { CAMPUS_BUILDING_ID, buildingDisplayName, scopeOfNode, transitionTypeLabel } from '@campus-map/core';

/**
 * Пошаговые инструкции маршрута на русском языке.
 */

interface RouteStep {
  /** Текст шага. */
  text: string;

  /**
   * Область видимости, в которой шаг происходит.
   *
   * Позволяет интерфейсу одной кнопкой переключить карту на нужный этаж:
   * тип общий с ядром, поэтому здесь не нужно своё описание «подсказки».
   */
  scope?: ViewScope;
}

type Direction = 'up' | 'down';

/**
 * Глагол перехода с учётом направления.
 *
 * `switch` исчерпывающий по `TransitionType`, поэтому ветки по умолчанию нет:
 * если тип расширят, компилятор укажет на это место.
 */
function transitionVerb(type: TransitionType, direction: Direction | 'same'): string {
  switch (type) {
    case 'stairs':
      if (direction === 'up') return 'Поднимитесь по лестнице';
      if (direction === 'down') return 'Спуститесь по лестнице';
      return 'Пройдите по лестнице';
    case 'lift':
      if (direction === 'up') return 'Поднимитесь на лифте';
      if (direction === 'down') return 'Спуститесь на лифте';
      return 'Воспользуйтесь лифтом';
    case 'bridge':
      return 'Перейдите по переходу';
    case 'entrance':
      return 'Пройдите через вход';
  }
}

interface BuildRouteStepsParams {
  graph: Graph;
  path: string[];
  buildingMetas: ReadonlyMap<string, BuildingMeta>;
  aliasManager: AliasManager | null;
}

/**
 * Строит список шагов маршрута.
 *
 * Описываются только значимые события: старт, смена корпуса, смена этажа и
 * финиш. Перечислять каждый поворот коридора бессмысленно — на плане линия
 * маршрута и так всё показывает.
 */
export function buildRouteSteps(params: BuildRouteStepsParams): RouteStep[] {
  const { graph, path, buildingMetas, aliasManager } = params;
  const steps: RouteStep[] = [];

  if (path.length < 2) return steps;

  const start = graph.getNode(path[0]);
  const end = graph.getNode(path[path.length - 1]);
  if (!start || !end) return steps;

  const names = new Map<string, string>();
  for (const [id, meta] of buildingMetas) names.set(id, meta.name);

  const buildingLabel = (id: string) => buildingDisplayName(id, names);
  const nodeLabel = (id: string) => aliasManager?.getPrimaryAliasForId(id) ?? id;
  const placeLabel = (nodeId: string) => {
    const node = graph.getNode(nodeId);
    if (!node) return nodeId;
    return `${nodeLabel(nodeId)} — ${buildingLabel(node.building)}`;
  };

  steps.push({ text: `Старт: ${placeLabel(start.id)}`, scope: scopeOfNode(start) });

  for (let i = 1; i < path.length; i++) {
    const a = graph.getNode(path[i - 1]);
    const b = graph.getNode(path[i]);
    if (!a || !b) continue;

    const type = graph.getTransitionType(a.id, b.id);
    if (type === null) continue;

    // Смена корпуса.
    if (a.building !== b.building) {
      if (b.building === CAMPUS_BUILDING_ID) {
        steps.push({ text: 'Выйдите на территорию кампуса.', scope: scopeOfNode(b) });
      } else if (a.building === CAMPUS_BUILDING_ID) {
        steps.push({
          text: `Войдите в ${buildingLabel(b.building)} (этаж ${b.floor}).`,
          scope: scopeOfNode(b),
        });
      } else {
        steps.push({
          text: `Перейдите из ${buildingLabel(a.building)} в ${buildingLabel(b.building)}.`,
          scope: scopeOfNode(b),
        });
      }
      continue;
    }

    // Смена этажа внутри корпуса.
    if (a.floor !== b.floor) {
      const direction: Direction = b.floor > a.floor ? 'up' : 'down';
      steps.push({
        text: `${transitionVerb(type, direction)} на этаж ${b.floor}.`,
        scope: scopeOfNode(b),
      });
      continue;
    }

    // Переход того же типа в пределах этажа — редкий, но допустимый случай.
    if (type === 'entrance') {
      steps.push({ text: `Пройдите через ${transitionTypeLabel(type).toLowerCase()}.` });
    }
  }

  steps.push({ text: `Финиш: ${placeLabel(end.id)}`, scope: scopeOfNode(end) });

  return steps;
}

/**
 * Оценка времени в пути.
 *
 * `totalDistance` — сумма длин рёбер в пикселях плана и весов переходов, то
 * есть условные метры. 50 м/мин — спокойный шаг в помещении с поправкой на
 * двери и лестницы.
 */
const WALKING_SPEED_UNITS_PER_MINUTE = 50;

export function estimateMinutes(totalDistance: number): number {
  return Math.max(1, Math.round(totalDistance / WALKING_SPEED_UNITS_PER_MINUTE));
}
