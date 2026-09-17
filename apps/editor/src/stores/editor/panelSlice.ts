import type { EditorSlice } from './types';

/**
 * На чём открыто контекстное меню.
 *
 * Меню одно на всё, и что в нём показать, решает только цель. Раньше
 * существовали два компонента меню, оба открывались на ребре одновременно и
 * закрывали друг друга раньше, чем срабатывала кнопка.
 */
export type ContextMenuTarget =
  | { kind: 'node'; nodeId: string }
  | { kind: 'selection'; nodeIds: string[] }
  | { kind: 'edge'; from: string; to: string }
  | { kind: 'transition'; from: string; to: string }
  /** Пустое место карты; `x`, `y` — точка плана под курсором. */
  | { kind: 'map'; x: number; y: number };

export interface ContextMenuState {
  open: boolean;
  /** Точка окна, где нажата правая кнопка. */
  x: number;
  y: number;
  target: ContextMenuTarget | null;
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

  openContextMenu: (x: number, y: number, target: ContextMenuTarget) => void;
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
    target: null,
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

  openContextMenu: (x, y, target) =>
    set((s) => {
      s.contextMenu = { open: true, x, y, target };
    }),

  closeContextMenu: () =>
    set((s) => {
      s.contextMenu = { open: false, x: 0, y: 0, target: null };
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
