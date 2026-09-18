import type { Draft } from 'immer';
import type { PlaceCategory, Transition } from '@campus-map/core';
import type { HistoryEntry } from '../historyStore';
import { applyNeighborsSnapshot } from './graphState';
import type { EditorStore } from './types';

/** Ключ перехода со всеми полями: по нему видно, что именно изменилось. */
const transitionKey = (t: Transition) => `${t.fromNode}|${t.toNode}|${t.type}`;

/** Узлы переходов, которых коснулась правка: разница списков «до» и «после». */
function changedTransitionNodes(before: Transition[], after: Transition[]): string[] {
  const beforeKeys = new Set(before.map(transitionKey));
  const afterKeys = new Set(after.map(transitionKey));
  return [
    ...before.filter((t) => !afterKeys.has(transitionKey(t))),
    ...after.filter((t) => !beforeKeys.has(transitionKey(t))),
  ].flatMap((t) => [t.fromNode, t.toNode]);
}

/**
 * Узлы, которых касается запись истории.
 *
 * По ним отмена показывает, где именно она произошла: открывает нужный план
 * и выделяет затронутое. Автоисправление меняет весь датасет сразу, поэтому
 * для него список пуст — показывать нечего.
 */
export function entryNodes(entry: HistoryEntry): string[] {
  switch (entry.type) {
    case 'ADD_NODE':
      return [entry.redoData.node.id];
    case 'REMOVE_NODE':
      return [entry.undoData.node.id];
    case 'MOVE_NODE':
    case 'UPDATE_NODE':
    case 'SET_ALIASES':
    case 'SET_CATEGORY':
      return [entry.undoData.nodeId];
    case 'ADD_EDGE':
    case 'REMOVE_EDGE':
      return [entry.redoData.fromId, entry.redoData.toId];
    case 'ADD_TRANSITION':
    case 'REMOVE_TRANSITION':
    case 'UPDATE_TRANSITION':
      return changedTransitionNodes(entry.undoData.transitions, entry.redoData.transitions);
    case 'BATCH':
      switch (entry.undoData.kind) {
        case 'line':
          return entry.undoData.nodeIds;
        case 'deleteMultiple':
          return entry.undoData.nodes.map((node) => node.id);
        case 'moveMultiple':
          return entry.undoData.positions.map((position) => position.nodeId);
        case 'setPortal':
          return entry.undoData.changes.map((change) => change.nodeId);
        case 'chainConnect':
          return Object.keys(entry.undoData.neighborsBefore);
        case 'splitEdge':
          return [entry.undoData.newNodeId, entry.undoData.fromId, entry.undoData.toId];
        case 'autofix':
          return entry.undoData.positionsBefore.map((position) => position.nodeId);
      }
  }
}

/**
 * Применение записи истории к состоянию: отмена и повтор.
 *
 * Функции работают с черновиком immer внутри `set` и больше ничего не
 * трогают — поэтому каждую ветку можно проверить тестом «сделать → отменить →
 * повторить», не поднимая интерфейс.
 */

type State = Draft<EditorStore>;

/** Ставит или снимает вид места; пустой вид — отсутствие записи. */
function applyCategory(s: State, nodeId: string, category: PlaceCategory | null): void {
  if (category === null) s.aliasCategories.delete(nodeId);
  else s.aliasCategories.set(nodeId, category);
}

export function applyUndo(s: State, entry: HistoryEntry): void {
  switch (entry.type) {
    case 'ADD_NODE': {
      const { nodeId } = entry.undoData;
      s.nodes.delete(nodeId);
      s.aliases.delete(nodeId);
      s.selectedNodeIds = new Set();
      break;
    }
    case 'REMOVE_NODE': {
      const { node, neighborsBefore, transitionsBefore, aliases } = entry.undoData;
      s.nodes.set(node.id, { ...node, neighbors: [...node.neighbors] });
      applyNeighborsSnapshot(s.nodes, neighborsBefore);
      s.transitions = [...transitionsBefore];
      if (aliases && aliases.length > 0) {
        s.aliases.set(node.id, [...aliases]);
      }
      break;
    }
    case 'MOVE_NODE': {
      const { nodeId, x, y } = entry.undoData;
      const n = s.nodes.get(nodeId);
      if (n) {
        n.x = x;
        n.y = y;
      }
      break;
    }
    case 'UPDATE_NODE': {
      const { nodeId, updates } = entry.undoData;
      const n = s.nodes.get(nodeId);
      if (n) Object.assign(n, updates);
      break;
    }
    case 'ADD_EDGE':
    case 'REMOVE_EDGE': {
      applyNeighborsSnapshot(s.nodes, entry.undoData.neighborsBefore);
      break;
    }
    case 'ADD_TRANSITION':
    case 'REMOVE_TRANSITION':
    case 'UPDATE_TRANSITION': {
      s.transitions = [...entry.undoData.transitions];
      break;
    }
    case 'SET_ALIASES': {
      const { nodeId, names } = entry.undoData;
      if (names.length > 0) s.aliases.set(nodeId, [...names]);
      else s.aliases.delete(nodeId);
      break;
    }
    case 'SET_CATEGORY': {
      applyCategory(s, entry.undoData.nodeId, entry.undoData.category);
      break;
    }
    case 'BATCH': {
      const u = entry.undoData;
      switch (u.kind) {
        case 'line': {
          for (const [, n] of s.nodes) {
            n.neighbors = n.neighbors.filter((x) => !u.nodeIds.includes(x));
          }
          for (const id of u.nodeIds) {
            s.nodes.delete(id);
            s.aliases.delete(id);
          }
          s.selectedNodeIds = new Set();
          break;
        }
        case 'deleteMultiple': {
          for (const node of u.nodes) {
            s.nodes.set(node.id, { ...node, neighbors: [...node.neighbors] });
          }
          applyNeighborsSnapshot(s.nodes, u.neighborsBefore);
          s.transitions = [...u.transitionsBefore];
          for (const a of u.aliases ?? []) {
            s.aliases.set(a.id, [...a.names]);
          }
          break;
        }
        case 'moveMultiple': {
          for (const pos of u.positions) {
            const n = s.nodes.get(pos.nodeId);
            if (n) {
              n.x = pos.x;
              n.y = pos.y;
            }
          }
          break;
        }
        case 'setPortal': {
          for (const change of u.changes) {
            const n = s.nodes.get(change.nodeId);
            if (n) n.isPortal = change.isPortal;
          }
          break;
        }
        case 'chainConnect': {
          applyNeighborsSnapshot(s.nodes, u.neighborsBefore);
          break;
        }
        case 'autofix': {
          applyNeighborsSnapshot(s.nodes, u.neighborsBefore);
          s.transitions = [...u.transitionsBefore];
          for (const position of u.positionsBefore) {
            const node = s.nodes.get(position.nodeId);
            if (node) {
              node.x = position.x;
              node.y = position.y;
            }
          }
          break;
        }
        case 'splitEdge': {
          s.nodes.delete(u.newNodeId);
          applyNeighborsSnapshot(s.nodes, u.neighborsBefore);
          s.selectedNodeIds = new Set();
          break;
        }

      }
      break;
    }
  }
}

export function applyRedo(s: State, entry: HistoryEntry): void {
  switch (entry.type) {
    case 'ADD_NODE': {
      const { node } = entry.redoData;
      s.nodes.set(node.id, { ...node, neighbors: [...node.neighbors] });
      break;
    }
    case 'REMOVE_NODE': {
      const { nodeId } = entry.redoData;
      for (const [, n] of s.nodes) {
        n.neighbors = n.neighbors.filter((x) => x !== nodeId);
      }
      s.transitions = s.transitions.filter((t) => t.fromNode !== nodeId && t.toNode !== nodeId);
      s.nodes.delete(nodeId);
      s.aliases.delete(nodeId);
      s.selectedNodeIds = new Set();
      break;
    }
    case 'MOVE_NODE': {
      const { nodeId, x, y } = entry.redoData;
      const n = s.nodes.get(nodeId);
      if (n) {
        n.x = x;
        n.y = y;
      }
      break;
    }
    case 'UPDATE_NODE': {
      const { nodeId, updates } = entry.redoData;
      const n = s.nodes.get(nodeId);
      if (n) Object.assign(n, updates);
      break;
    }
    case 'ADD_EDGE': {
      const { fromId, toId } = entry.redoData;
      const a = s.nodes.get(fromId);
      const b = s.nodes.get(toId);
      if (a && b) {
        if (!a.neighbors.includes(toId)) a.neighbors.push(toId);
        if (!b.neighbors.includes(fromId)) b.neighbors.push(fromId);
      }
      break;
    }
    case 'REMOVE_EDGE': {
      const { fromId, toId } = entry.redoData;
      const a = s.nodes.get(fromId);
      const b = s.nodes.get(toId);
      if (a) a.neighbors = a.neighbors.filter((x) => x !== toId);
      if (b) b.neighbors = b.neighbors.filter((x) => x !== fromId);
      break;
    }
    case 'ADD_TRANSITION':
    case 'REMOVE_TRANSITION':
    case 'UPDATE_TRANSITION': {
      s.transitions = [...entry.redoData.transitions];
      break;
    }
    case 'SET_CATEGORY': {
      applyCategory(s, entry.redoData.nodeId, entry.redoData.category);
      break;
    }
    case 'SET_ALIASES': {
      const { nodeId, names } = entry.redoData;
      if (names.length > 0) s.aliases.set(nodeId, [...names]);
      else s.aliases.delete(nodeId);
      break;
    }
    case 'BATCH': {
      const r = entry.redoData;
      switch (r.kind) {
        case 'line': {
          for (const n of r.nodes) {
            s.nodes.set(n.id, { ...n, neighbors: [...n.neighbors] });
          }
          break;
        }
        case 'deleteMultiple': {
          for (const id of r.nodeIds) {
            s.nodes.delete(id);
            s.aliases.delete(id);
          }
          for (const [, n] of s.nodes) {
            n.neighbors = n.neighbors.filter((nb) => !r.nodeIds.includes(nb));
          }
          s.transitions = s.transitions.filter(
            (t) => !r.nodeIds.includes(t.fromNode) && !r.nodeIds.includes(t.toNode)
          );
          s.selectedNodeIds = new Set();
          break;
        }
        case 'moveMultiple': {
          for (const pos of r.positions) {
            const n = s.nodes.get(pos.nodeId);
            if (n) {
              n.x = pos.x;
              n.y = pos.y;
            }
          }
          break;
        }
        case 'setPortal': {
          for (const id of r.nodeIds) {
            const n = s.nodes.get(id);
            if (n) n.isPortal = r.isPortal;
          }
          break;
        }
        case 'chainConnect': {
          for (let i = 0; i < r.nodeIds.length - 1; i++) {
            const a = s.nodes.get(r.nodeIds[i]);
            const b = s.nodes.get(r.nodeIds[i + 1]);
            if (a && b) {
              if (!a.neighbors.includes(b.id)) a.neighbors.push(b.id);
              if (!b.neighbors.includes(a.id)) b.neighbors.push(a.id);
            }
          }
          break;
        }
        case 'autofix': {
          for (const [id, neighbors] of Object.entries(r.fixedNodesNeighbors)) {
            const node = s.nodes.get(id);
            if (node) node.neighbors = [...neighbors];
          }
          for (const [id, position] of Object.entries(r.fixedCoordinates)) {
            const node = s.nodes.get(id);
            if (node) {
              node.x = position.x;
              node.y = position.y;
            }
          }
          s.transitions = [...r.fixedTransitions];
          break;
        }
        case 'splitEdge': {
          const { newNode, fromId, toId } = r;
          s.nodes.set(newNode.id, { ...newNode, neighbors: [...newNode.neighbors] });
          const from = s.nodes.get(fromId);
          const to = s.nodes.get(toId);
          if (from && to) {
            from.neighbors = from.neighbors.filter((n) => n !== toId);
            to.neighbors = to.neighbors.filter((n) => n !== fromId);
            from.neighbors.push(newNode.id);
            to.neighbors.push(newNode.id);
          }
          break;
        }

      }
      break;
    }
  }
}
