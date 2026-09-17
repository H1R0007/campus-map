import type { EditorSlice } from './types';

export interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  nodeId: string | null;
  edgeFrom: string | null;
  edgeTo: string | null;
}

export interface Bookmark {
  nodeId: string;
  name: string;
  createdAt: number;
}

/**
 * Открытые панели, контекстное меню, история поиска и закладки.
 */
export interface PanelSlice {
  diagnosticsOpen: boolean;
  searchOpen: boolean;
  statisticsOpen: boolean;
  filtersOpen: boolean;
  routeSimulatorOpen: boolean;
  contextMenu: ContextMenuState;
  searchHistory: string[];
  bookmarks: Map<string, Bookmark>;

  setDiagnosticsOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setStatisticsOpen: (open: boolean) => void;
  setFiltersOpen: (open: boolean) => void;
  setRouteSimulatorOpen: (open: boolean) => void;

  openContextMenu: (
    x: number,
    y: number,
    nodeId: string | null,
    edgeFrom?: string | null,
    edgeTo?: string | null
  ) => void;
  closeContextMenu: () => void;

  addToSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;

  addBookmark: (nodeId: string, name?: string) => void;
  removeBookmark: (id: string) => void;
  renameBookmark: (id: string, name: string) => void;
  goToBookmark: (id: string) => void;
}

export const createPanelSlice: EditorSlice<PanelSlice> = (set, get) => ({
  diagnosticsOpen: false,
  searchOpen: false,
  statisticsOpen: false,
  filtersOpen: false,
  routeSimulatorOpen: false,

  contextMenu: {
    open: false,
    x: 0,
    y: 0,
    nodeId: null,
    edgeFrom: null,
    edgeTo: null,
  },

  searchHistory: [],
  bookmarks: new Map(),

  setDiagnosticsOpen: (open) =>
    set((s) => {
      s.diagnosticsOpen = open;
    }),
  setSearchOpen: (open) =>
    set((s) => {
      s.searchOpen = open;
    }),
  setStatisticsOpen: (open) =>
    set((s) => {
      s.statisticsOpen = open;
    }),
  setFiltersOpen: (open) =>
    set((s) => {
      s.filtersOpen = open;
    }),
  setRouteSimulatorOpen: (open) =>
    set((s) => {
      s.routeSimulatorOpen = open;
    }),

  openContextMenu: (x, y, nodeId, edgeFrom = null, edgeTo = null) =>
    set((s) => {
      s.contextMenu = { open: true, x, y, nodeId, edgeFrom, edgeTo };
    }),

  closeContextMenu: () =>
    set((s) => {
      s.contextMenu.open = false;
    }),

  addToSearchHistory: (query) =>
    set((s) => {
      const q = query.trim();
      if (!q) return;
      s.searchHistory = [q, ...s.searchHistory.filter((h) => h !== q)].slice(0, 10);
    }),

  clearSearchHistory: () =>
    set((s) => {
      s.searchHistory = [];
    }),

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

  removeBookmark: (id) =>
    set((s) => {
      s.bookmarks.delete(id);
    }),

  renameBookmark: (id, name) =>
    set((s) => {
      const bm = s.bookmarks.get(id);
      if (bm) bm.name = name;
    }),

  goToBookmark: (id) => {
    const bm = get().bookmarks.get(id);
    if (bm) get().centerOnNode(bm.nodeId);
  },
});
