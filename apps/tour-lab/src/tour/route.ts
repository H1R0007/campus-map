import { CAMPUS_BUILDING_ID, DEFAULT_PATHFINDING_OPTIONS, findPath, routePanoramaViews } from '@campus-map/core';
import type { Graph, Panorama, PathSegment, RoutePanoramaView, TransitionType } from '@campus-map/core';
import { planLabel, spotName } from './describe';
import type { DescribeContext } from './describe';

/**
 * Маршрут прототипа: шаги, как в навигаторе, и снимок к каждому шагу.
 *
 * Шаги навигатора живут в `apps/viewer` и сюда не берутся: прототип
 * показывает идею «показать этот поворот», а не повторяет навигатор. При
 * переносе в навигатор шагу понадобится только `pathRange` — он там уже есть.
 */

export interface TourStep {
  title: string;
  place: string;
  /** Индексы пути маршрута, оба конца включительно; соседние шаги делят узел. */
  range: readonly [number, number];
  /** Снимок шага, развёрнутый по маршруту; `null` — у шага снимка нет. */
  view: RoutePanoramaView | null;
}

export interface TourRoute {
  path: readonly string[];
  steps: TourStep[];
  views: RoutePanoramaView[];
  durationSeconds: number | null;
}

const WALK_TO: Record<TransitionType, string> = {
  stairs: 'Дойдите до лестницы',
  lift: 'Дойдите до лифта',
  entrance: 'Дойдите до входа',
  bridge: 'Дойдите до перехода',
};

/**
 * Снимок шага: первый на его участке пути, кроме того, что уже показан у
 * предыдущего шага, — соседние шаги делят узел на стыке.
 */
export function pickStepView(
  views: readonly RoutePanoramaView[],
  range: readonly [number, number],
  previous: RoutePanoramaView | null
): RoutePanoramaView | null {
  return (
    views.find(
      (view) => view.pathIndex >= range[0] && view.pathIndex <= range[1] && view.node !== previous?.node
    ) ?? null
  );
}

function transitionTitle(graph: Graph, context: DescribeContext, chain: PathSegment[]): [string, string] {
  const type = chain[0].transitionType as TransitionType;
  const from = graph.getNode(chain[0].fromNode)!;
  const to = graph.getNode(chain[chain.length - 1].toNode)!;

  if (type === 'entrance') {
    return to.building === CAMPUS_BUILDING_ID
      ? ['Выйдите на улицу', planLabel(context, to)]
      : ['Войдите в корпус', context.buildingMetas.get(to.building)?.name ?? to.building];
  }
  if (type === 'bridge') return ['Перейдите в соседний корпус', planLabel(context, to)];

  const up = to.floor > from.floor;
  const how = type === 'lift' ? 'на лифте' : 'по лестнице';
  return [`${up ? 'Поднимитесь' : 'Спуститесь'} ${how}`, `этаж ${to.floor}`];
}

/** Маршрут между точками или `null`, если пути нет. */
export function buildTourRoute(
  context: DescribeContext,
  panoramas: ReadonlyMap<string, Panorama>,
  planRotation: (building: string, floor: number) => number | null,
  from: string,
  to: string
): TourRoute | null {
  const { graph } = context;
  const result = findPath(graph, from, to, DEFAULT_PATHFINDING_OPTIONS);
  if (!result.found || !result.segments || result.path.length < 2) return null;

  const segments = result.segments;
  const views = routePanoramaViews(graph, panoramas, result.path, { planRotation });
  const steps: TourStep[] = [];
  const push = (title: string, place: string, range: readonly [number, number]) => {
    steps.push({ title, place, range, view: pickStepView(views, range, steps.at(-1)?.view ?? null) });
  };

  let index = 0;
  for (;;) {
    const legStart = index;
    while (index < segments.length && segments[index].transitionType === null) index++;

    if (index === segments.length) {
      if (index > legStart) push('Идите до цели', spotName(context, to), [legStart, segments.length]);
      break;
    }

    const type = segments[index].transitionType as TransitionType;
    if (index > legStart) {
      // К входу и переходу ведёт имя корпуса за ними, а не безымянная точка у двери.
      const door = graph.getNode(segments[index].toNode);
      const outside = type === 'entrance' && door?.building === CAMPUS_BUILDING_ID;
      const place =
        (type === 'entrance' || type === 'bridge') && door
          ? outside
            ? planLabel(context, door)
            : (context.buildingMetas.get(door.building)?.name ?? door.building)
          : spotName(context, segments[index].fromNode);
      push(outside ? 'Дойдите до выхода' : WALK_TO[type], place, [legStart, index]);
    }

    const chainStart = index;
    index++;
    if (type === 'stairs' || type === 'lift') {
      while (index < segments.length && segments[index].transitionType === type) index++;
    }
    const [title, place] = transitionTitle(graph, context, segments.slice(chainStart, index));
    push(title, place, [chainStart, index]);
  }

  return { path: result.path, steps, views, durationSeconds: result.durationSeconds };
}
