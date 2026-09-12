// packages/core/src/graph/Graph.ts

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
  
  // Индекс: nodeId -> список соседей через transitions
  private transitionIndex: Map<string, string[]> = new Map();
  
  // Индекс: "nodeA|nodeB" -> TransitionType (для быстрого lookup)
  private transitionTypeIndex: Map<string, TransitionType> = new Map();

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

      const transitionType = parseTransitionType(tr.transition_type ?? 'entrance');
      
      const transition: Transition = {
        fromNode,
        toNode,
        type: transitionType,
      };

      this.transitions.push(transition);

      // Индексируем для быстрого поиска соседей
      this.indexTransition(fromNode, toNode);
      this.indexTransition(toNode, fromNode);
      
      // Индексируем тип перехода
      this.transitionTypeIndex.set(key, transitionType);
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

    const neighbors = new Set(node.neighbors);
    
    // Добавляем соседей через переходы
    const transitionNeighbors = this.transitionIndex.get(nodeId) ?? [];
    for (const tn of transitionNeighbors) {
      neighbors.add(tn);
    }

    return Array.from(neighbors);
  }

  /**
   * Получить тип перехода между двумя узлами (если есть)
   */
  getTransitionType(nodeA: string, nodeB: string): TransitionType | null {
    const key = [nodeA, nodeB].sort().join('|');
    return this.transitionTypeIndex.get(key) ?? null;
  }

  /**
   * Получить объект перехода между двумя узлами (если есть)
   */
  getTransition(nodeA: string, nodeB: string): Transition | null {
    for (const tr of this.transitions) {
      if (
        (tr.fromNode === nodeA && tr.toNode === nodeB) ||
        (tr.fromNode === nodeB && tr.toNode === nodeA)
      ) {
        return tr;
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
   * Получить переходы для узла
   */
  getTransitionsForNode(nodeId: string): Transition[] {
    return this.transitions.filter(
      t => t.fromNode === nodeId || t.toNode === nodeId
    );
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
    this.transitionTypeIndex.clear();
  }

  /**
   * Добавить узел (для editor)
   */
  addNode(node: MapNode): void {
    this.nodes.set(node.id, node);
  }

  /**
   * Удалить узел (для editor)
   */
  removeNode(id: string): boolean {
    return this.nodes.delete(id);
  }

  /**
   * Добавить переход (для editor)
   */
  addTransition(transition: Transition): void {
    const key = [transition.fromNode, transition.toNode].sort().join('|');
    
    // Проверяем дубликат
    if (this.transitionTypeIndex.has(key)) {
      return;
    }
    
    this.transitions.push(transition);
    this.indexTransition(transition.fromNode, transition.toNode);
    this.indexTransition(transition.toNode, transition.fromNode);
    this.transitionTypeIndex.set(key, transition.type);
  }

  /**
   * Удалить переход (для editor)
   */
  removeTransition(nodeA: string, nodeB: string): boolean {
    const key = [nodeA, nodeB].sort().join('|');
    
    const idx = this.transitions.findIndex(
      t => (t.fromNode === nodeA && t.toNode === nodeB) ||
           (t.fromNode === nodeB && t.toNode === nodeA)
    );
    
    if (idx === -1) return false;
    
    this.transitions.splice(idx, 1);
    this.transitionTypeIndex.delete(key);
    
    // Обновляем индекс соседей
    const neighborsA = this.transitionIndex.get(nodeA);
    if (neighborsA) {
      const filtered = neighborsA.filter(n => n !== nodeB);
      if (filtered.length > 0) {
        this.transitionIndex.set(nodeA, filtered);
      } else {
        this.transitionIndex.delete(nodeA);
      }
    }
    
    const neighborsB = this.transitionIndex.get(nodeB);
    if (neighborsB) {
      const filtered = neighborsB.filter(n => n !== nodeA);
      if (filtered.length > 0) {
        this.transitionIndex.set(nodeB, filtered);
      } else {
        this.transitionIndex.delete(nodeB);
      }
    }
    
    return true;
  }
}