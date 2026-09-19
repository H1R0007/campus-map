import { readLayoutPrefs, writeLayoutPrefs } from '../../utils/layoutPrefs';
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

/** Короткое сообщение над картой: что сделано или почему не сделано. */
export interface EditorNotice {
  text: string;
  kind: 'info' | 'warn';
  /** Меняется с каждым сообщением: одно и то же сообщение подряд видно снова. */
  id: number;
}

/**
 * Вкладка инспектора — правой колонки редактора.
 *
 * - `properties` — выбранное на карте (без выбора — обзор плана);
 * - `problems` — проверка данных;
 * - `route` — проверка маршрута. Метка идёт по маршруту, только пока
 *   открыта эта вкладка.
 */
export type InspectorTab = 'properties' | 'problems' | 'route';

/**
 * Раскладка экрана, открытые окна, контекстное меню и история поиска.
 *
 * Плавающих панелей поверх карты больше нет: всё, что раньше открывалось
 * над планом, живёт в закреплённых колонках по бокам (запись 39).
 */
export interface PanelSlice {
  inspectorTab: InspectorTab;
  /** Левая колонка (структура и «Показывать») свёрнута в полоску. */
  structureCollapsed: boolean;
  /** Правая колонка (инспектор) свёрнута в полоску. */
  inspectorCollapsed: boolean;
  searchOpen: boolean;
  /** Открыта справка по мыши и клавишам. */
  helpOpen: boolean;
  /** Открыто окно со всеми видами точек. */
  kindsOpen: boolean;
  /**
   * Узел, которому просили сразу ввести название (двойной щелчок по узлу или
   * точка, поставленная кистью). Карточка узла ставит курсор в поле названия
   * и сбрасывает просьбу.
   */
  nameEditNodeId: string | null;
  /**
   * Начало названия, которое уже подставил вид точки («А-3»): человеку
   * остаётся дописать номер.
   */
  nameEditDraft: string;
  contextMenu: ContextMenuState;
  notice: EditorNotice | null;
  searchHistory: string[];

  /**
   * Открыть вкладку инспектора. `expand` — развернуть свёрнутый инспектор:
   * кнопка «Проверка» разворачивает, а щелчок по узлу на карте — нет, чтобы
   * не отнимать место у карты, которое человек освободил сам.
   */
  setInspectorTab: (tab: InspectorTab, expand?: boolean) => void;
  setStructureCollapsed: (collapsed: boolean) => void;
  setInspectorCollapsed: (collapsed: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setKindsOpen: (open: boolean) => void;
  /**
   * Выбрать узел, открыть его карточку и поставить курсор в название.
   * `draft` — начало названия из шаблона вида точки.
   */
  editNodeName: (nodeId: string, draft?: string) => void;
  clearNameEdit: () => void;

  openContextMenu: (x: number, y: number, target: ContextMenuTarget) => void;
  closeContextMenu: () => void;

  /** Показать сообщение над картой; `warn` — не получилось. */
  showNotice: (text: string, kind?: 'info' | 'warn') => void;
  hideNotice: () => void;

  addToSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;
}

export const createPanelSlice: EditorSlice<PanelSlice> = (set, get) => ({
  inspectorTab: 'properties',
  structureCollapsed: readLayoutPrefs().structureCollapsed,
  inspectorCollapsed: readLayoutPrefs().inspectorCollapsed,
  searchOpen: false,
  helpOpen: false,
  kindsOpen: false,
  nameEditNodeId: null,
  nameEditDraft: '',

  contextMenu: {
    open: false,
    x: 0,
    y: 0,
    target: null,
  },

  notice: null,
  searchHistory: [],

  setInspectorTab: (tab, expand = true) => {
    if (expand && get().inspectorCollapsed) get().setInspectorCollapsed(false);
    set((s) => {
      s.inspectorTab = tab;
    });
  },

  setStructureCollapsed: (collapsed) => {
    set((s) => {
      s.structureCollapsed = collapsed;
    });
    writeLayoutPrefs({ structureCollapsed: collapsed, inspectorCollapsed: get().inspectorCollapsed });
  },

  setInspectorCollapsed: (collapsed) => {
    set((s) => {
      s.inspectorCollapsed = collapsed;
    });
    writeLayoutPrefs({ structureCollapsed: get().structureCollapsed, inspectorCollapsed: collapsed });
  },

  setSearchOpen: (open) =>
    set((s) => {
      s.searchOpen = open;
    }),

  setHelpOpen: (open) =>
    set((s) => {
      s.helpOpen = open;
    }),

  setKindsOpen: (open) =>
    set((s) => {
      s.kindsOpen = open;
    }),

  editNodeName: (nodeId, draft = '') => {
    get().selectSingleNode(nodeId);
    get().setInspectorTab('properties');
    set((s) => {
      s.nameEditNodeId = nodeId;
      s.nameEditDraft = draft;
    });
  },

  clearNameEdit: () =>
    set((s) => {
      s.nameEditNodeId = null;
      s.nameEditDraft = '';
    }),

  openContextMenu: (x, y, target) =>
    set((s) => {
      s.contextMenu = { open: true, x, y, target };
    }),

  closeContextMenu: () =>
    set((s) => {
      s.contextMenu = { open: false, x: 0, y: 0, target: null };
    }),

  showNotice: (text, kind = 'info') =>
    set((s) => {
      s.notice = { text, kind, id: (s.notice?.id ?? 0) + 1 };
    }),

  hideNotice: () =>
    set((s) => {
      s.notice = null;
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
});
