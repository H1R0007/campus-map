import type {
  AliasManager,
  BuildingMeta,
  Graph,
  MapNode,
  PathResult,
  PathSegment,
  TransitionType,
  ViewScope,
} from '@campus-map/core';
import { CAMPUS_BUILDING_ID, scopeOfNode } from '@campus-map/core';
import { formatFloor, messagesFor } from '../i18n';
import type { Messages } from '../i18n';
import type { Language } from '../i18n/languages';
import { nodePlaceLabel } from './placeLabels';

/**
 * Пошаговые инструкции маршрута на языке интерфейса.
 */

/**
 * Вид шага: начало, пеший участок, переход между этажами или корпусами и
 * прибытие, если маршрут кончается сразу за переходом.
 */
export type RouteStepKind = 'start' | 'walk' | 'transition' | 'arrive';

export interface RouteStep {
  kind: RouteStepKind;

  /** Действие — без имён из данных: «Поднимитесь на лифте». */
  title: string;

  /**
   * Где это происходит — имена из данных в именительном падеже: «Этаж 3»,
   * «Корпус Б, этаж 2». Отдельно от действия, потому что произвольное имя
   * нельзя поставить в падеж ни в одном языке.
   */
  place: string;

  /** Тип перехода — для значка шага; у пеших участков, начала и прибытия — `null`. */
  transition: TransitionType | null;

  /** Область карты, где шаг происходит: кнопка шага открывает её. */
  scope: ViewScope;

  /** Длина участка по плану, метры; `null` в пиксельном режиме и у начала. */
  distanceMeters: number | null;

  /** Время участка, секунды; `null` в пиксельном режиме и у начала. */
  durationSeconds: number | null;

  /**
   * Узлы пути, которые проходит шаг: индексы в `PathResult.path`, оба конца
   * включительно; соседние шаги делят общий узел. Шаг `k` разбивки ядра — это
   * переход от `path[k]` к `path[k + 1]`. По этим узлам слой маршрута
   * подсвечивает участок текущего шага и подгоняет под него карту.
   */
  pathRange: readonly [number, number];
}

interface BuildRouteStepsParams {
  graph: Graph;
  route: PathResult;
  buildingMetas: ReadonlyMap<string, BuildingMeta>;
  aliasManager: AliasManager | null;
  language: Language;
}

/** Сумма физики шагов; `null`, если у шагов её нет (пиксельный режим). */
function total(segments: readonly PathSegment[], pick: (segment: PathSegment) => number | null): number | null {
  let sum = 0;
  for (const segment of segments) {
    const value = pick(segment);
    if (value === null) return null;
    sum += value;
  }
  return sum;
}

/** «Дойдите до лифта» — к какому переходу ведёт пеший участок. */
function walkTitle(messages: Messages, type: TransitionType, from: MapNode): string {
  if (type === 'entrance') {
    return from.building === CAMPUS_BUILDING_ID
      ? messages.instructions.walkTo.entrance
      : messages.instructions.walkTo.exit;
  }
  return messages.instructions.walkTo[type];
}

/**
 * Строит шаги маршрута по его разбивке из ядра (`PathResult.segments`).
 *
 * Поиск уже разложил путь на шаги с типами переходов и физикой — раньше
 * инструкции обходили путь заново и теряли это. Описываются значимые события:
 * начало, пеший участок до перехода, сам переход и участок до цели. Цепочка
 * лестницы или лифта через несколько этажей — один шаг: «Поднимитесь на лифте
 * — Этаж 5», а не пять одинаковых. У маршрута по одному этажу есть
 * содержательный шаг — участок до цели с его длиной, — а не только «старт» и
 * «финиш».
 */
export function buildRouteSteps(params: BuildRouteStepsParams): RouteStep[] {
  const { graph, route, buildingMetas, aliasManager, language } = params;
  const segments = route.segments;
  if (!route.found || segments === undefined || route.path.length < 2) return [];

  const start = graph.getNode(route.path[0]);
  const end = graph.getNode(route.path[route.path.length - 1]);
  if (!start || !end) return [];

  const messages = messagesFor(language);
  const placeOf = (node: MapNode) => nodePlaceLabel(graph, buildingMetas, node.id, language);
  const pointOf = (node: MapNode) => {
    const name = aliasManager?.getPrimaryAliasForId(node.id, language) ?? null;
    return name === null ? placeOf(node) : `${name}, ${placeOf(node)}`;
  };

  const steps: RouteStep[] = [
    {
      kind: 'start',
      title: messages.instructions.start,
      place: pointOf(start),
      transition: null,
      scope: scopeOfNode(start),
      distanceMeters: null,
      durationSeconds: null,
      pathRange: [0, 0],
    },
  ];

  let index = 0;

  // Цикл кончается только шагом до цели или прибытием: проход сразу после
  // последнего перехода даёт пустой пеший участок — это и есть прибытие.
  for (;;) {
    // Пеший участок: подряд идущие шаги без перехода.
    const legStart = index;
    while (index < segments.length && segments[index].transitionType === null) index++;
    const leg = segments.slice(legStart, index);

    if (index === segments.length) {
      steps.push(
        leg.length > 0
          ? {
              kind: 'walk',
              title: messages.instructions.walkToDestination,
              place: pointOf(end),
              transition: null,
              scope: scopeOfNode(end),
              distanceMeters: total(leg, (s) => s.distanceMeters),
              durationSeconds: total(leg, (s) => s.durationSeconds),
              pathRange: [legStart, segments.length],
            }
          : {
              kind: 'arrive',
              title: messages.instructions.arrive,
              place: pointOf(end),
              transition: null,
              scope: scopeOfNode(end),
              distanceMeters: null,
              durationSeconds: null,
              pathRange: [segments.length, segments.length],
            }
      );
      break;
    }

    // Переход. Лестница и лифт в данных — цепочки между соседними этажами, и
    // поездка через несколько этажей описывается одним шагом.
    const type = segments[index].transitionType as TransitionType;
    const chainStart = index;
    index++;
    if (type === 'stairs' || type === 'lift') {
      while (index < segments.length && segments[index].transitionType === type) index++;
    }
    const chain = segments.slice(chainStart, index);

    const from = graph.getNode(chain[0].fromNode);
    const to = graph.getNode(chain[chain.length - 1].toNode);
    if (!from || !to) continue;

    if (leg.length > 0) {
      steps.push({
        kind: 'walk',
        title: walkTitle(messages, type, from),
        place: aliasManager?.getPrimaryAliasForId(from.id, language) ?? placeOf(from),
        transition: null,
        scope: scopeOfNode(from),
        distanceMeters: total(leg, (s) => s.distanceMeters),
        durationSeconds: total(leg, (s) => s.durationSeconds),
        pathRange: [legStart, chainStart],
      });
    }

    let title: string;
    let place: string;

    if (from.building !== to.building) {
      title =
        type === 'bridge'
          ? messages.instructions.move.bridge.same
          : to.building === CAMPUS_BUILDING_ID
            ? messages.instructions.exitToCampus
            : from.building === CAMPUS_BUILDING_ID
              ? messages.instructions.enterBuilding
              : messages.instructions.changeBuilding;
      place = placeOf(to);
    } else if (from.floor !== to.floor) {
      title = messages.instructions.move[type][to.floor > from.floor ? 'up' : 'down'];
      place = messages.map.floor(formatFloor(to.floor));
    } else {
      title = messages.instructions.move[type].same;
      place = placeOf(to);
    }

    steps.push({
      kind: 'transition',
      title,
      place,
      transition: type,
      scope: scopeOfNode(to),
      distanceMeters: total(chain, (s) => s.distanceMeters),
      durationSeconds: total(chain, (s) => s.durationSeconds),
      pathRange: [chainStart, index],
    });
  }

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
