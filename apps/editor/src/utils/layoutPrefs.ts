/**
 * Раскладка экрана редактора, которую помнит браузер: свёрнуты ли колонки.
 *
 * Это удобство одного человека на одном компьютере, а не данные: хранилище
 * может быть недоступно (приватное окно, запрет сайтам хранить данные), и
 * тогда редактор просто открывается с развёрнутыми колонками.
 */
export interface LayoutPrefs {
  structureCollapsed: boolean;
  inspectorCollapsed: boolean;
}

const KEY = 'campus-editor:layout';

const DEFAULTS: LayoutPrefs = { structureCollapsed: false, inspectorCollapsed: false };

export function readLayoutPrefs(): LayoutPrefs {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<LayoutPrefs>;
    return {
      structureCollapsed: parsed.structureCollapsed === true,
      inspectorCollapsed: parsed.inspectorCollapsed === true,
    };
  } catch {
    return DEFAULTS;
  }
}

export function writeLayoutPrefs(prefs: LayoutPrefs): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Не запомнили — откроется развёрнутым; работе это не мешает.
  }
}
