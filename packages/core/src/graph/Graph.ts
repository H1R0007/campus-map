import { edgeKey, floorKey } from '../geometry.js';
import type { Dataset } from '../types/dataset.js';
import type { MapNode } from '../types/node.js';
import type { Transition, TransitionType } from '../types/transition.js';
import { CAMPUS_BUILDING_ID, CAMPUS_FLOOR } from '../dataset/paths.js';

/**
 * Немутабельный навигационный граф.
 *
 * Все индексы строятся один раз в конструкторе, поэтому типовые операции —
 * O(1), а не O(N):
 *
 * - `nodes`            — id → узел;
 * - `nodesByFloor`     — «корпус#этаж» → узлы этажа;
 * - `transitionsByKey` — канонический ключ ребра → переход;
 * - `adjacency`        — id → объединённый список соседей (свои рёбра этажа
 *                        плюс переходы), уже очищенный от несуществующих
 *                        узлов и дубликатов.
 *
 * Граф намеренно неизменяемый: редактор хранит собственное мутабельное
 * состояние и собирает из него новый `Graph` перед поиском пути. Прежний
 * мутационный API (`addNode`, `removeNode`, `addTransition`,
 * `removeTransition`, `clear`) не вызывался ни из одного приложения и
 * создавал риск рассинхронизации индексов.
 *
 * Индексация по этажу и предварительно собранный список смежности — это
 * задел под реальные данные: корпусов и этажей будет заметно больше трёх,
 * а A* вызывает `getNeighbors` для каждого раскрываемого узла.
 */
export class Graph {
  private readonly nodes: Map<string, MapNode>;
  private readonly nodesByFloor: Map<string, MapNode[]>;
  private readonly transitions: Transition[];
  private readonly transitionsByKey: Map<string, Transition>;
  private readonly adjacency: Map<string, string[]>;

  constructor(nodes: Iterable<MapNode> = [], transitions: Iterable<Transition> = []) {
    this.nodes = new Map();
    this.nodesByFloor = new Map();
    this.transitions = [];
    this.transitionsByKey = new Map();
    this.adjacency = new Map();

    for (const node of nodes) {
      this.nodes.set(node.id, node);

      const key = floorKey(node.building, node.floor);
      const bucket = this.nodesByFloor.get(key);
      if (bucket) {
        bucket.push(node);
      } else {
        this.nodesByFloor.set(key, [node]);
      }
    }

    // Собственные рёбра этажа: сразу в индекс смежности.
    for (const node of this.nodes.values()) {
      this.adjacency.set(node.id, [...node.neighbors]);
    }

    for (const transition of transitions) {
      const key = edgeKey(transition.fromNode, transition.toNode);

      // Переход ненаправленный, поэтому повтор того же ребра игнорируется.
      if (this.transitionsByKey.has(key)) continue;

      this.transitions.push(transition);
      this.transitionsByKey.set(key, transition);
      this.link(transition.fromNode, transition.toNode);
      this.link(transition.toNode, transition.fromNode);
    }

    // Соседи должны существовать в графе и не повторяться.
    for (const [id, neighbors] of this.adjacency) {
      this.adjacency.set(id, dedupeExisting(neighbors, this.nodes));
    }
  }

  /**
   * Собирает граф из нормализованного датасета.
   */
  static fromDataset(dataset: Dataset): Graph {
    return new Graph(dataset.nodes, dataset.transitions);
  }

  /** Добавляет узел в индекс смежности с обеих сторон. */
  private link(from: string, to: string): void {
    this.appendNeighbor(from, to);
    this.appendNeighbor(to, from);
  }

  private appendNeighbor(id: string, neighbor: string): void {
    const list = this.adjacency.get(id);
    if (list) {
      list.push(neighbor);
    } else {
      this.adjacency.set(id, [neighbor]);
    }
  }

  /** Узел по id. */
  getNode(id: string): MapNode | undefined {
    return this.nodes.get(id);
  }

  /** Существует ли узел. */
  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  /** Все узлы графа. */
  getAllNodes(): MapNode[] {
    return [...this.nodes.values()];
  }

  /**
   * Узлы конкретного этажа конкретного корпуса.
   *
   * Возвращает внутренний массив индекса — без копирования, потому что
   * вызывается на каждую перерисовку слоя карты. Тип `readonly` здесь не
   * формальность: раньше он был изменяемым, и вызывающая сторона могла
   * молча дописать узел прямо в индекс неизменяемого графа. Так же устроен
   * `getNeighbors`.
   */
  getNodesForFloor(building: string, floor: number): readonly MapNode[] {
    return this.nodesByFloor.get(floorKey(building, floor)) ?? EMPTY_NODES;
  }

  /** Узлы территории кампуса. */
  getCampusNodes(): readonly MapNode[] {
    return this.getNodesForFloor(CAMPUS_BUILDING_ID, CAMPUS_FLOOR);
  }

  /**
   * Все достижимые соседи узла: рёбра своего этажа плюс переходы.
   *
   * Возвращает внутренний массив — менять его нельзя.
   */
  getNeighbors(nodeId: string): readonly string[] {
    return this.adjacency.get(nodeId) ?? EMPTY_NEIGHBORS;
  }

  /**
   * Тип перехода между двумя узлами, либо `null`, если это обычное ребро.
   * Порядок аргументов не важен.
   */
  getTransitionType(nodeA: string, nodeB: string): TransitionType | null {
    return this.transitionsByKey.get(edgeKey(nodeA, nodeB))?.type ?? null;
  }

  /** Число узлов. */
  get nodeCount(): number {
    return this.nodes.size;
  }

  /** Число переходов (без дубликатов). */
  get transitionCount(): number {
    return this.transitions.length;
  }
}

const EMPTY_NEIGHBORS: readonly string[] = Object.freeze([]);

/** Общий пустой список узлов: промах по индексу не должен выделять массив. */
const EMPTY_NODES: readonly MapNode[] = Object.freeze([]);

function dedupeExisting(ids: string[], nodes: Map<string, MapNode>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const id of ids) {
    if (seen.has(id)) continue;
    if (!nodes.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
}
