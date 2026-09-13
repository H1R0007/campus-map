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

/** Карта «id корпуса → отображаемое имя» для хелперов ядра. */
function buildingNames(buildingMetas: ReadonlyMap<string, BuildingMeta>): Map<string, string> {
  const names = new Map<string, string>();
  for (const [id, meta] of buildingMetas) names.set(id, meta.name);
  return names;
}

/**
 * Где находится узел: «Корпус А, этаж 3» или «Кампус».
 *
 * Нужно там, где название помещения само по себе не различает точку: пять
 * корпусов дают пять «аудиторий 101». Раньше в подсказках поиска вместо этого
 * показывался внутренний id узла (`a1_room101`) — он различает точки, но
 * студенту ничего не говорит.
 */
export function nodePlaceLabel(
  graph: Graph,
  buildingMetas: ReadonlyMap<string, BuildingMeta>,
  nodeId: string
): string {
  const node = graph.getNode(nodeId);
  if (!node) return '';

  const building = buildingDisplayName(node.building, buildingNames(buildingMetas));

  return node.building === CAMPUS_BUILDING_ID ? building : `${building}, этаж ${node.floor}`;
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

  const names = buildingNames(buildingMetas);

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
 * Время в пути для карточки маршрута: «~4 мин».
 *
 * Принимает `PathResult.durationSeconds` — физику пути из ядра. Прежняя
 * оценка делила условную стоимость (пиксели плана плюс веса переходов) на
 * выдуманную скорость и менялась от галочки «предпочитать лифт».
 *
 * Округление вверх: студенту, который торопится на пару, заниженная оценка
 * вреднее завышенной. Меньше минуты показывается минутой — «~0 мин» ничего
 * не сообщает.
 */
export function formatDuration(seconds: number): string {
  return `~${Math.max(1, Math.ceil(seconds / 60))} мин`;
}
