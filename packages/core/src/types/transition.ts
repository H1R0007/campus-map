/**
 * Тип перехода между узлами разных этажей/зданий
 */
export type TransitionType =
  | 'entrance' // вход/выход из корпуса (кампус <-> здание)
  | 'stairs'   // лестница
  | 'lift'     // лифт
  | 'bridge';  // переход между корпусами (надземный/подземный)

/**
 * Переход между двумя узлами
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
 * Данные перехода в JSON-файле
 */
export interface TransitionData {
  from: { node: string };
  to: { node: string };
  transition_type?: string;
}

/**
 * Все допустимые типы переходов
 */
export const TRANSITION_TYPES: TransitionType[] = ['entrance', 'stairs', 'lift', 'bridge'];

/**
 * Преобразование строки в TransitionType
 */
export function parseTransitionType(str: string): TransitionType {
  const normalized = str.toLowerCase().trim();
  switch (normalized) {
    case 'entrance':
    case 'door': // обратная совместимость
      return 'entrance';
    case 'stairs':
      return 'stairs';
    case 'lift':
    case 'elevator':
      return 'lift';
    case 'bridge':
    case 'passage':
      return 'bridge';
    default:
      return 'entrance'; // fallback
  }
}

/**
 * Человекочитаемое название типа перехода
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

/**
 * Иконка для типа перехода
 */
export function transitionTypeIcon(type: TransitionType): string {
  switch (type) {
    case 'entrance':
      return '🚪';
    case 'stairs':
      return '🪜';
    case 'lift':
      return '🛗';
    case 'bridge':
      return '🌉';
  }
}

/**
 * Цвет для типа перехода (hex)
 */
export function transitionTypeColor(type: TransitionType): string {
  switch (type) {
    case 'entrance':
      return '#f59e0b'; // amber
    case 'stairs':
      return '#22c55e'; // green
    case 'lift':
      return '#3b82f6'; // blue
    case 'bridge':
      return '#a855f7'; // purple
  }
}
