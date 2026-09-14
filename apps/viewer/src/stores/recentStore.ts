import { create } from 'zustand';
import { parseRecent, withRecent } from '../utils/recentPlaces';

/**
 * Недавние места поиска — на этом устройстве, в `localStorage`.
 *
 * Отдельный стор, как язык (`settingsStore`): это выбор человека, а не данные
 * кампуса и не маршрут. С сервером недавние места не связаны никак: навигатор
 * офлайновый, и то, что человек искал, никуда не уходит.
 */

const STORAGE_KEY = 'campus-map:recent-places';

function readStored(): string[] {
  // Вне браузера — в тестах на Node — хранилища нет.
  if (typeof window === 'undefined') return [];

  try {
    return parseRecent(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // Хранилище недоступно: приватный режим, запрет на сайт, песочница.
    // Недавние места тогда просто не переживают перезагрузку.
    return [];
  }
}

function writeStored(list: readonly string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // См. `readStored`: список действует до закрытия вкладки.
  }
}

interface RecentState {
  /** id узлов, последнее выбранное — первым. */
  recent: string[];
  remember: (nodeId: string) => void;
  clear: () => void;
}

export const useRecentStore = create<RecentState>((set, get) => ({
  recent: readStored(),

  remember: (nodeId) => {
    const next = withRecent(get().recent, nodeId);
    writeStored(next);
    set({ recent: next });
  },

  clear: () => {
    writeStored([]);
    set({ recent: [] });
  },
}));
