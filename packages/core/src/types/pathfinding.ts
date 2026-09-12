import type { TransitionType } from './transition.js';

/**
 * Параметры поиска пути.
 *
 * Все флаги по умолчанию разрешены (`?? true`), поэтому вызов без опций
 * ищет кратчайший путь без ограничений.
 */
export interface PathfindingOptions {
  /** Разрешены ли лестницы */
  allowStairs?: boolean;

  /** Разрешены ли лифты */
  allowLift?: boolean;

  /** Разрешены ли переходы между корпусами */
  allowBridge?: boolean;

  /** Разрешены ли входы/выходы (кампус <-> корпус) */
  allowEntrance?: boolean;

  /** Предпочитать лифт лестнице */
  preferLift?: boolean;

  /** Ограничение итераций — защита от зацикливания на битых данных */
  maxIterations?: number;
}

/**
 * Один шаг маршрута.
 */
export interface PathSegment {
  /** ID узла, из которого идёт шаг */
  fromNode: string;

  /** ID узла, в который идёт шаг */
  toNode: string;

  /** Тип перехода (null для обычного ребра на этаже) */
  transitionType: TransitionType | null;

  /**
   * Стоимость шага.
   *
   * Считается той же функцией, что и стоимость ребра в A*, поэтому сумма
   * стоимостей всех сегментов всегда равна `PathResult.totalDistance` —
   * включая режим `preferLift`, который меняет веса лестниц и лифтов.
   */
  distance: number;
}

/**
 * Результат поиска пути.
 */
export interface PathResult {
  /** Найден ли путь */
  found: boolean;

  /** Список ID узлов пути (от старта к финишу) */
  path: string[];

  /** Полная стоимость пути */
  totalDistance: number;

  /** Разбивка по шагам (только если путь найден) */
  segments?: PathSegment[];

  /** Причина, по которой путь не найден */
  error?: string;
}

/**
 * Основной путь вместе с альтернативами.
 */
export interface MultiPathResult {
  /** Основной (кратчайший) путь */
  primary: PathResult;

  /** Альтернативные пути, отсортированные по возрастанию стоимости */
  alternatives: PathResult[];
}
