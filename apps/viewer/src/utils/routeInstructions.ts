import type { AliasManager, BuildingMeta, Graph, ViewScope } from '@campus-map/core';
import { CAMPUS_BUILDING_ID, scopeOfNode } from '@campus-map/core';
import { formatFloor, messagesFor } from '../i18n';
import type { Language } from '../i18n/languages';
import { nodePlaceLabel } from './placeLabels';

/**
 * Пошаговые инструкции маршрута на языке интерфейса.
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

interface BuildRouteStepsParams {
  graph: Graph;
  path: string[];
  buildingMetas: ReadonlyMap<string, BuildingMeta>;
  aliasManager: AliasManager | null;
  language: Language;
}

/**
 * Шаг из действия и места.
 *
 * Место — имя из данных — стоит отдельно от глагола и не склоняется: прежнее
 * «Перейдите из Корпус А в Корпус Б» ломалось ровно на подстановке имени в
 * падежную форму, а по-английски склонения нет вовсе.
 */
function step(action: string, place: string): string {
  return `${action} — ${place}`;
}

/**
 * Строит список шагов маршрута.
 *
 * Описываются только значимые события: старт, смена корпуса, смена этажа и
 * финиш. Перечислять каждый поворот коридора бессмысленно — на плане линия
 * маршрута и так всё показывает.
 */
export function buildRouteSteps(params: BuildRouteStepsParams): RouteStep[] {
  const { graph, path, buildingMetas, aliasManager, language } = params;
  const messages = messagesFor(language);
  const steps: RouteStep[] = [];

  if (path.length < 2) return steps;

  const start = graph.getNode(path[0]);
  const end = graph.getNode(path[path.length - 1]);
  if (!start || !end) return steps;

  const placeOf = (nodeId: string) => nodePlaceLabel(graph, buildingMetas, nodeId, language);
  const pointOf = (nodeId: string) =>
    `${aliasManager?.getPrimaryAliasForId(nodeId, language) ?? nodeId}, ${placeOf(nodeId)}`;

  steps.push({ text: step(messages.instructions.start, pointOf(start.id)), scope: scopeOfNode(start) });

  for (let i = 1; i < path.length; i++) {
    const a = graph.getNode(path[i - 1]);
    const b = graph.getNode(path[i]);
    if (!a || !b) continue;

    const type = graph.getTransitionType(a.id, b.id);
    if (type === null) continue;

    // Смена корпуса.
    if (a.building !== b.building) {
      if (b.building === CAMPUS_BUILDING_ID) {
        steps.push({ text: messages.instructions.exitToCampus, scope: scopeOfNode(b) });
      } else {
        const action =
          a.building === CAMPUS_BUILDING_ID
            ? messages.instructions.enterBuilding
            : messages.instructions.changeBuilding;
        steps.push({ text: step(action, placeOf(b.id)), scope: scopeOfNode(b) });
      }
      continue;
    }

    // Смена этажа внутри корпуса.
    if (a.floor !== b.floor) {
      const direction = b.floor > a.floor ? 'up' : 'down';
      steps.push({
        text: step(messages.instructions.move[type][direction], messages.map.floor(formatFloor(b.floor))),
        scope: scopeOfNode(b),
      });
      continue;
    }

    // Переход того же типа в пределах этажа — редкий, но допустимый случай.
    if (type === 'entrance') {
      steps.push({ text: messages.instructions.passEntrance });
    }
  }

  steps.push({ text: step(messages.instructions.finish, pointOf(end.id)), scope: scopeOfNode(end) });

  return steps;
}

/**
 * Время в пути для карточки маршрута: «~4 мин».
 *
 * Принимает `PathResult.durationSeconds` — физику пути из ядра.
 *
 * Округление вверх: студенту, который торопится на пару, заниженная оценка
 * вреднее завышенной. Меньше минуты показывается минутой — «~0 мин» ничего
 * не сообщает.
 */
export function formatDuration(seconds: number, language: Language): string {
  return messagesFor(language).route.duration(Math.max(1, Math.ceil(seconds / 60)));
}
