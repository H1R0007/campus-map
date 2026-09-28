/**
 * Раскладка экрана редактора, которую помнит браузер: свёрнуты ли колонки,
 * их ширина, тема.
 *
 * Это удобство одного человека на одном компьютере, а не данные: хранилище
 * может быть недоступно (приватное окно, запрет сайтам хранить данные), и
 * тогда редактор просто открывается как по умолчанию.
 */

/** Тема: как в системе, тёмная или светлая (запись 56). */
export type ThemeChoice = 'system' | 'dark' | 'light';

/** Режим работы (запись 60); тип — `Workspace` в `panelSlice`, здесь — без зависимости от стора. */
export type WorkspacePref = 'plans' | 'markup' | 'check';

export interface LayoutPrefs {
  structureCollapsed: boolean;
  inspectorCollapsed: boolean;
  /** Ширина колонки структуры, CSS-пиксели; `null` — по умолчанию. */
  structureWidth: number | null;
  /** Ширина правой колонки, CSS-пиксели; `null` — по умолчанию. */
  inspectorWidth: number | null;
  theme: ThemeChoice;
  /** Последний режим: редактор открывается там, где работали. */
  workspace: WorkspacePref;
  /** Доля ширины левой карты, когда карты рядом (запись 66); `null` — поровну. */
  splitRatio: number | null;
}

const KEY = 'campus-editor:layout';

const DEFAULTS: LayoutPrefs = {
  structureCollapsed: false,
  inspectorCollapsed: false,
  structureWidth: null,
  inspectorWidth: null,
  theme: 'system',
  workspace: 'markup',
  splitRatio: null,
};

const widthOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null;

export function readLayoutPrefs(): LayoutPrefs {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Record<keyof LayoutPrefs, unknown>>;
    return {
      structureCollapsed: parsed.structureCollapsed === true,
      inspectorCollapsed: parsed.inspectorCollapsed === true,
      structureWidth: widthOf(parsed.structureWidth),
      inspectorWidth: widthOf(parsed.inspectorWidth),
      theme: parsed.theme === 'dark' || parsed.theme === 'light' ? parsed.theme : 'system',
      workspace: parsed.workspace === 'plans' || parsed.workspace === 'check' ? parsed.workspace : 'markup',
      splitRatio:
        typeof parsed.splitRatio === 'number' && parsed.splitRatio > 0 && parsed.splitRatio < 1 ? parsed.splitRatio : null,
    };
  } catch {
    return DEFAULTS;
  }
}

/** Запоминает часть раскладки; остальное — как было. */
export function updateLayoutPrefs(patch: Partial<LayoutPrefs>): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify({ ...readLayoutPrefs(), ...patch }));
  } catch {
    // Не запомнили — откроется как по умолчанию; работе это не мешает.
  }
}
