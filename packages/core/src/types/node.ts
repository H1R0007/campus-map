/**
 * Узел навигационного графа.
 * Представляет точку на карте: комнату, коридор, лестницу и т.д.
 */
export interface MapNode {
  /** Уникальный идентификатор узла */
  id: string;

  /** X-координата в пикселях карты */
  x: number;

  /** Y-координата в пикселях карты */
  y: number;

  /** Номер этажа (0 = уровень кампуса) */
  floor: number;

  /** ID корпуса ("CAMPUS" для узлов кампуса) */
  building: string;

  /** Является ли узел порталом (вход, лестница, лифт) */
  isPortal: boolean;

  /** ID соседних узлов (рёбра графа) */
  neighbors: string[];
}

/**
 * Данные узла в JSON-файле (без вычисляемых полей)
 */
export interface MapNodeData {
  id: string;
  x: number;
  y: number;
  floor?: number;
  building?: string;
  isPortal?: boolean;
  neighbors?: string[];
}
