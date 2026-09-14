import { edgeKey } from '../geometry.js';
import type { Graph } from '../graph/Graph.js';
import { DEFAULT_PATHFINDING_OPTIONS } from '../types/pathfinding.js';
import type {
  MultiPathResult,
  PathFailureReason,
  PathfindingOptions,
  PathResult,
  PathSegment,
} from '../types/pathfinding.js';
import type { MapNode } from '../types/node.js';
import { heuristic, stepCost, stepPhysics } from './costModel.js';
import type { NormalizedOptions, StepPhysics } from './costModel.js';

/**
 * Поиск кратчайшего пути алгоритмом A*.
 *
 * Здесь только обход. Что сколько стоит и какой оценкой остатка пользоваться,
 * решает модель стоимости (`costModel.ts`) по режиму графа.
 */

/**
 * Состояние поиска: узел и то, приехали ли в него на лифте.
 *
 * Одного узла недостаточно, потому что стоимость шага зависит от предыдущего:
 * кто приехал на лифте, едет дальше без ожидания, а кто подошёл к лифту
 * пешком — ждёт его. Лифт в данных — цепочка переходов между соседними
 * этажами, и без этого состояния поездка на пять этажей ждала бы лифт пять
 * раз, а лифт проигрывал бы лестнице ровно там, где он нужнее всего.
 */
interface SearchState {
  nodeId: string;
  inLift: boolean;
}

/** Элемент приоритетной очереди. */
interface QueueItem extends SearchState {
  fScore: number;

  /**
   * Стоимость пути до состояния на момент постановки в очередь.
   *
   * Нужна, чтобы отличить устаревшую запись от актуальной при извлечении:
   * состояние могло попасть в очередь несколько раз, и обрабатывать нужно
   * только ту запись, которая соответствует лучшему известному пути.
   */
  gScore: number;
}

/**
 * Приоритетная очередь на бинарной куче.
 *
 * `Array.prototype.sort` на каждой вставке дал бы O(N log N) на шаг и
 * превратил бы поиск в O(N² log N) — на графах с тысячами узлов это
 * заметно, поэтому куча обязательна.
 */
class PriorityQueue {
  private readonly items: QueueItem[] = [];

  push(item: QueueItem): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): QueueItem | undefined {
    if (this.items.length === 0) return undefined;

    const result = this.items[0];
    const last = this.items.pop()!;

    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }

    return result;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      if (this.items[parentIndex].fScore <= this.items[index].fScore) break;
      [this.items[parentIndex], this.items[index]] = [this.items[index], this.items[parentIndex]];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.items.length;

    for (;;) {
      const left = 2 * index + 1;
      const right = left + 1;
      let smallest = index;

      if (left < length && this.items[left].fScore < this.items[smallest].fScore) {
        smallest = left;
      }
      if (right < length && this.items[right].fScore < this.items[smallest].fScore) {
        smallest = right;
      }
      if (smallest === index) break;

      [this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]];
      index = smallest;
    }
  }
}

/**
 * Значения по состояниям поиска.
 *
 * Две карты вместо составного ключа-строки: id узлов приходят из данных, и
 * любой разделитель в таком ключе мог бы встретиться внутри самого id.
 */
class StateMap<T> {
  private readonly walking = new Map<string, T>();
  private readonly riding = new Map<string, T>();

  get(state: SearchState): T | undefined {
    return (state.inLift ? this.riding : this.walking).get(state.nodeId);
  }

  set(state: SearchState, value: T): void {
    (state.inLift ? this.riding : this.walking).set(state.nodeId, value);
  }
}

/**
 * Цель поиска: один узел либо ближайший из нескольких.
 */
interface SearchGoal {
  /** Достигнута ли цель в этом узле. */
  reached(nodeId: string): boolean;

  /** Оценка остатка пути от узла — допустимая и согласованная нижняя оценка. */
  estimate(node: MapNode): number;
}

/**
 * Подставляет значения по умолчанию.
 *
 * Раскладывается именно `DEFAULT_PATHFINDING_OPTIONS`, а не список литералов:
 * иначе набор по умолчанию существует в двух местах и однажды разойдётся —
 * так уже случилось с `maxIterations`, которого не было в экспортируемом
 * объекте, хотя поиск его применял.
 */
function normalizeOptions(options: PathfindingOptions = {}): NormalizedOptions {
  return { ...DEFAULT_PATHFINDING_OPTIONS, ...stripUndefined(options) };
}

/**
 * Убирает явно переданные `undefined`.
 *
 * `{ ...defaults, ...{ preferLift: undefined } }` затёр бы значение по
 * умолчанию на `undefined`, а такой объект легко получить, собирая опции из
 * состояния интерфейса.
 */
function stripUndefined(options: PathfindingOptions): PathfindingOptions {
  const result: PathfindingOptions = {};

  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }

  return result;
}

/** Результат «пути нет»: код причины для интерфейса и описание для разработчика. */
function notFound(reason: PathFailureReason, error: string): PathResult {
  return {
    found: false,
    path: [],
    cost: 0,
    distanceMeters: null,
    durationSeconds: null,
    reason,
    error,
  };
}

/**
 * Восстанавливает путь по карте предшественников.
 */
function reconstructPath(cameFrom: StateMap<SearchState>, end: SearchState): string[] {
  const path: string[] = [];

  for (let state: SearchState | undefined = end; state !== undefined; state = cameFrom.get(state)) {
    path.push(state.nodeId);
  }

  return path.reverse();
}

/**
 * Разбивает путь на шаги и считает его физику.
 *
 * Проходит путь с тем же правилом посадки в лифт и той же функцией
 * стоимости, что и поиск, поэтому сумма стоимостей шагов равна найденной
 * стоимости при любых опциях. Раньше шаги считались по «сырым» весам без
 * учёта `preferLift`, и итог расходился с суммой шагов ровно на надбавку.
 */
function describePath(
  graph: Graph,
  path: string[],
  opts: NormalizedOptions
): Pick<PathResult, 'segments' | 'distanceMeters' | 'durationSeconds'> {
  const segments: PathSegment[] = [];
  const total: StepPhysics | null = graph.isMetric ? { meters: 0, seconds: 0 } : null;
  let inLift = false;

  for (let i = 0; i < path.length - 1; i++) {
    const from = graph.getNode(path[i]);
    const to = graph.getNode(path[i + 1]);
    if (!from || !to) continue;

    const transitionType = graph.getTransitionType(from.id, to.id);
    const boarding = transitionType === 'lift' && !inLift;

    const step = stepPhysics(graph, from, to, transitionType, boarding);

    segments.push({
      fromNode: from.id,
      toNode: to.id,
      transitionType,
      cost: stepCost(graph, from, to, transitionType, boarding, opts),
      distanceMeters: step?.meters ?? null,
      durationSeconds: step?.seconds ?? null,
    });

    if (total !== null && step !== null) {
      total.meters += step.meters;
      total.seconds += step.seconds;
    }

    inLift = transitionType === 'lift';
  }

  return {
    segments,
    distanceMeters: total?.meters ?? null,
    durationSeconds: total?.seconds ?? null,
  };
}

/**
 * Общий A*-обход.
 *
 * Единственная реализация поиска: `findPath`, `findAlternativePaths` и
 * `findNearest` отличаются только целью и необязательным исключением одного
 * ребра, поэтому вторая копия алгоритма не нужна. Существование концов
 * проверяет вызывающая сторона.
 *
 * @param excludeEdgeKey канонический ключ ребра, которое нельзя использовать
 */
function search(
  graph: Graph,
  startNode: MapNode,
  goal: SearchGoal,
  opts: NormalizedOptions,
  excludeEdgeKey?: string
): PathResult {
  const startId = startNode.id;

  if (goal.reached(startId)) {
    return { found: true, path: [startId], cost: 0, ...describePath(graph, [startId], opts) };
  }

  const start: SearchState = { nodeId: startId, inLift: false };
  const gScore = new StateMap<number>();
  const cameFrom = new StateMap<SearchState>();
  gScore.set(start, 0);

  const openSet = new PriorityQueue();
  openSet.push({ ...start, gScore: 0, fScore: goal.estimate(startNode) });

  let iterations = 0;

  while (!openSet.isEmpty) {
    if (++iterations > opts.maxIterations) {
      return notFound('iteration-limit', `Превышен лимит итераций (${opts.maxIterations})`);
    }

    const current = openSet.pop()!;

    // Ленивое удаление: состояние могло попасть в очередь несколько раз.
    // Пропускаем запись, устаревшую относительно лучшего известного пути.
    //
    // Закрытого множества нет намеренно. При согласованной эвристике оно
    // ничего бы не меняло, но согласованность держится на неравенстве из
    // вещественных чисел, и погрешность округления могла бы запретить
    // повторно обработать состояние, до которого нашёлся путь дешевле на
    // долю секунды. Проверка по gScore такой ошибки не допускает.
    if (current.gScore > (gScore.get(current) ?? Number.POSITIVE_INFINITY)) continue;

    if (goal.reached(current.nodeId)) {
      const path = reconstructPath(cameFrom, current);
      return { found: true, path, cost: current.gScore, ...describePath(graph, path, opts) };
    }

    const currentNode = graph.getNode(current.nodeId);
    if (!currentNode) continue;

    for (const neighborId of graph.getNeighbors(current.nodeId)) {
      if (excludeEdgeKey !== undefined && edgeKey(current.nodeId, neighborId) === excludeEdgeKey) {
        continue;
      }

      const neighborNode = graph.getNode(neighborId);
      if (!neighborNode) continue;

      const transitionType = graph.getTransitionType(current.nodeId, neighborId);
      const boarding = transitionType === 'lift' && !current.inLift;
      const cost = stepCost(graph, currentNode, neighborNode, transitionType, boarding, opts);
      if (!Number.isFinite(cost)) continue;

      const next: SearchState = { nodeId: neighborId, inLift: transitionType === 'lift' };
      const tentativeG = current.gScore + cost;
      if (tentativeG >= (gScore.get(next) ?? Number.POSITIVE_INFINITY)) continue;

      cameFrom.set(next, { nodeId: current.nodeId, inLift: current.inLift });
      gScore.set(next, tentativeG);
      openSet.push({
        ...next,
        gScore: tentativeG,
        fScore: tentativeG + goal.estimate(neighborNode),
      });
    }
  }

  return notFound('unreachable', 'Путь не найден — точки не связаны');
}

/** Узлы концов маршрута либо результат «пути нет», если какого-то нет в графе. */
function resolveEnds(graph: Graph, startId: string, endId: string): [MapNode, MapNode] | PathResult {
  const startNode = graph.getNode(startId);
  const endNode = graph.getNode(endId);

  if (!startNode) return notFound('unknown-start', `Начальная точка "${startId}" не найдена`);
  if (!endNode) return notFound('unknown-end', `Конечная точка "${endId}" не найдена`);

  return [startNode, endNode];
}

/** Цель — один узел; оценка остатка — эвристика модели стоимости. */
function nodeGoal(graph: Graph, end: MapNode): SearchGoal {
  return {
    reached: (nodeId) => nodeId === end.id,
    estimate: (node) => heuristic(graph, node, end),
  };
}

/**
 * Ищет кратчайший путь между двумя узлами.
 *
 * Результат оптимален для модели стоимости графа (`costModel.ts`). В
 * пиксельном режиме эвристика нулевая, и поиск — алгоритм Дейкстры; в
 * метрическом она согласованная нижняя оценка времени до цели. Оптимальность
 * в обоих режимах закреплена оракулом `tests/pathfinding.optimality.test.ts`.
 *
 * Раньше здесь стояло обещание оптимальности, которого код не выполнял:
 * эвристикой было евклидово расстояние без учёта этажа, то есть разность
 * координат из двух несвязанных пиксельных систем.
 */
export function findPath(
  graph: Graph,
  startId: string,
  endId: string,
  options: PathfindingOptions = {}
): PathResult {
  const ends = resolveEnds(graph, startId, endId);
  if (!Array.isArray(ends)) return ends;

  return search(graph, ends[0], nodeGoal(graph, ends[1]), normalizeOptions(options));
}

/**
 * Ищет путь до ближайшей из нескольких целей — например, до ближайшего туалета.
 *
 * Один поиск до множества целей, а не `findPath` до каждой: обход
 * останавливается на первой извлечённой цели, и она по построению ближайшая в
 * модели стоимости — так же, как `findPath` оптимален до одной цели. Оценки
 * остатка нет, поиск — алгоритм Дейкстры: наименьшую из эвристик до всех целей
 * пришлось бы считать на каждом узле, а ближайшая цель обычно рядом (запись 19).
 *
 * Цели, которых нет в графе, пропускаются. Причины неудачи — как у `findPath`:
 * `unknown-end` означает, что ни одной из целей в графе нет.
 */
export function findNearest(
  graph: Graph,
  startId: string,
  targetIds: Iterable<string>,
  options: PathfindingOptions = {}
): PathResult {
  const startNode = graph.getNode(startId);
  if (!startNode) return notFound('unknown-start', `Начальная точка "${startId}" не найдена`);

  const targets = new Set([...targetIds].filter((id) => graph.hasNode(id)));
  if (targets.size === 0) return notFound('unknown-end', 'Ни одной из целей нет в графе');

  const goal: SearchGoal = { reached: (nodeId) => targets.has(nodeId), estimate: () => 0 };
  return search(graph, startNode, goal, normalizeOptions(options));
}

/**
 * Ищет основной путь и альтернативные варианты.
 *
 * Метод исключения рёбер: поочерёдно запрещаем каждое ребро основного пути
 * и пересчитываем маршрут. Если после запрета путь всё ещё существует и
 * отличается от уже найденных — это альтернатива.
 *
 * Обход рёбер детерминирован (от старта к финишу), поэтому результат
 * воспроизводим от запуска к запуску. Прежняя версия выбирала ребро
 * двойным взятием остатка от середины пути и вела неиспользуемый набор
 * `usedEdges`; поведение было трудно предсказать и невозможно объяснить.
 *
 * На графе-дереве альтернатив нет по определению — это корректный
 * результат, а не ошибка.
 */
export function findAlternativePaths(
  graph: Graph,
  startId: string,
  endId: string,
  options: PathfindingOptions = {},
  maxPaths: number = 3
): MultiPathResult {
  const opts = normalizeOptions(options);
  const ends = resolveEnds(graph, startId, endId);
  if (!Array.isArray(ends)) return { primary: ends, alternatives: [] };

  const goal = nodeGoal(graph, ends[1]);
  const primary = search(graph, ends[0], goal, opts);

  if (!primary.found || maxPaths < 2 || primary.path.length < 2) {
    return { primary, alternatives: [] };
  }

  const alternatives: PathResult[] = [];
  const seenPaths = new Set<string>([primary.path.join(',')]);
  const wanted = maxPaths - 1;

  for (let i = 0; i < primary.path.length - 1 && alternatives.length < wanted; i++) {
    const exclude = edgeKey(primary.path[i], primary.path[i + 1]);
    const candidate = search(graph, ends[0], goal, opts, exclude);

    if (!candidate.found) continue;

    const key = candidate.path.join(',');
    if (seenPaths.has(key)) continue;

    seenPaths.add(key);
    alternatives.push(candidate);
  }

  alternatives.sort((a, b) => a.cost - b.cost);

  return { primary, alternatives: alternatives.slice(0, wanted) };
}
