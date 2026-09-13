/**
 * Тип перехода между узлами разных этажей/зданий.
 */
export type TransitionType =
  | 'entrance' // вход/выход из корпуса (кампус <-> здание)
  | 'stairs'   // лестница
  | 'lift'     // лифт
  | 'bridge';  // переход между корпусами (надземный/подземный)

/**
 * Переход между двумя узлами.
 * Переход ненаправленный: из `fromNode` можно идти в `toNode` и обратно.
 */
export interface Transition {
  /** ID начального узла */
  fromNode: string;

  /** ID конечного узла */
  toNode: string;

  /** Тип перехода */
  type: TransitionType;
}

/**
 * Переход в том виде, в каком он лежит в `transitions.json`.
 */
export interface TransitionData {
  from: { node: string };
  to: { node: string };
  transition_type?: string;
}

/**
 * Все допустимые типы переходов.
 */
export const TRANSITION_TYPES: readonly TransitionType[] = [
  'entrance',
  'stairs',
  'lift',
  'bridge',
] as const;

/**
 * Значение по умолчанию для перехода без явно указанного типа.
 */
export const DEFAULT_TRANSITION_TYPE: TransitionType = 'entrance';

/**
 * Устаревшие названия типов из ранних версий формата.
 * Поддерживаются при чтении, но никогда не пишутся.
 */
const LEGACY_TYPE_ALIASES: Record<string, TransitionType> = {
  door: 'entrance',
  elevator: 'lift',
  passage: 'bridge',
};

const TYPE_SET = new Set<string>(TRANSITION_TYPES);

/**
 * Является ли строка каноническим названием типа перехода.
 */
export function isTransitionType(value: string): value is TransitionType {
  return TYPE_SET.has(value);
}

/**
 * Преобразование строки в TransitionType.
 *
 * Принимает и канонические названия, и устаревшие (`door`, `elevator`,
 * `passage`). Неизвестное значение приводит к `DEFAULT_TRANSITION_TYPE`,
 * а не отбрасывает переход: лучше построить маршрут через вход, чем
 * потерять связность графа из-за опечатки в данных.
 *
 * Факт замены фиксируется вызывающей стороной через `isTransitionType` —
 * загрузчик датасета собирает такие случаи в предупреждения.
 */
export function parseTransitionType(str: string): TransitionType {
  const normalized = str.toLowerCase().trim();

  if (isTransitionType(normalized)) {
    return normalized;
  }

  return LEGACY_TYPE_ALIASES[normalized] ?? DEFAULT_TRANSITION_TYPE;
}

/**
 * Человекочитаемое название типа перехода.
 */
export function transitionTypeLabel(type: TransitionType): string {
  switch (type) {
    case 'entrance':
      return 'Вход';
    case 'stairs':
      return 'Лестница';
    case 'lift':
      return 'Лифт';
    case 'bridge':
      return 'Переход';
  }
}
