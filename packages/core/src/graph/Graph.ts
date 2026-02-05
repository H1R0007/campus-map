import type { MapNode, MapNodeData } from '../types/node';
import type { Transition, TransitionData, TransitionType } from '../types/transition';
import { parseTransitionType } from '../types/transition';

/**
 * Структура JSON-файла графа
 */
interface GraphJson {
  nodes: MapNodeData[];
}

/**
 * Структура JSON-файла переходов
 */
interface TransitionsJson {
  transitions: TransitionData[];
}

/**
 * Класс графа навигации.
 * Хранит узлы и переходы, предоставляет методы доступа.
 */
export class Graph {
  private nodes: Map<string, MapNode> = new Map();
  private transitions: Transition[] = [];
  private transitionIndex: Map<string, string[]> = new Map();

  /**
   * Загрузка узлов из JSON
   */
  loadNodes(json: GraphJson, defaultBuilding: string = 'CAMPUS', defaultFloor: number = 0): void {
    if (!json.nodes || !Array.isArray(json.nodes)) {
      console.warn('Graph.loadNodes: invalid structure, expected { nodes: [...] }');
      return;
    }

    for (const nodeData of json.nodes) {
      if (!nodeData.id) {
        console.warn('Graph.loadNodes: node without id, skipping');
        continue;
      }

      const node: MapNode = {
        id: nodeData.id,
        x: nodeData.x ?? 0,
        y: nodeData.y ?? 0,
        floor: nodeData.floor ?? defaultFloor,
        building: nodeData.building ?? defaultBuilding,
        isPortal: nodeData.isPortal ?? false,
        neighbors: nodeData.neighbors ?? [],
      };

      this.nodes.set(node.id, node);
    }
  }

  /**
   * Загрузка переходов из JSON
   */
  loadTransitions(json: TransitionsJson): void {
    if (!json.transitions || !Array.isArray(json.transitions)) {
      console.warn('Graph.loadTransitions: invalid structure');
      return;
    }

    const seen = new Set<string>();

    for (const tr of json.transitions) {
      if (!tr.from?.node || !tr.to?.node) {
        console.warn('Graph.loadTransitions: malformed transition, skipping');
        continue;
      }

      const fromNode = tr.from.node;
      const toNode = tr.to.node;
      
      // Ключ для дедупликации (порядок не важен)
      const key = [fromNode, toNode].sort().join('|');
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const transition: Transition = {
        fromNode,
        toNode,
        type: parseTransitionType(tr.transition_type ?? 'unknown'),
      };

      this.transitions.push(transition);

      // Индексируем для быстрого поиска
      this.indexTransition(fromNode, toNode);
      this.indexTransition(toNode, fromNode);
    }
  }

  private indexTransition(from: string, to: string): void {
    const existing = this.transitionIndex.get(from) ?? [];
    if (!existing.includes(to)) {
      existing.push(to);
      this.transitionIndex.set(from, existing);
    }
  }

  /**
   * Получить узел по ID
   */
  getNode(id: string): MapNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Получить все узлы
   */
  getAllNodes(): MapNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Получить узлы определённого корпуса/этажа
   */
  getNodesForFloor(building: string, floor: number): MapNode[] {
    return this.getAllNodes().filter(
      (n) => n.building === building && n.floor === floor
    );
  }

  /**
   * Получить узлы кампуса
   */
  getCampusNodes(): MapNode[] {
    return this.getAllNodes().filter((n) => n.building === 'CAMPUS');
  }

  /**
   * Получить всех соседей узла (включая переходы)
   */
  getNeighbors(nodeId: string): string[] {
    const node = this.nodes.get(nodeId);
    if (!node) return [];

    const neighbors = [...node.neighbors];
    
    // Добавляем соседей через переходы
    const transitionNeighbors = this.transitionIndex.get(nodeId) ?? [];
    for (const tn of transitionNeighbors) {
      if (!neighbors.includes(tn)) {
        neighbors.push(tn);
      }
    }

    return neighbors;
  }

  /**
   * Получить тип перехода между двумя узлами (если есть)
   */
  getTransitionType(nodeA: string, nodeB: string): TransitionType | null {
    for (const tr of this.transitions) {
      if (
        (tr.fromNode === nodeA && tr.toNode === nodeB) ||
        (tr.fromNode === nodeB && tr.toNode === nodeA)
      ) {
        return tr.type;
      }
    }
    return null;
  }

  /**
   * Получить все переходы
   */
  getAllTransitions(): Transition[] {
    return [...this.transitions];
  }

  /**
   * Проверить существование узла
   */
  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  /**
   * Количество узлов
   */
  get nodeCount(): number {
    return this.nodes.size;
  }

  /**
   * Количество переходов
   */
  get transitionCount(): number {
    return this.transitions.length;
  }

  /**
   * Очистить граф
   */
  clear(): void {
    this.nodes.clear();
    this.transitions = [];
    this.transitionIndex.clear();
  }
}