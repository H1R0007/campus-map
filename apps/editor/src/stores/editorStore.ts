// apps/editor/src/stores/editorStore.ts

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import {
  MapNode,
  Transition,
  BuildingMeta,
  TransitionType,
  Graph,
  findAlternativePaths,
  PathfindingOptions,
} from '@campus-map/core';
import { useHistoryStore } from './historyStore';
import { autoFixDataset, AutoFixReport } from '../utils/autoFix';

enableMapSet();

export type EditorTool = 'select' | 'node' | 'edge' | 'transition' | 'delete' | 'line';

type NeighborSnapshot = Record<string, string[]>;

function snapshotNeighbors(nodes: Map<string, MapNode>, ids: string[]): NeighborSnapshot {
  const snap: NeighborSnapshot = {};
  for (const id of ids) {
    const n = nodes.get(id);
    if (n) snap[id] = [...n.neighbors];
  }
  return snap;
}

function applyNeighborsSnapshot(nodes: Map<string, MapNode>, snap: NeighborSnapshot) {
  for (const id of Object.keys(snap)) {
    const n = nodes.get(id);
    if (n) n.neighbors = [...snap[id]];
  }
}

type LinePoint = { x: number; y: number };

type LineToolState = {
  start: LinePoint | null;
  end: LinePoint | null;
  count: number;
  autoConnect: boolean;
};

interface DisplayFilters {
  showPortals: boolean;
  showEdges: boolean;
  showTransitions: boolean;
  highlightOrphans: boolean;
  highlightNoAlias: boolean;
  highlightErrors: boolean;
  showAliasLabels: boolean;
}

interface GridSettings {
  enabled: boolean;
  size: number;
  snap: boolean;
  visible: boolean;
}

interface ClipboardData {
  nodes: MapNode[];
  internalEdges: { from: string; to: string }[];
}

type NodeComments = Map<string, string>;

interface RouteSimulation {
  active: boolean;
  fromNodeId: string | null;
  toNodeId: string | null;
  path: string[];
  alternativePaths: string[][];
  animationIndex: number;
  selectedPathIndex: number;
  animationSpeed: number;
  pathfindingOptions: PathfindingOptions;
}

interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  nodeId: string | null;
  edgeFrom: string | null;
  edgeTo: string | null;
}

interface EditorState {
  currentBuilding: string | null;
  currentFloor: number | null;

  activeTool: EditorTool;
  transitionType: TransitionType;

  nodes: Map<string, MapNode>;
  transitions: Transition[];
  buildingMetas: Map<string, BuildingMeta>;
  aliases: Map<string, string[]>;
  comments: NodeComments;

  selectedNodeIds: Set<string>;
  hoveredNodeId: string | null;
  hoveredEdge: { from: string; to: string } | null;
  hoveredTransition: { from: string; to: string } | null;

  edgeStartNodeId: string | null;
  transitionStartNodeId: string | null;

  hasUnsavedChanges: boolean;
  isLoading: boolean;
  nodeIdCounter: number;

  diagnosticsOpen: boolean;
  searchOpen: boolean;
  statisticsOpen: boolean;
  filtersOpen: boolean;
  routeSimulatorOpen: boolean;

  lineTool: LineToolState;
  displayFilters: DisplayFilters;
  gridSettings: GridSettings;
  clipboard: ClipboardData | null;
  searchHistory: string[];
  bookmarks: Map<string, { nodeId: string; name: string; createdAt: number }>;
  routeSimulation: RouteSimulation;

  selectionBox: {
    active: boolean;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null;

  inlineEditNodeId: string | null;
  cameraCenterRequest: { x: number; y: number; zoom?: number } | null;

  routePickMode: boolean;
  routePickTarget: 'from' | 'to' | null;

  contextMenu: ContextMenuState;
}

/**
 * Создаёт временный Graph из текущего состояния editor для использования core pathfinding
 */
function buildGraphFromState(nodes: Map<string, MapNode>, transitions: Transition[]): Graph {
  const graph = new Graph();

  // Добавляем узлы напрямую
  for (const node of nodes.values()) {
    graph.addNode({ ...node, neighbors: [...node.neighbors] });
  }

  // Добавляем переходы
  for (const t of transitions) {
    graph.addTransition({ ...t });
  }

  return graph;
}

/**
 * Проверка связности графа (BFS)
 */
function checkConnectivity(nodes: Map<string, MapNode>, transitions: Transition[]): { connected: boolean; components: string[][] } {
  const allNodeIds = Array.from(nodes.keys());
  if (allNodeIds.length === 0) return { connected: true, components: [] };

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const startId of allNodeIds) {
    if (visited.has(startId)) continue;

    const component: string[] = [];
    const queue = [startId];
    visited.add(startId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      const node = nodes.get(current);
      if (!node) continue;

      const neighbors = [...node.neighbors];
      for (const t of transitions) {
        if (t.fromNode === current && !neighbors.includes(t.toNode)) neighbors.push(t.toNode);
        if (t.toNode === current && !neighbors.includes(t.fromNode)) neighbors.push(t.fromNode);
      }

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor) && nodes.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    components.push(component);
  }

  return {
    connected: components.length <= 1,
    components,
  };
}

interface EditorActions {
  setCurrentBuilding: (buildingId: string | null) => void;
  setCurrentFloor: (floor: number | null) => void;
  setActiveTool: (tool: EditorTool) => void;
  setTransitionType: (type: TransitionType) => void;
  generateNodeId: () => string;
  addNode: (x: number, y: number) => string;
  removeNode: (nodeId: string) => void;
  moveNode: (nodeId: string, x: number, y: number) => void;
  commitMoveNode: (nodeId: string, fromX: number, fromY: number, toX: number, toY: number) => void;
  updateNode: (nodeId: string, updates: Partial<MapNode>) => void;
  addEdge: (fromId: string, toId: string) => void;
  removeEdge: (fromId: string, toId: string) => void;
  addTransition: (fromId: string, toId: string, type: TransitionType) => void;
  removeTransition: (fromId: string, toId: string) => void;
  setNodeAliases: (nodeId: string, names: string[]) => void;
  getNodeAliases: (nodeId: string) => string[];
  toggleSelectNode: (nodeId: string, addToSelection?: boolean) => void;
  selectSingleNode: (nodeId: string) => void;
  clearSelection: () => void;
  setHoveredNode: (nodeId: string | null) => void;
  setHoveredEdge: (edge: { from: string; to: string } | null) => void;
  setHoveredTransition: (t: { from: string; to: string } | null) => void;
  setEdgeStartNode: (nodeId: string | null) => void;
  setTransitionStartNode: (nodeId: string | null) => void;
  undo: () => void;
  redo: () => void;
  autoFix: () => AutoFixReport;
  loadData: (data: any) => void;
  exportToZip: () => Promise<void>;
  setDiagnosticsOpen: (open: boolean) => void;
  lineReset: () => void;
  lineSetStart: (x: number, y: number) => void;
  lineSetEnd: (x: number, y: number) => void;
  lineSetCount: (count: number) => void;
  lineSetAutoConnect: (v: boolean) => void;
  lineConfirm: () => void;
  getNode: (nodeId: string) => MapNode | undefined;
  getNodesForCurrentFloor: () => MapNode[];
  getEdgesForCurrentFloor: () => { from: string; to: string }[];
  getVisibleTransitions: () => Transition[];
  getTransitionsForNode: (nodeId: string) => Transition[];

  searchNodes: (query: string) => MapNode[];
  addToSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;
  centerOnNode: (nodeId: string, keepZoom?: boolean) => void;
  setCameraCenter: (x: number, y: number, zoom?: number) => void;
  clearCameraCenter: () => void;

  addToSelection: (nodeIds: string[]) => void;
  removeFromSelection: (nodeIds: string[]) => void;
  selectNodesInRect: (x1: number, y1: number, x2: number, y2: number) => void;
  selectAll: () => void;

  deleteSelected: () => void;
  duplicateSelected: () => void;
  moveSelectedBy: (dx: number, dy: number) => void;
  setSelectedPortal: (isPortal: boolean) => void;
  connectSelectedChain: () => void;

  copySelected: () => void;
  paste: (offsetX?: number, offsetY?: number) => void;

  setGridSettings: (settings: Partial<GridSettings>) => void;
  snapToGrid: (value: number) => number;

  setDisplayFilters: (filters: Partial<DisplayFilters>) => void;

  setNodeComment: (nodeId: string, comment: string) => void;
  getNodeComment: (nodeId: string) => string;

  setInlineEditNode: (nodeId: string | null) => void;

  // ROUTE SIMULATION - ВСЕ МЕТОДЫ
  setRouteSimulation: (sim: Partial<RouteSimulation>) => void;
  calculateRoute: (fromId: string, toId: string) => void;
  setRoutePathfindingOptions: (opts: Partial<PathfindingOptions>) => void;
  startRouteAnimation: () => void;
  stopRouteAnimation: () => void;
  setRouteSelectedPath: (index: number) => void;
  setRouteAnimationSpeed: (speed: number) => void;
  navigateToNode: (nodeId: string) => void;

  setRoutePickMode: (enabled: boolean) => void;
  setRoutePickTarget: (target: 'from' | 'to' | null) => void;
  pickRouteNode: (nodeId: string) => boolean;

  startSelectionBox: (x: number, y: number) => void;
  updateSelectionBox: (x: number, y: number) => void;
  finishSelectionBox: () => void;
  cancelSelectionBox: () => void;

  setSearchOpen: (open: boolean) => void;
  setStatisticsOpen: (open: boolean) => void;
  setFiltersOpen: (open: boolean) => void;
  setRouteSimulatorOpen: (open: boolean) => void;

  openContextMenu: (x: number, y: number, nodeId: string | null, edgeFrom?: string | null, edgeTo?: string | null) => void;
  closeContextMenu: () => void;

  getOrphanNodes: () => MapNode[];
  getNodesWithoutAlias: () => MapNode[];
  getNodesWithErrors: () => MapNode[];
  isGraphConnected: () => { connected: boolean; components: string[][] };

  // Edge operations
  splitEdge: (fromId: string, toId: string) => string | null;
  subdivideEdge: (fromId: string, toId: string, count: number) => string[];

  // Bookmarks
  addBookmark: (nodeId: string, name?: string) => void;
  removeBookmark: (id: string) => void;
  renameBookmark: (id: string, name: string) => void;
  goToBookmark: (id: string) => void;
}

type EditorStore = EditorState & EditorActions;

export const useEditorStore = create<EditorStore>()(
  immer((set, get) => ({
    currentBuilding: null,
    currentFloor: null,
    activeTool: 'select',
    transitionType: 'entrance',
    nodes: new Map(),
    transitions: [],
    buildingMetas: new Map(),
    aliases: new Map(),
    comments: new Map(),
    selectedNodeIds: new Set(),
    hoveredNodeId: null,
    hoveredEdge: null,
    hoveredTransition: null,
    edgeStartNodeId: null,
    transitionStartNodeId: null,
    hasUnsavedChanges: false,
    isLoading: true,
    nodeIdCounter: 1,
    diagnosticsOpen: false,
    searchOpen: false,
    statisticsOpen: false,
    filtersOpen: false,
    routeSimulatorOpen: false,

    lineTool: {
      start: null,
      end: null,
      count: 8,
      autoConnect: true,
    },

    displayFilters: {
      showPortals: true,
      showEdges: true,
      showTransitions: true,
      highlightOrphans: false,
      highlightNoAlias: false,
      highlightErrors: false,
      showAliasLabels: false,
    },

    gridSettings: {
      enabled: false,
      size: 20,
      snap: true,
      visible: true,
    },

    clipboard: null,
    searchHistory: [],

    routeSimulation: {
      active: false,
      fromNodeId: null,
      toNodeId: null,
      path: [],
      alternativePaths: [],
      animationIndex: 0,
      selectedPathIndex: 0,
      animationSpeed: 800,
      pathfindingOptions: {
        allowStairs: true,
        allowLift: true,
        allowBridge: true,
        allowEntrance: true,
        preferLift: false,
      },
    },

    selectionBox: null,
    inlineEditNodeId: null,
    cameraCenterRequest: null,

    routePickMode: true,
    routePickTarget: 'from',

    contextMenu: {
      open: false,
      x: 0,
      y: 0,
      nodeId: null,
      edgeFrom: null,
      edgeTo: null,
    },

    // === CONTEXT MENU ===
    openContextMenu: (x, y, nodeId, edgeFrom = null, edgeTo = null) => set((s) => {
      s.contextMenu = { open: true, x, y, nodeId, edgeFrom, edgeTo };
    }),

    closeContextMenu: () => set((s) => {
      s.contextMenu.open = false;
    }),

    // === ROUTE PICK MODE ===
    setRoutePickMode: (enabled) => set((s) => {
      s.routePickMode = enabled;
      if (!enabled) {
        s.routePickTarget = null;
      }
    }),

    setRoutePickTarget: (target) => set((s) => {
      s.routePickTarget = target;
    }),

    pickRouteNode: (nodeId) => {
      const st = get();
      if (!st.routePickMode || !st.routeSimulatorOpen) return false;

      const node = st.nodes.get(nodeId);
      if (!node) return false;

      if (st.routePickTarget === 'from' || (!st.routeSimulation.fromNodeId && !st.routePickTarget)) {
        set((s) => {
          s.routeSimulation.fromNodeId = nodeId;
          s.routePickTarget = 'to';
        });
        return true;
      } else if (st.routePickTarget === 'to' || (!st.routeSimulation.toNodeId && st.routeSimulation.fromNodeId)) {
        set((s) => {
          s.routeSimulation.toNodeId = nodeId;
          s.routePickTarget = null;
        });
        const fromId = st.routeSimulation.fromNodeId;
        if (fromId) {
          setTimeout(() => get().calculateRoute(fromId, nodeId), 0);
        }
        return true;
      }
      return false;
    },

        bookmarks: new Map(),

    // === BOOKMARKS ===
    addBookmark: (nodeId, name) => {
      const node = get().nodes.get(nodeId);
      if (!node) return;

      const aliases = get().aliases.get(nodeId) || [];
      const defaultName = aliases[0] || nodeId;
      const bookmarkId = `bm_${Date.now()}`;

      set((s) => {
        s.bookmarks.set(bookmarkId, {
          nodeId,
          name: name || defaultName,
          createdAt: Date.now(),
        });
      });
    },

    removeBookmark: (id) => set((s) => {
      s.bookmarks.delete(id);
    }),

    renameBookmark: (id, name) => set((s) => {
      const bm = s.bookmarks.get(id);
      if (bm) {
        bm.name = name;
      }
    }),

    goToBookmark: (id) => {
      const bm = get().bookmarks.get(id);
      if (bm) {
        get().centerOnNode(bm.nodeId);
      }
    },

    // === ROUTE SIMULATION (теперь использует core) ===
    setRouteSimulation: (sim) => set((s) => {
      Object.assign(s.routeSimulation, sim);
    }),

    setRouteSelectedPath: (index) => set((s) => {
      s.routeSimulation.selectedPathIndex = index;
      s.routeSimulation.animationIndex = 0;
    }),

    setRouteAnimationSpeed: (speed) => set((s) => {
      s.routeSimulation.animationSpeed = speed;
    }),

    setRoutePathfindingOptions: (opts) => set((s) => {
      Object.assign(s.routeSimulation.pathfindingOptions, opts);
    }),

    navigateToNode: (nodeId) => {
      const node = get().nodes.get(nodeId);
      if (!node) return;

      const currentBuilding = get().currentBuilding;
      const currentFloor = get().currentFloor;

      if (node.building === 'CAMPUS') {
        if (currentBuilding !== null) {
          set((s) => {
            s.currentBuilding = null;
            s.currentFloor = null;
          });
        }
      } else {
        if (currentBuilding !== node.building || currentFloor !== node.floor) {
          set((s) => {
            s.currentBuilding = node.building;
            s.currentFloor = node.floor;
          });
        }
      }
    },

    /**
     * Расчёт маршрута через core pathfinding
     */
    calculateRoute: (fromId, toId) => {
      const { nodes, transitions, routeSimulation } = get();

      // Строим временный Graph из текущего состояния
      const graph = buildGraphFromState(nodes, transitions);

      // Ищем основной путь и альтернативы через core
      const multiResult = findAlternativePaths(
        graph,
        fromId,
        toId,
        routeSimulation.pathfindingOptions,
        3
      );

      const primaryPath = multiResult.primary.found ? multiResult.primary.path : [];
      const altPaths = multiResult.alternatives
        .filter(r => r.found)
        .map(r => r.path);

      set((s) => {
        s.routeSimulation.fromNodeId = fromId;
        s.routeSimulation.toNodeId = toId;
        s.routeSimulation.path = primaryPath;
        s.routeSimulation.alternativePaths = [primaryPath, ...altPaths].filter(p => p.length > 0);
        s.routeSimulation.animationIndex = 0;
        s.routeSimulation.selectedPathIndex = 0;
        s.routeSimulation.active = primaryPath.length > 0;
      });
    },

    startRouteAnimation: () => set((s) => { s.routeSimulation.animationIndex = 0; }),
    stopRouteAnimation: () => set((s) => { s.routeSimulation.active = false; }),

        // === EDGE OPERATIONS ===

    /**
     * Разделить ребро пополам, вставив узел посередине
     */
    splitEdge: (fromId, toId) => {
      const st = get();
      const fromNode = st.nodes.get(fromId);
      const toNode = st.nodes.get(toId);

      if (!fromNode || !toNode) return null;
      if (!fromNode.neighbors.includes(toId)) return null;

      // Вычисляем середину
      const midX = Math.round((fromNode.x + toNode.x) / 2);
      const midY = Math.round((fromNode.y + toNode.y) / 2);

      // Snap to grid если нужно
      const { gridSettings } = st;
      let finalX = midX;
      let finalY = midY;
      if (gridSettings.enabled && gridSettings.snap) {
        finalX = Math.round(midX / gridSettings.size) * gridSettings.size;
        finalY = Math.round(midY / gridSettings.size) * gridSettings.size;
      }

      // Генерируем ID
      const building = fromNode.building;
      const floor = fromNode.floor;
      const counter = st.nodeIdCounter;
      const newId = `${building.toLowerCase()}_${floor}_node_${counter}`;

      // Сохраняем для undo
      const neighborsBefore = snapshotNeighbors(st.nodes, [fromId, toId]);

      const newNode: MapNode = {
        id: newId,
        x: finalX,
        y: finalY,
        building,
        floor,
        isPortal: false,
        neighbors: [fromId, toId],
      };

      useHistoryStore.getState().push({
        type: 'BATCH',
        description: 'Разделено ребро',
        undoData: {
          kind: 'splitEdge',
          newNodeId: newId,
          fromId,
          toId,
          neighborsBefore,
        },
        redoData: {
          kind: 'splitEdge',
          newNode,
          fromId,
          toId,
        },
      });

      set((s) => {
        s.nodeIdCounter = counter + 1;

        // Убираем прямое ребро
        const from = s.nodes.get(fromId)!;
        const to = s.nodes.get(toId)!;
        from.neighbors = from.neighbors.filter(n => n !== toId);
        to.neighbors = to.neighbors.filter(n => n !== fromId);

        // Добавляем узел
        s.nodes.set(newId, newNode);

        // Связываем с новым узлом
        from.neighbors.push(newId);
        to.neighbors.push(newId);

        s.selectedNodeIds = new Set([newId]);
        s.hasUnsavedChanges = true;
      });

      return newId;
    },

    /**
     * Разбить ребро на N сегментов (вставить N-1 узлов)
     */
    subdivideEdge: (fromId, toId, count) => {
      if (count < 2) return [];

      const st = get();
      const fromNode = st.nodes.get(fromId);
      const toNode = st.nodes.get(toId);

      if (!fromNode || !toNode) return [];
      if (!fromNode.neighbors.includes(toId)) return [];

      const segmentCount = Math.min(count, 20); // Лимит
      const nodeCount = segmentCount - 1;

      if (nodeCount < 1) return [];

      const building = fromNode.building;
      const floor = fromNode.floor;
      const { gridSettings } = st;

      // Генерируем узлы
      const newNodes: MapNode[] = [];
      let counter = st.nodeIdCounter;

      for (let i = 1; i <= nodeCount; i++) {
        const t = i / segmentCount;
        let x = Math.round(fromNode.x + (toNode.x - fromNode.x) * t);
        let y = Math.round(fromNode.y + (toNode.y - fromNode.y) * t);

        if (gridSettings.enabled && gridSettings.snap) {
          x = Math.round(x / gridSettings.size) * gridSettings.size;
          y = Math.round(y / gridSettings.size) * gridSettings.size;
        }

        const newId = `${building.toLowerCase()}_${floor}_node_${counter++}`;
        newNodes.push({
          id: newId,
          x,
          y,
          building,
          floor,
          isPortal: false,
          neighbors: [],
        });
      }

      // Устанавливаем связи цепочкой
      for (let i = 0; i < newNodes.length; i++) {
        if (i === 0) {
          newNodes[i].neighbors.push(fromId);
        } else {
          newNodes[i].neighbors.push(newNodes[i - 1].id);
        }

        if (i === newNodes.length - 1) {
          newNodes[i].neighbors.push(toId);
        } else {
          newNodes[i].neighbors.push(newNodes[i + 1].id);
        }
      }

      const neighborsBefore = snapshotNeighbors(st.nodes, [fromId, toId]);

      useHistoryStore.getState().push({
        type: 'BATCH',
        description: `Subdivide: ${nodeCount} узлов`,
        undoData: {
          kind: 'subdivideEdge',
          nodeIds: newNodes.map(n => n.id),
          fromId,
          toId,
          neighborsBefore,
        },
        redoData: {
          kind: 'subdivideEdge',
          nodes: newNodes,
          fromId,
          toId,
        },
      });

      set((s) => {
        s.nodeIdCounter = counter;

        // Убираем прямое ребро
        const from = s.nodes.get(fromId)!;
        const to = s.nodes.get(toId)!;
        from.neighbors = from.neighbors.filter(n => n !== toId);
        to.neighbors = to.neighbors.filter(n => n !== fromId);

        // Добавляем узлы
        for (const n of newNodes) {
          s.nodes.set(n.id, { ...n, neighbors: [...n.neighbors] });
        }

        // Связываем крайние
        from.neighbors.push(newNodes[0].id);
        to.neighbors.push(newNodes[newNodes.length - 1].id);

        s.selectedNodeIds = new Set(newNodes.map(n => n.id));
        s.hasUnsavedChanges = true;
      });

      return newNodes.map(n => n.id);
    },

    // === ПОИСК ===
    searchNodes: (query) => {
      const { nodes, aliases } = get();
      const q = query.toLowerCase().trim();
      if (!q) return [];

      const results: MapNode[] = [];

      for (const [id, node] of nodes) {
        if (id.toLowerCase().includes(q)) {
          results.push(node);
          continue;
        }

        const nodeAliases = aliases.get(id) || [];
        if (nodeAliases.some(a => a.toLowerCase().includes(q))) {
          results.push(node);
          continue;
        }

        const cleanQ = q.replace(/[()]/g, '').trim();
        const coordMatch = cleanQ.match(/^(\d+)\s*[,\s]\s*(\d+)$/);
        if (coordMatch) {
          const searchX = parseInt(coordMatch[1], 10);
          const searchY = parseInt(coordMatch[2], 10);
          const tolerance = 30;
          if (Math.abs(node.x - searchX) < tolerance && Math.abs(node.y - searchY) < tolerance) {
            results.push(node);
            continue;
          }
        }
      }

      results.sort((a, b) => {
        const aExact = a.id.toLowerCase() === q;
        const bExact = b.id.toLowerCase() === q;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return 0;
      });

      return results.slice(0, 50);
    },

    addToSearchHistory: (query) => set((s) => {
      const q = query.trim();
      if (!q) return;
      s.searchHistory = [q, ...s.searchHistory.filter(h => h !== q)].slice(0, 10);
    }),

    clearSearchHistory: () => set((s) => { s.searchHistory = []; }),

    centerOnNode: (nodeId, keepZoom = true) => {
      const node = get().nodes.get(nodeId);
      if (!node) return;

      const currentBuilding = get().currentBuilding;
      const currentFloor = get().currentFloor;

      if (node.building === 'CAMPUS') {
        if (currentBuilding !== null) {
          set((s) => {
            s.currentBuilding = null;
            s.currentFloor = null;
          });
        }
      } else {
        if (currentBuilding !== node.building || currentFloor !== node.floor) {
          set((s) => {
            s.currentBuilding = node.building;
            s.currentFloor = node.floor;
          });
        }
      }

      setTimeout(() => {
        set((s) => {
          s.cameraCenterRequest = {
            x: node.x,
            y: node.y,
            zoom: keepZoom ? undefined : 2
          };
          s.selectedNodeIds = new Set([nodeId]);
        });
      }, 100);
    },

    setCameraCenter: (x, y, zoom) => set((s) => {
      s.cameraCenterRequest = { x, y, zoom };
    }),

    clearCameraCenter: () => set((s) => { s.cameraCenterRequest = null; }),

    // === МУЛЬТИВЫДЕЛЕНИЕ ===
    addToSelection: (nodeIds) => set((s) => {
      for (const id of nodeIds) {
        if (s.nodes.has(id)) {
          s.selectedNodeIds.add(id);
        }
      }
    }),

    removeFromSelection: (nodeIds) => set((s) => {
      for (const id of nodeIds) {
        s.selectedNodeIds.delete(id);
      }
    }),

    selectNodesInRect: (x1, y1, x2, y2) => set((s) => {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);

      const floorNodes = get().getNodesForCurrentFloor();
      const inRect = floorNodes.filter(n =>
        n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY
      );

      s.selectedNodeIds = new Set(inRect.map(n => n.id));
    }),

    selectAll: () => set((s) => {
      const floorNodes = get().getNodesForCurrentFloor();
      s.selectedNodeIds = new Set(floorNodes.map(n => n.id));
    }),

    // === ГРУППОВЫЕ ОПЕРАЦИИ ===
    deleteSelected: () => {
      const { selectedNodeIds, nodes, transitions, aliases, comments } = get();
      if (selectedNodeIds.size === 0) return;

      const ids = Array.from(selectedNodeIds);
      const deletedNodes: MapNode[] = [];
      const deletedAliases: { id: string; names: string[] }[] = [];
      const deletedComments: { id: string; comment: string }[] = [];
      const affected = new Set<string>();

      for (const id of ids) {
        const node = nodes.get(id);
        if (node) {
          deletedNodes.push({ ...node, neighbors: [...node.neighbors] });
          affected.add(id);
          for (const nb of node.neighbors) affected.add(nb);
        }

        // Сохраняем алиасы для undo
        const nodeAliases = aliases.get(id);
        if (nodeAliases && nodeAliases.length > 0) {
          deletedAliases.push({ id, names: [...nodeAliases] });
        }

        // Сохраняем комментарии для undo
        const comment = comments.get(id);
        if (comment) {
          deletedComments.push({ id, comment });
        }
      }

      const neighborsBefore = snapshotNeighbors(nodes, Array.from(affected));
      const transitionsBefore = [...transitions];

      useHistoryStore.getState().push({
        type: 'BATCH',
        description: `Удалено ${ids.length} узлов`,
        undoData: {
          kind: 'deleteMultiple',
          nodes: deletedNodes,
          neighborsBefore,
          transitionsBefore,
          aliases: deletedAliases,
          comments: deletedComments,
        },
        redoData: { kind: 'deleteMultiple', nodeIds: ids },
      });

      set((s) => {
        for (const id of ids) {
          s.nodes.delete(id);
          s.aliases.delete(id);
          s.comments.delete(id);
        }
        for (const [, n] of s.nodes) {
          n.neighbors = n.neighbors.filter(nb => !ids.includes(nb));
        }
        s.transitions = s.transitions.filter(t =>
          !ids.includes(t.fromNode) && !ids.includes(t.toNode)
        );
        s.selectedNodeIds = new Set();
        s.hasUnsavedChanges = true;
      });
    },

    duplicateSelected: () => {
      const { selectedNodeIds, nodes, currentBuilding, currentFloor } = get();
      if (selectedNodeIds.size === 0) return;

      const ids = Array.from(selectedNodeIds);
      const offset = 30;

      const oldToNew = new Map<string, string>();
      const newNodes: MapNode[] = [];

      let counter = get().nodeIdCounter;
      const building = currentBuilding ?? 'campus';
      const floor = currentFloor ?? 0;

      for (const id of ids) {
        const node = nodes.get(id);
        if (!node) continue;

        const newId = `${building.toLowerCase()}_${floor}_node_${counter++}`;
        oldToNew.set(id, newId);

        newNodes.push({
          id: newId,
          x: node.x + offset,
          y: node.y + offset,
          building: node.building,
          floor: node.floor,
          isPortal: node.isPortal,
          neighbors: [],
        });
      }

      for (const id of ids) {
        const node = nodes.get(id);
        if (!node) continue;
        const newId = oldToNew.get(id)!;
        const newNode = newNodes.find(n => n.id === newId)!;

        for (const nb of node.neighbors) {
          if (oldToNew.has(nb)) {
            newNode.neighbors.push(oldToNew.get(nb)!);
          }
        }
      }

      useHistoryStore.getState().push({
        type: 'BATCH',
        description: `Дублировано ${newNodes.length} узлов`,
        undoData: { kind: 'line', nodeIds: newNodes.map(n => n.id) },
        redoData: { kind: 'line', nodes: newNodes },
      });

      set((s) => {
        s.nodeIdCounter = counter;
        for (const n of newNodes) {
          s.nodes.set(n.id, { ...n, neighbors: [...n.neighbors] });
        }
        s.selectedNodeIds = new Set(newNodes.map(n => n.id));
        s.hasUnsavedChanges = true;
      });
    },

    moveSelectedBy: (dx, dy) => {
      const { selectedNodeIds, nodes, gridSettings } = get();
      if (selectedNodeIds.size === 0) return;

      const ids = Array.from(selectedNodeIds);
      const before: { nodeId: string; x: number; y: number }[] = [];
      const after: { nodeId: string; x: number; y: number }[] = [];

      for (const id of ids) {
        const node = nodes.get(id);
        if (!node) continue;

        before.push({ nodeId: id, x: node.x, y: node.y });

        let newX = node.x + dx;
        let newY = node.y + dy;

        if (gridSettings.snap && gridSettings.enabled) {
          newX = Math.round(newX / gridSettings.size) * gridSettings.size;
          newY = Math.round(newY / gridSettings.size) * gridSettings.size;
        }

        after.push({ nodeId: id, x: newX, y: newY });
      }

      useHistoryStore.getState().push({
        type: 'BATCH',
        description: `Перемещено ${ids.length} узлов`,
        undoData: { kind: 'moveMultiple', positions: before },
        redoData: { kind: 'moveMultiple', positions: after },
      });

      set((s) => {
        for (const pos of after) {
          const node = s.nodes.get(pos.nodeId);
          if (node) {
            node.x = pos.x;
            node.y = pos.y;
          }
        }
        s.hasUnsavedChanges = true;
      });
    },

    setSelectedPortal: (isPortal) => {
      const { selectedNodeIds, nodes } = get();
      if (selectedNodeIds.size === 0) return;

      const ids = Array.from(selectedNodeIds);
      const before: { nodeId: string; isPortal: boolean }[] = [];

      for (const id of ids) {
        const node = nodes.get(id);
        if (node) {
          before.push({ nodeId: id, isPortal: node.isPortal });
        }
      }

      useHistoryStore.getState().push({
        type: 'BATCH',
        description: `Изменён флаг портала`,
        undoData: { kind: 'setPortal', changes: before },
        redoData: { kind: 'setPortal', nodeIds: ids, isPortal },
      });

      set((s) => {
        for (const id of ids) {
          const node = s.nodes.get(id);
          if (node) node.isPortal = isPortal;
        }
        s.hasUnsavedChanges = true;
      });
    },

    connectSelectedChain: () => {
      const { selectedNodeIds, nodes } = get();
      if (selectedNodeIds.size < 2) return;

      const ids = Array.from(selectedNodeIds);
      const nodeList = ids.map(id => nodes.get(id)).filter(Boolean) as MapNode[];

      nodeList.sort((a, b) => a.x - b.x || a.y - b.y);

      const neighborsBefore = snapshotNeighbors(nodes, ids);

      useHistoryStore.getState().push({
        type: 'BATCH',
        description: `Соединено цепочкой ${nodeList.length} узлов`,
        undoData: { kind: 'chainConnect', neighborsBefore },
        redoData: { kind: 'chainConnect', nodeIds: nodeList.map(n => n.id) },
      });

      set((s) => {
        for (let i = 0; i < nodeList.length - 1; i++) {
          const a = s.nodes.get(nodeList[i].id);
          const b = s.nodes.get(nodeList[i + 1].id);
          if (a && b) {
            if (!a.neighbors.includes(b.id)) a.neighbors.push(b.id);
            if (!b.neighbors.includes(a.id)) b.neighbors.push(a.id);
          }
        }
        s.hasUnsavedChanges = true;
      });
    },

    // === CLIPBOARD ===
    copySelected: () => {
      const { selectedNodeIds, nodes } = get();
      if (selectedNodeIds.size === 0) return;

      const ids = Array.from(selectedNodeIds);
      const copiedNodes: MapNode[] = [];
      const internalEdges: { from: string; to: string }[] = [];

      for (const id of ids) {
        const node = nodes.get(id);
        if (node) {
          copiedNodes.push({ ...node, neighbors: [...node.neighbors] });

          for (const nb of node.neighbors) {
            if (ids.includes(nb) && id < nb) {
              internalEdges.push({ from: id, to: nb });
            }
          }
        }
      }

      set((s) => {
        s.clipboard = { nodes: copiedNodes, internalEdges };
      });
    },

    paste: (offsetX = 50, offsetY = 50) => {
      const { clipboard, currentBuilding, currentFloor } = get();
      if (!clipboard || clipboard.nodes.length === 0) return;

      const oldToNew = new Map<string, string>();
      const newNodes: MapNode[] = [];

      let counter = get().nodeIdCounter;
      const building = currentBuilding ?? 'campus';
      const floor = currentFloor ?? 0;

      for (const node of clipboard.nodes) {
        const newId = `${building.toLowerCase()}_${floor}_node_${counter++}`;
        oldToNew.set(node.id, newId);

        newNodes.push({
          id: newId,
          x: node.x + offsetX,
          y: node.y + offsetY,
          building: currentBuilding ?? node.building,
          floor: currentFloor ?? node.floor,
          isPortal: node.isPortal,
          neighbors: [],
        });
      }

      for (const edge of clipboard.internalEdges) {
        const newFrom = oldToNew.get(edge.from);
        const newTo = oldToNew.get(edge.to);
        if (newFrom && newTo) {
          const nodeFrom = newNodes.find(n => n.id === newFrom)!;
          const nodeTo = newNodes.find(n => n.id === newTo)!;
          nodeFrom.neighbors.push(newTo);
          nodeTo.neighbors.push(newFrom);
        }
      }

      useHistoryStore.getState().push({
        type: 'BATCH',
        description: `Вставлено ${newNodes.length} узлов`,
        undoData: { kind: 'line', nodeIds: newNodes.map(n => n.id) },
        redoData: { kind: 'line', nodes: newNodes },
      });

      set((s) => {
        s.nodeIdCounter = counter;
        for (const n of newNodes) {
          s.nodes.set(n.id, { ...n, neighbors: [...n.neighbors] });
        }
        s.selectedNodeIds = new Set(newNodes.map(n => n.id));
        s.hasUnsavedChanges = true;
      });
    },

    // === GRID ===
    setGridSettings: (settings) => set((s) => {
      Object.assign(s.gridSettings, settings);
    }),

    snapToGrid: (value) => {
      const { gridSettings } = get();
      if (!gridSettings.enabled || !gridSettings.snap) return Math.round(value);
      const size = gridSettings.size;
      return Math.round(value / size) * size;
    },

    // === FILTERS ===
    setDisplayFilters: (filters) => set((s) => {
      Object.assign(s.displayFilters, filters);
    }),

    // === COMMENTS ===
    setNodeComment: (nodeId, comment) => {
      const prev = get().comments.get(nodeId) || '';
      if (prev === comment) return;

      useHistoryStore.getState().push({
        type: 'BATCH',
        description: 'Изменён комментарий',
        undoData: { kind: 'comment', nodeId, comment: prev },
        redoData: { kind: 'comment', nodeId, comment },
      });

      set((s) => {
        if (comment.trim()) {
          s.comments.set(nodeId, comment);
        } else {
          s.comments.delete(nodeId);
        }
        s.hasUnsavedChanges = true;
      });
    },

    getNodeComment: (nodeId) => get().comments.get(nodeId) || '',

    // === INLINE EDIT ===
    setInlineEditNode: (nodeId) => set((s) => { s.inlineEditNodeId = nodeId; }),

    // === SELECTION BOX ===
    startSelectionBox: (x, y) => set((s) => {
      s.selectionBox = { active: true, startX: x, startY: y, endX: x, endY: y };
    }),

    updateSelectionBox: (x, y) => set((s) => {
      if (s.selectionBox) {
        s.selectionBox.endX = x;
        s.selectionBox.endY = y;
      }
    }),

    finishSelectionBox: () => {
      const { selectionBox } = get();
      if (selectionBox) {
        get().selectNodesInRect(
          selectionBox.startX,
          selectionBox.startY,
          selectionBox.endX,
          selectionBox.endY
        );
      }
      set((s) => { s.selectionBox = null; });
    },

    cancelSelectionBox: () => set((s) => { s.selectionBox = null; }),

    // === PANELS ===
    setSearchOpen: (open) => set((s) => { s.searchOpen = open; }),
    setStatisticsOpen: (open) => set((s) => { s.statisticsOpen = open; }),
    setFiltersOpen: (open) => set((s) => { s.filtersOpen = open; }),
    setRouteSimulatorOpen: (open) => set((s) => { s.routeSimulatorOpen = open; }),
    setDiagnosticsOpen: (open) => set((s) => { s.diagnosticsOpen = open; }),

    // === VALIDATION ===
    getOrphanNodes: () => {
      const floorNodes = get().getNodesForCurrentFloor();
      return floorNodes.filter(n => n.neighbors.length === 0);
    },

    getNodesWithoutAlias: () => {
      const { aliases } = get();
      const floorNodes = get().getNodesForCurrentFloor();
      return floorNodes.filter(n => {
        const nodeAliases = aliases.get(n.id) || [];
        return nodeAliases.length === 0;
      });
    },

    getNodesWithErrors: () => {
      const { nodes } = get();
      const floorNodes = get().getNodesForCurrentFloor();
      return floorNodes.filter(n => {
        return n.neighbors.some(nb => !nodes.has(nb));
      });
    },

    isGraphConnected: () => {
      const { nodes, transitions } = get();
      return checkConnectivity(nodes, transitions);
    },

    // === EXISTING METHODS ===
    setCurrentBuilding: (buildingId) => set((state) => {
      state.currentBuilding = buildingId;
      if (buildingId) {
        const meta = state.buildingMetas.get(buildingId);
        state.currentFloor = meta?.floors[0]?.floor ?? 1;
      } else {
        state.currentFloor = null;
      }
      state.selectedNodeIds = new Set();
      state.edgeStartNodeId = null;
      state.transitionStartNodeId = null;
      state.lineTool.start = null;
      state.lineTool.end = null;
      state.selectionBox = null;
    }),

    setCurrentFloor: (floor) => set((state) => {
      state.currentFloor = floor;
      state.selectedNodeIds = new Set();
      state.edgeStartNodeId = null;
      state.transitionStartNodeId = null;
      state.lineTool.start = null;
      state.lineTool.end = null;
      state.selectionBox = null;
    }),

    setActiveTool: (tool) => set((state) => {
      state.activeTool = tool;
      state.edgeStartNodeId = null;
      state.transitionStartNodeId = null;
      if (tool !== 'line') {
        state.lineTool.start = null;
        state.lineTool.end = null;
      }
    }),

    setTransitionType: (type) => set((s) => { s.transitionType = type; }),

    generateNodeId: () => {
      const st = get();
      const building = st.currentBuilding ?? 'campus';
      const floor = st.currentFloor ?? 0;
      const counter = st.nodeIdCounter;
      set((s) => { s.nodeIdCounter = counter + 1; });
      return `${building.toLowerCase()}_${floor}_node_${counter}`;
    },

    addNode: (x, y) => {
      const st = get();
      const { gridSettings } = st;

      let finalX = Math.round(x);
      let finalY = Math.round(y);

      if (gridSettings.enabled && gridSettings.snap) {
        finalX = Math.round(x / gridSettings.size) * gridSettings.size;
        finalY = Math.round(y / gridSettings.size) * gridSettings.size;
      }

      const id = st.generateNodeId();
      const building = st.currentBuilding ?? 'CAMPUS';
      const floor = st.currentFloor ?? 0;

      const node: MapNode = {
        id,
        x: finalX,
        y: finalY,
        building,
        floor,
        isPortal: false,
        neighbors: [],
      };

      useHistoryStore.getState().push({
        type: 'ADD_NODE',
        description: 'Добавлен узел',
        undoData: { nodeId: id },
        redoData: { node },
      });

      set((s) => {
        s.nodes.set(id, node);
        s.selectedNodeIds = new Set([id]);
        s.hasUnsavedChanges = true;
      });

      return id;
    },

    removeNode: (nodeId) => {
      const st = get();
      const node = st.nodes.get(nodeId);
      if (!node) return;

      const affected = new Set<string>();
      affected.add(nodeId);
      for (const [id, n] of st.nodes) {
        if (n.neighbors.includes(nodeId)) affected.add(id);
      }
      for (const nb of node.neighbors) affected.add(nb);

      const neighborsBefore = snapshotNeighbors(st.nodes, Array.from(affected));
      const transitionsBefore = [...st.transitions];
      const nodeSnapshot: MapNode = { ...node, neighbors: [...node.neighbors] };

      // Сохраняем алиасы и комментарии
      const aliasesSnapshot = st.aliases.get(nodeId) ? [...st.aliases.get(nodeId)!] : [];
      const commentSnapshot = st.comments.get(nodeId) || '';

      useHistoryStore.getState().push({
        type: 'REMOVE_NODE',
        description: 'Удален узел',
        undoData: {
          node: nodeSnapshot,
          neighborsBefore,
          transitionsBefore,
          aliases: aliasesSnapshot,
          comment: commentSnapshot,
        },
        redoData: { nodeId },
      });

      set((s) => {
        for (const [, n] of s.nodes) {
          n.neighbors = n.neighbors.filter((x) => x !== nodeId);
        }
        s.transitions = s.transitions.filter((t) => t.fromNode !== nodeId && t.toNode !== nodeId);
        s.nodes.delete(nodeId);
        s.aliases.delete(nodeId);
        s.comments.delete(nodeId);
        s.selectedNodeIds.delete(nodeId);
        s.edgeStartNodeId = null;
        s.transitionStartNodeId = null;
        s.hasUnsavedChanges = true;
      });
    },

    moveNode: (nodeId, x, y) => set((s) => {
      const n = s.nodes.get(nodeId);
      if (!n) return;

      let finalX = Math.round(x);
      let finalY = Math.round(y);

      if (s.gridSettings.enabled && s.gridSettings.snap) {
        finalX = Math.round(x / s.gridSettings.size) * s.gridSettings.size;
        finalY = Math.round(y / s.gridSettings.size) * s.gridSettings.size;
      }

      n.x = finalX;
      n.y = finalY;
      s.hasUnsavedChanges = true;
    }),

    commitMoveNode: (nodeId, fromX, fromY, toX, toY) => {
      if (fromX === toX && fromY === toY) return;

      useHistoryStore.getState().push({
        type: 'MOVE_NODE',
        description: 'Перемещение узла',
        undoData: { nodeId, x: fromX, y: fromY },
        redoData: { nodeId, x: toX, y: toY },
      });

      set((s) => { s.hasUnsavedChanges = true; });
    },

    updateNode: (nodeId, updates) => {
      const st = get();
      const node = st.nodes.get(nodeId);
      if (!node) return;

      const prev: Partial<MapNode> = {};
      for (const k of Object.keys(updates) as (keyof MapNode)[]) {
        prev[k] = node[k] as any;
      }

      useHistoryStore.getState().push({
        type: 'UPDATE_NODE',
        description: 'Изменение узла',
        undoData: { nodeId, updates: prev },
        redoData: { nodeId, updates },
      });

      set((s) => {
        const n = s.nodes.get(nodeId);
        if (!n) return;
        Object.assign(n, updates);
        s.hasUnsavedChanges = true;
      });
    },

    addEdge: (fromId, toId) => {
      if (fromId === toId) return;
      const st = get();
      const a = st.nodes.get(fromId);
      const b = st.nodes.get(toId);
      if (!a || !b) return;
      if (a.neighbors.includes(toId)) return;

      const neighborsBefore = snapshotNeighbors(st.nodes, [fromId, toId]);

      useHistoryStore.getState().push({
        type: 'ADD_EDGE',
        description: 'Добавлено ребро',
        undoData: { neighborsBefore, ids: [fromId, toId] },
        redoData: { fromId, toId },
      });

      set((s) => {
        const aa = s.nodes.get(fromId);
        const bb = s.nodes.get(toId);
        if (!aa || !bb) return;
        if (!aa.neighbors.includes(toId)) aa.neighbors.push(toId);
        if (!bb.neighbors.includes(fromId)) bb.neighbors.push(fromId);
        s.hasUnsavedChanges = true;
      });
    },

    removeEdge: (fromId, toId) => {
      const st = get();
      const neighborsBefore = snapshotNeighbors(st.nodes, [fromId, toId]);

      useHistoryStore.getState().push({
        type: 'REMOVE_EDGE',
        description: 'Удалено ребро',
        undoData: { neighborsBefore, ids: [fromId, toId] },
        redoData: { fromId, toId },
      });

      set((s) => {
        const aa = s.nodes.get(fromId);
        const bb = s.nodes.get(toId);
        if (aa) aa.neighbors = aa.neighbors.filter((x) => x !== toId);
        if (bb) bb.neighbors = bb.neighbors.filter((x) => x !== fromId);
        s.hasUnsavedChanges = true;
      });
    },

    addTransition: (fromId, toId, type) => {
      if (fromId === toId) return;
      const st = get();
      if (!st.nodes.has(fromId) || !st.nodes.has(toId)) return;

      const exists = st.transitions.some(
        (t) => (t.fromNode === fromId && t.toNode === toId) || (t.fromNode === toId && t.toNode === fromId)
      );
      if (exists) return;

      const before = [...st.transitions];
      const next = [...st.transitions, { fromNode: fromId, toNode: toId, type }];

      useHistoryStore.getState().push({
        type: 'ADD_TRANSITION',
        description: `Добавлен переход (${type})`,
        undoData: { transitions: before },
        redoData: { transitions: next },
      });

      set((s) => {
        s.transitions = next;
        s.hasUnsavedChanges = true;
      });
    },

    removeTransition: (fromId, toId) => {
      const st = get();
      const before = [...st.transitions];
      const next = st.transitions.filter(
        (t) => !((t.fromNode === fromId && t.toNode === toId) || (t.fromNode === toId && t.toNode === fromId))
      );
      if (next.length === before.length) return;

      useHistoryStore.getState().push({
        type: 'REMOVE_TRANSITION',
        description: 'Удален переход',
        undoData: { transitions: before },
        redoData: { transitions: next },
      });

      set((s) => {
        s.transitions = next;
        s.hasUnsavedChanges = true;
      });
    },

    setNodeAliases: (nodeId, names) => {
      const st = get();
      const prev = st.aliases.get(nodeId) ?? [];
      const next = names.map((x) => x.trim()).filter((x) => x.length > 0);
      if (prev.join('\n') === next.join('\n')) return;

      useHistoryStore.getState().push({
        type: 'SET_ALIASES',
        description: 'Изменены алиасы',
        undoData: { nodeId, names: [...prev] },
        redoData: { nodeId, names: [...next] },
      });

      set((s) => {
        s.aliases.set(nodeId, next);
        s.hasUnsavedChanges = true;
      });
    },

    getNodeAliases: (nodeId) => get().aliases.get(nodeId) ?? [],

    toggleSelectNode: (nodeId, addToSelection = false) => set((state) => {
      if (!addToSelection && state.selectedNodeIds.size === 1 && state.selectedNodeIds.has(nodeId)) {
        state.selectedNodeIds = new Set();
        return;
      }
      if (addToSelection) {
        if (state.selectedNodeIds.has(nodeId)) {
          state.selectedNodeIds.delete(nodeId);
        } else {
          state.selectedNodeIds.add(nodeId);
        }
      } else {
        state.selectedNodeIds = new Set([nodeId]);
      }
    }),

    selectSingleNode: (nodeId) => set((state) => { state.selectedNodeIds = new Set([nodeId]); }),
    clearSelection: () => set((state) => { state.selectedNodeIds = new Set(); }),
    setHoveredNode: (nodeId) => set((state) => { state.hoveredNodeId = nodeId; }),
    setHoveredEdge: (edge) => set((state) => { state.hoveredEdge = edge; }),
    setHoveredTransition: (t) => set((state) => { state.hoveredTransition = t; }),
    setEdgeStartNode: (nodeId) => set((s) => { s.edgeStartNodeId = nodeId; }),
    setTransitionStartNode: (nodeId) => set((s) => { s.transitionStartNodeId = nodeId; }),

    // LINE TOOL
    lineReset: () => set((s) => { s.lineTool.start = null; s.lineTool.end = null; }),
    lineSetStart: (x, y) => set((s) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const { gridSettings } = s;
      let finalX = Math.round(x);
      let finalY = Math.round(y);
      if (gridSettings.enabled && gridSettings.snap) {
        finalX = Math.round(x / gridSettings.size) * gridSettings.size;
        finalY = Math.round(y / gridSettings.size) * gridSettings.size;
      }
      s.lineTool.start = { x: finalX, y: finalY };
      s.lineTool.end = null;
    }),
    lineSetEnd: (x, y) => set((s) => {
      if (!s.lineTool.start) return;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const { gridSettings } = s;
      let finalX = Math.round(x);
      let finalY = Math.round(y);
      if (gridSettings.enabled && gridSettings.snap) {
        finalX = Math.round(x / gridSettings.size) * gridSettings.size;
        finalY = Math.round(y / gridSettings.size) * gridSettings.size;
      }
      s.lineTool.end = { x: finalX, y: finalY };
    }),
    lineSetCount: (count) => set((s) => {
      if (!Number.isFinite(count)) return;
      s.lineTool.count = Math.max(2, Math.min(50, Math.floor(count)));
    }),
    lineSetAutoConnect: (v) => set((s) => { s.lineTool.autoConnect = Boolean(v); }),

    lineConfirm: () => {
      const st = get();
      const lt = st.lineTool;
      if (!lt.start || !lt.end) return;

      const count = Math.max(2, Math.min(50, lt.count));
      const dx = (lt.end.x - lt.start.x) / (count - 1);
      const dy = (lt.end.y - lt.start.y) / (count - 1);

      const building = st.currentBuilding ?? 'CAMPUS';
      const floor = st.currentFloor ?? 0;

      const nodeIds: string[] = [];
      let currentCounter = st.nodeIdCounter;
      const buildingLower = (st.currentBuilding ?? 'campus').toLowerCase();

      for (let i = 0; i < count; i++) {
        nodeIds.push(`${buildingLower}_${floor}_node_${currentCounter + i}`);
      }

      const created: MapNode[] = [];
      for (let i = 0; i < count; i++) {
        let x = Math.round(lt.start.x + dx * i);
        let y = Math.round(lt.start.y + dy * i);

        if (st.gridSettings.enabled && st.gridSettings.snap) {
          x = Math.round(x / st.gridSettings.size) * st.gridSettings.size;
          y = Math.round(y / st.gridSettings.size) * st.gridSettings.size;
        }

        created.push({
          id: nodeIds[i],
          x, y, building, floor,
          isPortal: false,
          neighbors: [],
        });
      }

      if (lt.autoConnect && created.length > 1) {
        for (let i = 0; i < created.length; i++) {
          if (i > 0) created[i].neighbors.push(created[i - 1].id);
          if (i + 1 < created.length) created[i].neighbors.push(created[i + 1].id);
        }
      }

      useHistoryStore.getState().push({
        type: 'BATCH',
        description: `Line tool: ${created.length} узлов`,
        undoData: { kind: 'line', nodeIds: created.map(n => n.id) },
        redoData: { kind: 'line', nodes: created },
      });

      set((s) => {
        s.nodeIdCounter = currentCounter + count;
        for (const n of created) {
          s.nodes.set(n.id, { ...n, neighbors: [...n.neighbors] });
        }
        s.selectedNodeIds = new Set([created[created.length - 1].id]);
        s.hasUnsavedChanges = true;
        s.lineTool.start = null;
        s.lineTool.end = null;
      });
    },

    // UNDO/REDO
    undo: () => {
      const entry = useHistoryStore.getState().undo();
      if (!entry) return;

      set((s) => {
        switch (entry.type) {
          case 'ADD_NODE': {
            const { nodeId } = entry.undoData as any;
            s.nodes.delete(nodeId);
            s.aliases.delete(nodeId);
            s.comments.delete(nodeId);
            s.selectedNodeIds = new Set();
            break;
          }
          case 'REMOVE_NODE': {
            const { node, neighborsBefore, transitionsBefore, aliases, comment } = entry.undoData as any;
            s.nodes.set(node.id, { ...node, neighbors: [...node.neighbors] });
            applyNeighborsSnapshot(s.nodes, neighborsBefore);
            s.transitions = [...transitionsBefore];
            if (aliases && aliases.length > 0) {
              s.aliases.set(node.id, [...aliases]);
            }
            if (comment) {
              s.comments.set(node.id, comment);
            }
            break;
          }
          case 'MOVE_NODE': {
            const { nodeId, x, y } = entry.undoData as any;
            const n = s.nodes.get(nodeId);
            if (n) { n.x = x; n.y = y; }
            break;
          }
          case 'UPDATE_NODE': {
            const { nodeId, updates } = entry.undoData as any;
            const n = s.nodes.get(nodeId);
            if (n) Object.assign(n, updates);
            break;
          }
          case 'ADD_EDGE':
          case 'REMOVE_EDGE': {
            const { neighborsBefore } = entry.undoData as any;
            applyNeighborsSnapshot(s.nodes, neighborsBefore);
            break;
          }
          case 'ADD_TRANSITION':
          case 'REMOVE_TRANSITION': {
            const { transitions } = entry.undoData as any;
            s.transitions = [...transitions];
            break;
          }
          case 'SET_ALIASES': {
            const { nodeId, names } = entry.undoData as any;
            if (names.length > 0) {
              s.aliases.set(nodeId, [...names]);
            } else {
              s.aliases.delete(nodeId);
            }
            break;
          }
          case 'BATCH': {
            const u = entry.undoData as any;
            if (u.kind === 'line' && u.nodeIds) {
              for (const [, n] of s.nodes) {
                n.neighbors = n.neighbors.filter(x => !u.nodeIds.includes(x));
              }
              for (const id of u.nodeIds) {
                s.nodes.delete(id);
                s.aliases.delete(id);
                s.comments.delete(id);
              }
              s.selectedNodeIds = new Set();
            } else if (u.kind === 'deleteMultiple') {
              for (const node of u.nodes) {
                s.nodes.set(node.id, { ...node, neighbors: [...node.neighbors] });
              }
              applyNeighborsSnapshot(s.nodes, u.neighborsBefore);
              s.transitions = [...u.transitionsBefore];
              // Восстанавливаем алиасы
              if (u.aliases) {
                for (const a of u.aliases) {
                  s.aliases.set(a.id, [...a.names]);
                }
              }
              // Восстанавливаем комментарии
              if (u.comments) {
                for (const c of u.comments) {
                  s.comments.set(c.id, c.comment);
                }
              }
            } else if (u.kind === 'moveMultiple') {
              for (const pos of u.positions) {
                const n = s.nodes.get(pos.nodeId);
                if (n) { n.x = pos.x; n.y = pos.y; }
              }
            } else if (u.kind === 'setPortal') {
              for (const change of u.changes) {
                const n = s.nodes.get(change.nodeId);
                if (n) n.isPortal = change.isPortal;
              }
            } else if (u.kind === 'chainConnect') {
              applyNeighborsSnapshot(s.nodes, u.neighborsBefore);
            } else if (u.kind === 'comment') {
              if (u.comment) {
                s.comments.set(u.nodeId, u.comment);
              } else {
                s.comments.delete(u.nodeId);
              }
            } else if (u.kind === 'autofix') {
              applyNeighborsSnapshot(s.nodes, u.neighborsBefore);
              s.transitions = [...u.transitionsBefore];
            } else if (u.kind === 'splitEdge') {
              // Удаляем новый узел
              s.nodes.delete(u.newNodeId);
             // Восстанавливаем соседей
             applyNeighborsSnapshot(s.nodes, u.neighborsBefore);
             s.selectedNodeIds = new Set();
           } else if (u.kind === 'subdivideEdge') {
             // Удаляем все новые узлы
             for (const id of u.nodeIds) {
               s.nodes.delete(id);
             }
             // Восстанавливаем соседей
             applyNeighborsSnapshot(s.nodes, u.neighborsBefore);
             s.selectedNodeIds = new Set();
           }
            break;
          }
        }
        s.hasUnsavedChanges = true;
      });
    },

    redo: () => {
      const entry = useHistoryStore.getState().redo();
      if (!entry) return;

      set((s) => {
        switch (entry.type) {
          case 'ADD_NODE': {
            const { node } = entry.redoData as any;
            s.nodes.set(node.id, { ...node, neighbors: [...node.neighbors] });
            break;
          }
          case 'REMOVE_NODE': {
            const { nodeId } = entry.redoData as any;
            for (const [, n] of s.nodes) {
              n.neighbors = n.neighbors.filter(x => x !== nodeId);
            }
            s.transitions = s.transitions.filter(t => t.fromNode !== nodeId && t.toNode !== nodeId);
            s.nodes.delete(nodeId);
            s.aliases.delete(nodeId);
            s.comments.delete(nodeId);
            s.selectedNodeIds = new Set();
            break;
          }
          case 'MOVE_NODE': {
            const { nodeId, x, y } = entry.redoData as any;
            const n = s.nodes.get(nodeId);
            if (n) { n.x = x; n.y = y; }
            break;
          }
          case 'UPDATE_NODE': {
            const { nodeId, updates } = entry.redoData as any;
            const n = s.nodes.get(nodeId);
            if (n) Object.assign(n, updates);
            break;
          }
          case 'ADD_EDGE': {
            const { fromId, toId } = entry.redoData as any;
            const a = s.nodes.get(fromId);
            const b = s.nodes.get(toId);
            if (a && b) {
              if (!a.neighbors.includes(toId)) a.neighbors.push(toId);
              if (!b.neighbors.includes(fromId)) b.neighbors.push(fromId);
            }
            break;
          }
          case 'REMOVE_EDGE': {
            const { fromId, toId } = entry.redoData as any;
            const a = s.nodes.get(fromId);
            const b = s.nodes.get(toId);
            if (a) a.neighbors = a.neighbors.filter(x => x !== toId);
            if (b) b.neighbors = b.neighbors.filter(x => x !== fromId);
            break;
          }
          case 'ADD_TRANSITION':
          case 'REMOVE_TRANSITION': {
            const { transitions } = entry.redoData as any;
            s.transitions = [...transitions];
            break;
          }
          case 'SET_ALIASES': {
            const { nodeId, names } = entry.redoData as any;
            if (names.length > 0) {
              s.aliases.set(nodeId, [...names]);
            } else {
              s.aliases.delete(nodeId);
            }
            break;
          }
          case 'BATCH': {
            const r = entry.redoData as any;
            if (r.kind === 'line' && r.nodes) {
              for (const n of r.nodes) {
                s.nodes.set(n.id, { ...n, neighbors: [...n.neighbors] });
              }
            } else if (r.kind === 'deleteMultiple') {
              for (const id of r.nodeIds) {
                s.nodes.delete(id);
                s.aliases.delete(id);
                s.comments.delete(id);
              }
              for (const [, n] of s.nodes) {
                n.neighbors = n.neighbors.filter(nb => !r.nodeIds.includes(nb));
              }
              s.transitions = s.transitions.filter(t =>
                !r.nodeIds.includes(t.fromNode) && !r.nodeIds.includes(t.toNode)
              );
              s.selectedNodeIds = new Set();
            } else if (r.kind === 'moveMultiple') {
              for (const pos of r.positions) {
                const n = s.nodes.get(pos.nodeId);
                if (n) { n.x = pos.x; n.y = pos.y; }
              }
            } else if (r.kind === 'setPortal') {
              for (const id of r.nodeIds) {
                const n = s.nodes.get(id);
                if (n) n.isPortal = r.isPortal;
              }
            } else if (r.kind === 'chainConnect') {
              const nodeIds = r.nodeIds as string[];
              for (let i = 0; i < nodeIds.length - 1; i++) {
                const a = s.nodes.get(nodeIds[i]);
                const b = s.nodes.get(nodeIds[i + 1]);
                if (a && b) {
                  if (!a.neighbors.includes(b.id)) a.neighbors.push(b.id);
                  if (!b.neighbors.includes(a.id)) b.neighbors.push(a.id);
                }
              }
            } else if (r.kind === 'comment') {
              if (r.comment) {
                s.comments.set(r.nodeId, r.comment);
              } else {
                s.comments.delete(r.nodeId);
              }
            } else if (r.kind === 'autofix') {
              for (const [id, neighbors] of Object.entries(r.fixedNodesNeighbors)) {
                const node = s.nodes.get(id);
                if (node) node.neighbors = neighbors as string[];
              }
              s.transitions = [...r.fixedTransitions];
            } else if (r.kind === 'splitEdge') {
              const { newNode, fromId, toId } = r;
              s.nodes.set(newNode.id, { ...newNode, neighbors: [...newNode.neighbors] });
              const from = s.nodes.get(fromId)!;
              const to = s.nodes.get(toId)!;
              from.neighbors = from.neighbors.filter(n => n !== toId);
              to.neighbors = to.neighbors.filter(n => n !== fromId);
              from.neighbors.push(newNode.id);
              to.neighbors.push(newNode.id);
            } else if (r.kind === 'subdivideEdge') {
              const { nodes: newNodes, fromId, toId } = r;
              for (const n of newNodes) {
                s.nodes.set(n.id, { ...n, neighbors: [...n.neighbors] });
              }
              const from = s.nodes.get(fromId)!;
              const to = s.nodes.get(toId)!;
              from.neighbors = from.neighbors.filter(n => n !== toId);
              to.neighbors = to.neighbors.filter(n => n !== fromId);
              from.neighbors.push(newNodes[0].id);
              to.neighbors.push(newNodes[newNodes.length - 1].id);
            }

            break;
          }
        }
        s.hasUnsavedChanges = true;
      });
    },

    autoFix: () => {
      const st = get();
      const neighborsBefore: NeighborSnapshot = {};
      for (const [id, node] of st.nodes) {
        neighborsBefore[id] = [...node.neighbors];
      }
      const transitionsBefore = [...st.transitions];

      const { fixedNodesNeighbors, fixedTransitions, report } = autoFixDataset({
        nodes: st.nodes,
        transitions: st.transitions,
      });

      const hasChanges =
        report.removedMissingNeighbors > 0 ||
        report.addedSymmetricEdges > 0 ||
        report.removedInvalidTransitions > 0 ||
        report.removedDuplicateTransitions > 0;

      if (hasChanges) {
        useHistoryStore.getState().push({
          type: 'BATCH',
          description: `Auto-fix`,
          undoData: { kind: 'autofix', neighborsBefore, transitionsBefore },
          redoData: { kind: 'autofix', fixedNodesNeighbors: Object.fromEntries(fixedNodesNeighbors), fixedTransitions },
        });

        set((s) => {
          for (const [id, neighbors] of fixedNodesNeighbors) {
            const node = s.nodes.get(id);
            if (node) node.neighbors = neighbors;
          }
          s.transitions = fixedTransitions;
          s.hasUnsavedChanges = true;
        });
      }

      return report;
    },

    loadData: (data) => set((state) => {
      state.nodes = new Map();
      state.bookmarks = new Map();
      let maxCounter = 0;

      for (const node of data.nodes) {
        state.nodes.set(node.id, { ...node, neighbors: [...(node.neighbors ?? [])] });
        const m = node.id.match(/_node_(\d+)$/);
        if (m) maxCounter = Math.max(maxCounter, parseInt(m[1], 10));
      }

      state.nodeIdCounter = maxCounter + 1;
      state.transitions = [...data.transitions];
      state.buildingMetas = new Map();
      for (const meta of data.buildingMetas) state.buildingMetas.set(meta.id, meta);
      state.aliases = new Map();
      data.aliases?.forEach((a: any) => state.aliases.set(a.id, [...a.names]));
      state.comments = new Map();
      state.selectedNodeIds = new Set();
      state.edgeStartNodeId = null;
      state.transitionStartNodeId = null;
      state.hasUnsavedChanges = false;
      state.isLoading = false;
      state.lineTool.start = null;
      state.lineTool.end = null;
      state.selectionBox = null;
      state.routeSimulation = {
        active: false,
        fromNodeId: null,
        toNodeId: null,
        path: [],
        alternativePaths: [],
        animationIndex: 0,
        selectedPathIndex: 0,
        animationSpeed: 800,
        pathfindingOptions: {
          allowStairs: true,
          allowLift: true,
          allowBridge: true,
          allowEntrance: true,
          preferLift: false,
        },
      };

      useHistoryStore.getState().clear();
    }),

    exportToZip: async () => {
      const { nodes, transitions, buildingMetas, aliases } = get();
      const { exportToZip } = await import('../utils/exportData');
      const aliasesArray = Array.from(aliases.entries())
        .filter(([id]) => nodes.has(id)) // Фильтруем алиасы удалённых узлов
        .map(([id, names]) => ({ id, names }));
      await exportToZip({ nodes, transitions, buildingMetas, aliases: aliasesArray });
      set((s) => { s.hasUnsavedChanges = false; });
    },

    getNode: (nodeId) => get().nodes.get(nodeId),

    getNodesForCurrentFloor: () => {
      const { nodes, currentBuilding, currentFloor, displayFilters } = get();
      let result = currentBuilding
        ? Array.from(nodes.values()).filter(n => n.building === currentBuilding && n.floor === currentFloor)
        : Array.from(nodes.values()).filter(n => n.building === 'CAMPUS');

      if (!displayFilters.showPortals) {
        result = result.filter(n => !n.isPortal);
      }

      return result;
    },

    getEdgesForCurrentFloor: () => {
      const { displayFilters } = get();
      if (!displayFilters.showEdges) return [];

      const nodes = get().getNodesForCurrentFloor();
      const getNode = get().getNode;
      const edges: { from: string; to: string }[] = [];
      const seen = new Set<string>();

      nodes.forEach((node) => {
        node.neighbors.forEach((neighborId) => {
          const key = [node.id, neighborId].sort().join('|');
          if (!seen.has(key) && getNode(neighborId)) {
            seen.add(key);
            edges.push({ from: node.id, to: neighborId });
          }
        });
      });

      return edges;
    },

    getVisibleTransitions: () => {
      const { transitions, currentBuilding, currentFloor, nodes, displayFilters } = get();
      if (!displayFilters.showTransitions) return [];

      return transitions.filter((t) => {
        const fromNode = nodes.get(t.fromNode);
        const toNode = nodes.get(t.toNode);
        if (!fromNode || !toNode) return false;

        if (!currentBuilding) {
          return fromNode.building === 'CAMPUS' || toNode.building === 'CAMPUS';
        }

        return (
          (fromNode.building === currentBuilding && fromNode.floor === currentFloor) ||
          (toNode.building === currentBuilding && toNode.floor === currentFloor)
        );
      });
    },

    getTransitionsForNode: (nodeId) => {
      return get().transitions.filter((t) => t.fromNode === nodeId || t.toNode === nodeId);
    },
  }))
);
