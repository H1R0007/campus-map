import { create } from 'zustand';
import { findPath, PathResult, PathfindingOptions, SearchSuggestion } from '@campus-map/core';
import { useMapStore } from './mapStore';

interface RouteState {
  fromQuery: string;
  toQuery: string;

  fromNodeId: string | null;
  toNodeId: string | null;

  fromSuggestions: SearchSuggestion[];
  toSuggestions: SearchSuggestion[];

  activeField: 'from' | 'to' | null;

  currentRoute: PathResult | null;

  options: PathfindingOptions;

  setFromQuery: (query: string) => void;
  setToQuery: (query: string) => void;
  setActiveField: (field: 'from' | 'to' | null) => void;
  selectSuggestion: (suggestion: SearchSuggestion) => void;
  buildRoute: () => void;
  clearRoute: () => void;
  swapPoints: () => void;
  setOptions: (options: Partial<PathfindingOptions>) => void;
}

export const useRouteStore = create<RouteState>((set, get) => ({
  fromQuery: '',
  toQuery: '',
  fromNodeId: null,
  toNodeId: null,
  fromSuggestions: [],
  toSuggestions: [],
  activeField: null,
  currentRoute: null,
  options: {
    allowStairs: true,
    allowLift: true,
    allowBridge: true,
    allowDoor: true,
  },

  setFromQuery: (query) => {
    const aliasManager = useMapStore.getState().aliasManager;
    const graph = useMapStore.getState().graph;

    const suggestions = aliasManager?.suggest(query, 5) ?? [];

    let resolvedId = aliasManager?.resolve(query) ?? null;
    if (!resolvedId && graph?.hasNode(query)) resolvedId = query; // NEW: direct id support

    set({
      fromQuery: query,
      fromSuggestions: query.trim() ? suggestions : [],
      fromNodeId: resolvedId,
    });
  },

  setToQuery: (query) => {
    const aliasManager = useMapStore.getState().aliasManager;
    const graph = useMapStore.getState().graph;

    const suggestions = aliasManager?.suggest(query, 5) ?? [];

    let resolvedId = aliasManager?.resolve(query) ?? null;
    if (!resolvedId && graph?.hasNode(query)) resolvedId = query; // NEW: direct id support

    set({
      toQuery: query,
      toSuggestions: query.trim() ? suggestions : [],
      toNodeId: resolvedId,
    });
  },

  setActiveField: (field) => set({ activeField: field }),

  selectSuggestion: (suggestion) => {
    const { activeField } = get();

    if (activeField === 'from') {
      set({
        fromQuery: suggestion.alias,
        fromNodeId: suggestion.id,
        fromSuggestions: [],
        activeField: null,
      });
    } else if (activeField === 'to') {
      set({
        toQuery: suggestion.alias,
        toNodeId: suggestion.id,
        toSuggestions: [],
        activeField: null,
      });
    }
  },

  buildRoute: () => {
    const { fromNodeId, toNodeId, options } = get();
    const graph = useMapStore.getState().graph;

    if (!graph || !fromNodeId || !toNodeId) {
      set({ currentRoute: null });
      return;
    }

    const result = findPath(graph, fromNodeId, toNodeId, options);
    set({ currentRoute: result, activeField: null });
  },

  clearRoute: () =>
    set({
      fromQuery: '',
      toQuery: '',
      fromNodeId: null,
      toNodeId: null,
      fromSuggestions: [],
      toSuggestions: [],
      currentRoute: null,
      activeField: null,
    }),

  swapPoints: () => {
    const { fromQuery, toQuery, fromNodeId, toNodeId } = get();
    set({
      fromQuery: toQuery,
      toQuery: fromQuery,
      fromNodeId: toNodeId,
      toNodeId: fromNodeId,
      fromSuggestions: [],
      toSuggestions: [],
    });
  },

  setOptions: (newOptions) =>
    set((state) => ({
      options: { ...state.options, ...newOptions },
    })),
}));