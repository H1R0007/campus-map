/**
 * Метаданные этажа
 */
export interface FloorMeta {
  /** Номер этажа */
  floor: number;
  
  /** Путь к изображению карты (относительно папки корпуса) */
  mapPath: string;
  
  /** Путь к файлу графа (относительно папки корпуса) */
  graphPath: string;
}

/**
 * Метаданные корпуса
 */
export interface BuildingMeta {
  /** Уникальный ID корпуса */
  id: string;
  
  /** Отображаемое имя */
  name: string;
  
  /** Список этажей */
  floors: FloorMeta[];
  
  /** Границы корпуса на карте кампуса (для определения активного корпуса) */
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Метаданные кампуса
 */
export interface CampusMeta {
  /** Список ID корпусов */
  buildings: { id: string; name?: string }[];
  
  /** Размеры карты кампуса */
  mapSize: {
    width: number;
    height: number;
  };
}