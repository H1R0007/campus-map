// packages/core/src/types/pathfinding.ts

import type { TransitionType } from './transition';

/**
 * Опции поиска пути
 */
export interface PathfindingOptions {
  /** Разрешены ли лестницы */
  allowStairs?: boolean;

  /** Разрешены ли лифты */
  allowLift?: boolean;

  /** Разрешены ли переходы между корпусами */
  allowBridge?: boolean;

  /** Разрешены ли входы (кампус <-> здание) */
  allowEntrance?: boolean;

  /** Предпочитать лифт лестнице */
  preferLift?: boolean;

  /** Максимальное количество итераций (защита от зацикливания) */
  maxIterations?: number;
}

/**
 * Сегмент пути (для детальных инструкций)
 */
export interface PathSegment {
  /** ID начального узла сегмента */
  fromNode: string;

  /** ID конечного узла сегмента */
  toNode: string;

  /** Тип перехода (null если обычное ребро) */
  transitionType: TransitionType | null;

  /** Расстояние сегмента */
  distance: number;
}

/**
 * Результат поиска пути
 */
export interface PathResult {
  /** Найден ли путь */
  found: boolean;

  /** Список ID узлов пути (от начала к концу) */
  path: string[];

  /** Общая длина пути (сумма весов) */
  totalDistance: number;

  /** Детализация по сегментам */
  segments?: PathSegment[];

  /** Сообщение об ошибке (если путь не найден) */
  error?: string;
}

/**
 * Результат поиска с альтернативами
 */
export interface MultiPathResult {
  /** Основной (кратчайший) путь */
  primary: PathResult;

  /** Альтернативные пути */
  alternatives: PathResult[];
}
