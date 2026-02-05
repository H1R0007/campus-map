/**
 * Опции поиска пути
 */
export interface PathfindingOptions {
  /** Разрешены ли лестницы */
  allowStairs?: boolean;
  
  /** Разрешены ли лифты */
  allowLift?: boolean;
  
  /** Разрешены ли мосты/переходы */
  allowBridge?: boolean;
  
  /** Разрешены ли двери */
  allowDoor?: boolean;
}

/**
 * Результат поиска пути
 */
export interface PathResult {
  /** Найден ли путь */
  found: boolean;
  
  /** Список ID узлов пути (от начала к концу) */
  path: string[];
  
  /** Общая длина пути */
  totalDistance: number;
  
  /** Сообщение об ошибке (если путь не найден) */
  error?: string;
}