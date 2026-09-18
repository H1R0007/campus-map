import { create } from 'zustand';

/**
 * Точка плана под курсором и масштаб карты — для строки состояния.
 *
 * Отдельный маленький стор: курсор меняется на каждом движении мыши, и
 * держать его в сторе редактора значило бы будить всех его подписчиков.
 */
interface CursorState {
  /** Точка плана под курсором, целые пиксели плана; `null` — курсор вне карты. */
  point: { x: number; y: number } | null;
  /** Уровень приближения Leaflet. */
  zoom: number | null;
  setPoint: (point: { x: number; y: number } | null) => void;
  setZoom: (zoom: number) => void;
}

export const useCursorStore = create<CursorState>((set, get) => ({
  point: null,
  zoom: null,
  setPoint: (point) => {
    const current = get().point;
    if (point === current) return;
    if (point && current && point.x === current.x && point.y === current.y) return;
    set({ point });
  },
  setZoom: (zoom) => {
    if (get().zoom !== zoom) set({ zoom });
  },
}));
