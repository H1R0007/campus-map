import { readLayoutPrefs, updateLayoutPrefs } from '../../utils/layoutPrefs';
import type { ThemeChoice } from '../../utils/layoutPrefs';
import { applyTheme, resolveTheme } from '../../utils/theme';
import type { ResolvedTheme } from '../../utils/theme';
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
 * Для чего открыто окно «Планы из файлов»: план этажа или территории, этажи
 * корпуса — или что угодно (`null`-поля). Окно подставляет это туда, где
 * догадка по файлу ничего не нашла.
 */
export interface ImportPreset {
  building?: string;
  floor?: number;
  campus?: boolean;
  /**
   * «Переделать план»: тот же лист того же файла с прежними поворотом и
   * обрезкой. Остальные листы файла пропускаются.
   */
  redo?: { file: string; page: number; rotation: number; crop: { x: number; y: number; width: number; height: number } | null };
}

/** Открытое окно «Планы из файлов» (запись 48). */
export interface ImportRequest {
  files: File[];
  preset: ImportPreset;
  /** Меняется с каждым открытием: файлы, брошенные в открытое окно, — новая просьба. */
  id: number;
}

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
  /** Ширина левой колонки, CSS-пиксели; `null` — по умолчанию. */
  structureWidth: number | null;
  /** Ширина правой колонки, CSS-пиксели; `null` — по умолчанию. */
  inspectorWidth: number | null;
  /** Выбранная тема и та, что сейчас на экране (запись 56). */
  themeChoice: ThemeChoice;
  theme: ResolvedTheme;
  searchOpen: boolean;
  /** Открыта справка по мыши и клавишам. */
  helpOpen: boolean;
  /** Открыто окно со всеми видами точек. */
  kindsOpen: boolean;
  /** Открыто окно «Планы из файлов». */
  importRequest: ImportRequest | null;
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
  /**
   * Ширина колонки; `null` — вернуть ширину по умолчанию. `remember` —
   * запомнить в браузере: во время перетаскивания края не нужно.
   */
  setColumnWidth: (column: 'structure' | 'inspector', width: number | null, remember?: boolean) => void;
  setThemeChoice: (choice: ThemeChoice) => void;
  /** Тема системы сменилась, пока выбрано «как в системе». */
  syncSystemTheme: () => void;
  setSearchOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setKindsOpen: (open: boolean) => void;
  /** Открыть окно «Планы из файлов» — с файлами (перетащили) или пустым (выбрать). */
  openImport: (files?: File[], preset?: ImportPreset) => void;
  closeImport: () => void;
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
  structureWidth: readLayoutPrefs().structureWidth,
  inspectorWidth: readLayoutPrefs().inspectorWidth,
  themeChoice: readLayoutPrefs().theme,
  theme: resolveTheme(readLayoutPrefs().theme),
  searchOpen: false,
  helpOpen: false,
  kindsOpen: false,
  importRequest: null,
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
    updateLayoutPrefs({ structureCollapsed: collapsed });
  },

  setInspectorCollapsed: (collapsed) => {
    set((s) => {
      s.inspectorCollapsed = collapsed;
    });
    updateLayoutPrefs({ inspectorCollapsed: collapsed });
  },

  setColumnWidth: (column, width, remember = true) => {
    set((s) => {
      if (column === 'structure') s.structureWidth = width;
      else s.inspectorWidth = width;
    });
    if (remember) updateLayoutPrefs(column === 'structure' ? { structureWidth: width } : { inspectorWidth: width });
  },

  setThemeChoice: (choice) => {
    const theme = resolveTheme(choice);
    applyTheme(theme);
    set((s) => {
      s.themeChoice = choice;
      s.theme = theme;
    });
    updateLayoutPrefs({ theme: choice });
  },

  syncSystemTheme: () => {
    if (get().themeChoice !== 'system') return;
    const theme = resolveTheme('system');
    applyTheme(theme);
    set((s) => {
      s.theme = theme;
    });
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

  openImport: (files = [], preset = {}) =>
    set((s) => {
      s.importRequest = { files, preset, id: (s.importRequest?.id ?? 0) + 1 };
    }),

  closeImport: () =>
    set((s) => {
      s.importRequest = null;
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
